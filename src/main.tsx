import { StrictMode, Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
// 中文字形只服务墨水屏,不做全局统一:普通设备(手机/电脑)的正文仍用各自系统字体。
// 思源黑体可变字体(Noto Sans SC Variable)在此引入进构建产物,但 font-family 仅在
// 墨水屏主题(.board-app-ink)里被引用 —— 按 unicode-range 切片,浏览器只在真正渲染
// 墨水屏、且出现对应汉字时才下载相应分片,普通页面不会加载这 4.8M 的中文字体。
// 数字/时间的等宽体用 JetBrains Mono(拉丁字符、体积很小,家族名与既有 mono 栈一致),
// 保持全端一致的数字观感。字体在构建期编译进 dist,服务端仍是零运行时依赖。
import '@fontsource-variable/noto-sans-sc';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
import './index.css';
import App from './App.tsx';
import EntranceGate from './EntranceGate.tsx';
// 学生/家长主页(App)与入口页最常访问,保持同步引入直接进首屏;
// 管理后台与看板是各自独立、较少访问的大块,懒加载拆成单独 chunk,
// 让普通访问者的首包不再背上后台编辑器与看板的代码
const AdminApp = lazy(() => import('./admin/AdminApp.tsx'));
const BoardApp = lazy(() => import('./BoardApp.tsx'));
const SuperadminAuth = lazy(() => import('./admin/SuperadminAuth.tsx'));
import { hasCredentials, loadSession, logout } from './admin/authStorage.ts';
import { CONFIG_UPDATED_EVENT, loadConfig } from './config/storage.ts';
import { bootstrap, startRevisionPolling } from './api/client.ts';
import { migrateLegacyData, needsMigration } from './api/migrate.ts';
import { isAdminPath, isBoardPath, isSuperPath } from './routes.ts';

type RouteMode = 'board' | 'admin' | 'superadmin' | 'app';

// 家长后台、看板、超管都是 pathname 路径路由(约定见 src/routes.ts):便于直接访问、
// 唯一化,更要紧的是"添加到主屏幕"的启动地址来自 manifest.start_url,而服务端只看得见
// path+search、看不见 hash,存成 #admin 的快捷方式点开必然退回主页。

const detectMode = (): RouteMode => {
  if (typeof window === 'undefined') return 'app';
  if (isSuperPath()) return 'superadmin';
  if (isBoardPath()) return 'board';
  if (isAdminPath()) return 'admin';
  return 'app';
};

const readStudentId = (): string => {
  if (typeof window === 'undefined') return '';
  const p = new URLSearchParams(window.location.search);
  // 主参数 ?id=,兼容读取历史链接的 ?student= / ?child=
  const s = p.get('id') ?? p.get('student') ?? p.get('child');
  return s ? s.trim() : '';
};

const hasStudentParam = (): boolean => readStudentId().length > 0;

// 兼容旧的 hash 链接:静默重写为对应路径,老书签/已存在的桌面快捷方式仍能进,
// 同时地址栏立刻更新为唯一的新格式(?id= 等查询参数原样保留)
const LEGACY_HASH_RE = /^#(superadmin|admin|board)(?:\/(.*))?$/;
if (typeof window !== 'undefined') {
  const legacy = LEGACY_HASH_RE.exec(window.location.hash);
  const alreadyOnPath = { superadmin: isSuperPath, admin: isAdminPath, board: isBoardPath };
  if (legacy && !alreadyOnPath[legacy[1] as keyof typeof alreadyOnPath]()) {
    const base = `/${legacy[1]}`;
    const section = (legacy[2] ?? '').trim();
    // 看板没有分区;admin / superadmin 的分区原样带过去,由 AdminApp 校验并归一化
    const target = legacy[1] === 'board' || !section ? base : `${base}/${section}`;
    window.history.replaceState(null, '', target + window.location.search);
  }
}

// 锁定初始 title,避免 index.html 静态标题与 useEffect 之间的一次跳变。
// 依赖 loadConfig() 里的服务端数据,因此要等 bootstrap() 完成后才能调用,见 start()。
const applyInitialTitle = () => {
  if (typeof document === 'undefined') return;
  if (isSuperPath()) {
    document.title = hasCredentials() ? '超管登录' : '首次配置 · 超管';
  } else if (hasStudentParam()) {
    // 有 ?id= 时,尝试从配置里找到对应学生并直接设为其标题,避免闪一下"课程表 · 家校助手"
    try {
      const id = readStudentId();
      const cfg = loadConfig();
      const s = cfg.students.find(x => x.id === id);
      // 看板要带上后缀,和 BoardApp / 服务端注入的标题保持一致,否则会先闪一下没后缀的
      if (s) document.title = isBoardPath() ? `${s.title} · 看板` : s.title;
    } catch {
      /* ignore */
    }
  } else {
    document.title = '课程表 · 家校助手';
  }
};

// APP 级体验:禁止移动端双指缩放和双击缩放
if (typeof document !== 'undefined') {
  // iOS Safari 忽略 viewport user-scalable=no,需要 JS 显式阻止手势
  const preventGesture = (e: Event) => e.preventDefault();
  document.addEventListener('gesturestart', preventGesture);
  document.addEventListener('gesturechange', preventGesture);
  document.addEventListener('gestureend', preventGesture);
  // 双击缩放:两次 touchend 间隔 <300ms 触发,拦截即可
  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd < 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    },
    { passive: false },
  );
}

function Root() {
  const [mode, setMode] = useState<RouteMode>(detectMode);
  const [rawId, setRawId] = useState<string>(readStudentId);
  const [initialized, setInitialized] = useState<boolean>(hasCredentials);
  const [authed, setAuthed] = useState<boolean>(loadSession);
  const [studentIds, setStudentIds] = useState<string[]>(() =>
    loadConfig().students.map(s => s.id),
  );

  useEffect(() => {
    const onNav = () => {
      setMode(detectMode());
      setRawId(readStudentId());
    };
    window.addEventListener('hashchange', onNav);
    window.addEventListener('popstate', onNav);
    return () => {
      window.removeEventListener('hashchange', onNav);
      window.removeEventListener('popstate', onNav);
    };
  }, []);

  useEffect(() => {
    // 配置变化(本机保存或轮询发现别的设备改了)都会广播这个事件,不再需要 storage 事件
    const refresh = () => setStudentIds(loadConfig().students.map(s => s.id));
    window.addEventListener(CONFIG_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(CONFIG_UPDATED_EVENT, refresh);
  }, []);

  const handleAuthed = () => {
    setInitialized(hasCredentials());
    setAuthed(true);
    // 首次 setup 完成后可能已切到 /superadmin,触发一次 mode 同步
    setMode(detectMode());
  };

  // 退出登录:先乐观切回登录页,再异步告知服务端清掉会话 Cookie
  const handleLogout = () => {
    setAuthed(false);
    void logout();
  };

  // 超管路由:未初始化走 Setup,已初始化未登录走登录
  // 注意只拦这一个路由 —— 凭据存在服务端,收到分享链接的家长打开 /admin 不受影响,
  // 只有主动访问 /superadmin 才会被要求登录
  if (mode === 'superadmin') {
    if (!initialized || !authed) {
      return <SuperadminAuth onAuthed={handleAuthed} />;
    }
    return <AdminApp onLogout={handleLogout} />;
  }

  // 全新安装 / 尚未创建任何学生:统一引导去超管
  //   - 未设过账号密码 → 先 Setup
  //   - 已设过但未登录 → 登录
  //   - 已登录 → 直接进 AdminApp,由它显示"创建第一个学生"空态引导
  if (studentIds.length === 0) {
    if (!initialized || !authed) {
      return <SuperadminAuth onAuthed={handleAuthed} />;
    }
    return <AdminApp onLogout={handleLogout} />;
  }

  // 常规访问需要 ?id= 参数,且 ID 必须匹配实际学生
  if (!rawId) return <EntranceGate />;
  if (!studentIds.includes(rawId)) {
    return (
      <EntranceGate initialId={rawId} errorText={`未找到 ID 为「${rawId}」的学生`} />
    );
  }

  if (mode === 'board') return <BoardApp />;
  // 家长免密入口,但 showAdmin 关闭时必须真正拒绝(此前仅隐藏侧边栏入口,
  // 手敲 /admin/curriculum 仍可改课表)
  if (mode === 'admin') {
    const student = loadConfig().students.find(s => s.id === rawId);
    if (student?.showAdmin === false && !authed) {
      return <App />;
    }
    return <AdminApp />;
  }
  return <App />;
}

/** bootstrap / 迁移期间的极简占位,避免闪一下"首次配置"或空课表 */
function Splash({ text }: { text: string }) {
  return (
    <div className="boot-screen">
      <div className="boot-spinner" />
      <p className="boot-text">{text}</p>
    </div>
  );
}

function BootError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="boot-screen">
      <p className="boot-title">连不上服务器</p>
      <p className="boot-text">{message}</p>
      <p className="boot-hint">
        数据现在保存在服务端,拿不到数据就先不进入应用 —— 否则会用一份空白默认配置
        把服务器上的课表覆盖掉。请确认服务是否在运行,然后重试。
      </p>
      <button type="button" className="boot-retry" onClick={onRetry}>
        重试
      </button>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);

const start = async () => {
  root.render(<Splash text="正在载入…" />);
  const result = await bootstrap();
  if (!result.ok) {
    root.render(
      <BootError message={result.error ?? '未知错误'} onRetry={() => void start()} />,
    );
    return;
  }
  // 老用户曾把数据存在这台浏览器里,首次打开新版时搬到服务端(只搬一次)
  if (needsMigration()) {
    root.render(<Splash text="正在把本机旧数据迁移到服务器…" />);
    await migrateLegacyData();
  }
  applyInitialTitle();
  startRevisionPolling();
  root.render(
    <StrictMode>
      {/* 懒加载的后台/看板 chunk 加载期间显示占位,避免白屏 */}
      <Suspense fallback={<Splash text="正在载入…" />}>
        <Root />
      </Suspense>
    </StrictMode>,
  );
};

void start();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      /* PWA offline cache is optional */
    });
  });
}
