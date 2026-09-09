import { useEffect, useMemo, useState } from 'react';
import { useConfig } from '../hooks/useConfig';
import { SvgIcon } from '../icons';
import type { AppConfig, Student } from '../config/types';
import { DEFAULT_STUDENT } from '../config/defaults';
import { exportConfig, importConfigFromJson } from '../config/storage';
import BasicSection from './sections/BasicSection';
import SubjectsSection from './sections/SubjectsSection';
import CurriculumSection from './sections/CurriculumSection';
import HolidaysSection from './sections/HolidaysSection';
import BottomNav from '../components/BottomNav';
import {
  ADMIN_PATH_RE,
  SUPERADMIN_PATH_RE,
  currentSearch,
  isAdminPath,
  isSuperPath,
  linkProps,
} from '../routes';
import './admin.css';

type SectionKey = 'basic' | 'subjects' | 'curriculum' | 'holidays';

interface NavItem {
  key: SectionKey;
  label: string;
  icon: Parameters<typeof SvgIcon>[0]['name'];
  hint: string;
  tone: 'grape' | 'joy' | 'grass' | 'sunshine' | 'sky' | 'rose';
}

const ALL_NAV: NavItem[] = [
  { key: 'basic', label: '基础', icon: 'pencil', hint: '标题、Logo', tone: 'grape' },
  { key: 'subjects', label: '课程库', icon: 'palette', hint: '课程与图标', tone: 'joy' },
  { key: 'curriculum', label: '课表', icon: 'calendar', hint: '节次与安排', tone: 'grass' },
  { key: 'holidays', label: '节假日', icon: 'star', hint: '放假安排', tone: 'rose' },
];

// 同一个组件挂两个路径路由:超管 /superadmin(/分区)、家长 /admin(/分区),
// 形状一致所以读写都共用下面这一套(路由约定见 src/routes.ts)
/** 缺省分区。它对应的地址是不带后缀的 /admin、/superadmin,读写两侧都以此为准 */
const DEFAULT_SECTION: SectionKey = 'basic';

const basePath = (superMode: boolean): string =>
  superMode ? '/superadmin' : '/admin';

const readSection = (superMode: boolean, allowed: SectionKey[]): SectionKey => {
  if (typeof window === 'undefined') return DEFAULT_SECTION;
  const re = superMode ? SUPERADMIN_PATH_RE : ADMIN_PATH_RE;
  const raw = (re.exec(window.location.pathname)?.[1] ?? '').trim();
  return (allowed.find(k => k === raw) as SectionKey | undefined) ?? DEFAULT_SECTION;
};

const download = (filename: string, text: string) => {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const pickFile = (): Promise<string> =>
  new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('未选择文件'));
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('读取失败'));
      reader.readAsText(file);
    };
    input.click();
  });

const genStudentId = (existing: string[]): string => {
  const taken = new Set(existing);
  for (let i = 1; i < 100; i += 1) {
    const candidate = `student${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `student-${Date.now().toString(36)}`;
};

const genDuplicateId = (base: string, existing: string[]): string => {
  const taken = new Set(existing);
  for (let i = 1; i < 100; i += 1) {
    const candidate = `${base}-copy${i > 1 ? i : ''}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-copy-${Date.now().toString(36)}`;
};

const SLUG_PATTERN = /^[a-zA-Z0-9_-]+$/;

interface AdminAppProps {
  /** 由路由层注入:清掉登录态并切回超管登录页。只有超管入口会传 */
  onLogout?: () => void;
}

export default function AdminApp({ onLogout }: AdminAppProps = {}) {
  const { config, activeStudent, update } = useConfig();
  const [superMode, setSuperMode] = useState<boolean>(isSuperPath);

  const NAV = useMemo<NavItem[]>(
    () => (superMode ? ALL_NAV : ALL_NAV.filter(n => n.key !== 'holidays')),
    [superMode],
  );
  const allowedKeys = useMemo<SectionKey[]>(() => NAV.map(n => n.key), [NAV]);

  const [section, setSection] = useState<SectionKey>(() =>
    readSection(isSuperPath(), ALL_NAV.map(n => n.key)),
  );
  const [superEditingStudentId, setSuperEditingStudentId] = useState<string>(
    () => activeStudent?.id ?? config.students[0]?.id ?? '',
  );
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const onNav = () => {
      const sm = isSuperPath();
      // 两种模式都是路径路由,都靠 popstate。不在这两个路径上说明是要离开本组件
      // (点了"返回主页"或底部导航),交给 main.tsx 换路由,这里不必再同步分区
      if (!sm && !isAdminPath()) return;
      setSuperMode(sm);
      setSection(readSection(sm, ALL_NAV.map(n => n.key)));
    };
    window.addEventListener('popstate', onNav);
    return () => window.removeEventListener('popstate', onNav);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const student = superMode
      ? config.students.find(s => s.id === superEditingStudentId) ??
        config.students[0]
      : activeStudent ?? config.students[0];
    if (!student) return;
    const pwaIcon = student.logoImage || '/avatars/avatar-01.jpg';
    const setLink = (rel: string, href: string) => {
      let el = document.querySelector(
        `link[rel="${rel}"]`,
      ) as HTMLLinkElement | null;
      if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', rel);
        document.head.appendChild(el);
      }
      el.setAttribute('href', href);
    };
    document.title = student.title;
    setLink('apple-touch-icon', pwaIcon);
    setLink('icon', pwaIcon);
  }, [config, activeStudent, superMode, superEditingStudentId]);

  useEffect(() => {
    const validSection = allowedKeys.includes(section) ? section : DEFAULT_SECTION;
    if (validSection !== section) {
      setSection(validSection);
      return;
    }
    // 只有真的停在这两个路径上才动地址栏:全新安装(0 个学生)时 main.tsx 会在根路径
    // 直接渲染本组件做"创建第一个学生"引导,那种情况下不该把地址悄悄改成 /admin
    if (!isSuperPath() && !isAdminPath()) return;
    // URL 写成 /admin(/分区) 或 /superadmin(/分区),保留 ?query 但清掉 hash。
    // 默认分区(basic)不写后缀 —— 直接访问 /admin 就该停在 /admin,而不是被立刻
    // 改写成 /admin/basic;这也让"添加到主屏幕"存下来的是最短的那个地址。
    // 切到别的分区才追加后缀,深链 /admin/curriculum 照旧可直接访问、可收藏
    const suffix = validSection === DEFAULT_SECTION ? '' : `/${validSection}`;
    const wanted = `${basePath(superMode)}${suffix}${window.location.search}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (current !== wanted) {
      window.history.replaceState(null, '', wanted);
    }
  }, [section, superMode, allowedKeys]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2400);
    return () => clearTimeout(t);
  }, [msg]);

  // 空学生列表(全新安装)时返回 null;渲染层会跳出去引导创建,不会走到常规 UI
  const editingStudent = useMemo<Student | null>(() => {
    if (config.students.length === 0) return null;
    if (superMode) {
      return (
        config.students.find(s => s.id === superEditingStudentId) ??
        config.students[0]
      );
    }
    return activeStudent ?? config.students[0];
  }, [config, superMode, superEditingStudentId, activeStudent]);

  useEffect(() => {
    if (
      superMode &&
      !config.students.some(s => s.id === superEditingStudentId)
    ) {
      setSuperEditingStudentId(config.students[0]?.id ?? '');
    }
  }, [config, superMode, superEditingStudentId]);

  const applyGlobal = (patch: Partial<AppConfig>) => {
    update({ ...config, ...patch });
  };

  const applyStudentPatch = (patch: Partial<Student>) => {
    if (!editingStudent) return; // 空态时不会走到这里,只是让 TS 收窄
    update({
      ...config,
      students: config.students.map(s =>
        s.id === editingStudent.id ? { ...s, ...patch } : s,
      ),
    });
  };

  const addStudent = () => {
    const existingIds = config.students.map(s => s.id);
    const id = genStudentId(existingIds);
    const nextIndex = config.students.length + 1;
    const newStudent: Student = {
      ...DEFAULT_STUDENT,
      id,
      title: `学生${nextIndex} · 课程表`,
    };
    update({
      ...config,
      students: [...config.students, newStudent],
    });
    setSuperEditingStudentId(id);
    setMsg({ tone: 'ok', text: `已添加学生 · 学生 ID ${id}` });
  };

  const removeStudent = (id: string) => {
    if (config.students.length <= 1) return;
    if (!window.confirm('确定删除该学生？其所有课表数据将被清除。')) return;
    const next = config.students.filter(s => s.id !== id);
    update({
      ...config,
      students: next,
    });
    if (superEditingStudentId === id) setSuperEditingStudentId(next[0].id);
    setMsg({ tone: 'ok', text: '学生已删除' });
  };

  const duplicateStudent = (id: string) => {
    const src = config.students.find(s => s.id === id);
    if (!src) return;
    const existingIds = config.students.map(s => s.id);
    const newId = genDuplicateId(src.id, existingIds);
    const copy: Student = { ...src, id: newId, title: `${src.title}(副本)` };
    update({
      ...config,
      students: [...config.students, copy],
    });
    setSuperEditingStudentId(newId);
    setMsg({ tone: 'ok', text: `已复制 · 学生 ID ${newId}` });
  };

  const changeStudentId = (oldId: string, rawNewId: string): string | null => {
    const newId = rawNewId.trim();
    if (!newId || newId === oldId) return null;
    if (!SLUG_PATTERN.test(newId)) return '只能包含英文、数字、- 或 _';
    if (config.students.some(s => s.id === newId)) return '已被其他学生使用';
    update({
      ...config,
      students: config.students.map(s =>
        s.id === oldId ? { ...s, id: newId } : s,
      ),
    });
    if (superEditingStudentId === oldId) setSuperEditingStudentId(newId);
    return null;
  };

  const handleExport = () => {
    download(`schedule-config-${Date.now()}.json`, exportConfig(config));
    setMsg({ tone: 'ok', text: '已导出 JSON' });
  };

  const handleImport = async () => {
    try {
      const text = await pickFile();
      const next = importConfigFromJson(text);
      update(next);
      setMsg({ tone: 'ok', text: '已导入并保存' });
    } catch (e) {
      setMsg({
        tone: 'err',
        text: e instanceof Error ? e.message : '导入失败',
      });
    }
  };

  const activeNav = NAV.find(n => n.key === section) ?? NAV[0];

  // 全新安装或用户删完所有学生:显示欢迎引导页,让用户创建第一个学生
  if (!editingStudent) {
    return (
      <div className="admin-onboarding-wrap">
        <div className="admin-onboarding">
          <div className="admin-onboarding-icon">
            <img src="/entrance-icon.png" alt="" className="admin-onboarding-icon-img" />
          </div>
          <h1 className="admin-onboarding-title">欢迎!先创建一个学生</h1>
          <button
            type="button"
            className="admin-onboarding-cta"
            onClick={addStudent}
          >
            <SvgIcon name="plus" size={18} />
            <span>创建第一个学生</span>
          </button>
          {onLogout && (
            <button
              type="button"
              className="admin-onboarding-logout"
              onClick={onLogout}
            >
              退出登录
            </button>
          )}
        </div>
        {msg && (
          <div className={`admin-toast admin-toast-${msg.tone}`}>
            {msg.text}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`admin-app${superMode ? ' admin-app-super' : ''}`}>
      <header className="admin-hero">
        <div className="admin-hero-main">
          <span className="admin-hero-icon app-title-icon">
            {editingStudent.logoImage ? (
              <img
                src={editingStudent.logoImage}
                alt=""
                className="app-title-logo-img"
              />
            ) : (
              <SvgIcon name={editingStudent.logoIcon} size={26} />
            )}
          </span>
          <div className="admin-hero-text">
            <h1 className="admin-hero-title">{editingStudent.title}</h1>
            <button
              type="button"
              className="admin-hero-id"
              title={`学生 ID:${editingStudent.id}(点击复制)`}
              onClick={() => {
                if (typeof navigator === 'undefined') return;
                navigator.clipboard?.writeText(editingStudent.id).catch(() => {
                  /* 忽略复制失败,不打扰用户 */
                });
              }}
            >
              <span className="admin-hero-id-key">ID</span>
              <span className="admin-hero-id-value">{editingStudent.id}</span>
            </button>
            {superMode && (
              <div className="admin-hero-meta">
                <span className="admin-hero-chip admin-hero-chip-joy">
                  <SvgIcon name="users" size={12} />
                  {config.students.length} 位学生
                </span>
                <span className="admin-hero-chip admin-hero-chip-rose">
                  <SvgIcon name="star" size={12} />
                  {config.holidays.length} 个节假日
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="admin-hero-actions">
          {superMode && (
            <button
              type="button"
              className="admin-hero-btn admin-hero-btn-grape"
              onClick={handleImport}
              title="导入 JSON"
            >
              <SvgIcon name="upload" size={16} />
              <span>导入</span>
            </button>
          )}
          {superMode && (
            <button
              type="button"
              className="admin-hero-btn admin-hero-btn-sunshine"
              onClick={handleExport}
              title="导出 JSON"
            >
              <SvgIcon name="download" size={16} />
              <span>导出</span>
            </button>
          )}
          {superMode && onLogout && (
            <button
              type="button"
              className="admin-hero-btn admin-hero-btn-rose"
              onClick={onLogout}
              title="退出超管登录"
            >
              <SvgIcon name="logout" size={16} />
              <span>退出登录</span>
            </button>
          )}
          {/* 超管入口无"主页"概念,不显示返回主页按钮;家长模式的 /admin 才有。
              /admin 是独立路径,回主页要写完整的 / + ?id=,不能只给 '#today' —— 那样
              只是给 /admin 加个 hash,人还留在后台里 */}
          {!superMode && (
            <a
              className="admin-hero-home"
              {...linkProps(`/${currentSearch()}#today`)}
              title="返回主页"
            >
              <span className="admin-hero-home-dot" aria-hidden />
              <span className="admin-hero-home-text">
                <span className="admin-hero-home-label">返回主页</span>
                <span className="admin-hero-home-hint">切回今日</span>
              </span>
            </a>
          )}
        </div>
      </header>

      {msg && (
        <div className={`admin-toast admin-toast-${msg.tone}`}>{msg.text}</div>
      )}

      <div className="admin-body">
        <aside className="admin-side">
          {superMode && (
            <div className="admin-student-switcher">
              <div className="admin-student-switcher-label">当前编辑</div>
              <select
                className="admin-input admin-student-select"
                value={editingStudent.id}
                onChange={e => setSuperEditingStudentId(e.target.value)}
              >
                {config.students.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
              <div className="admin-student-actions">
                <button
                  type="button"
                  className="admin-btn admin-btn-mini admin-btn-grass"
                  onClick={addStudent}
                  title="新增学生"
                >
                  <SvgIcon name="plus" size={12} /> 新增
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-mini admin-btn-grape"
                  onClick={() => duplicateStudent(editingStudent.id)}
                  title="复制当前"
                >
                  复制
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-mini admin-btn-danger"
                  onClick={() => removeStudent(editingStudent.id)}
                  disabled={config.students.length <= 1}
                  title="删除该学生"
                >
                  <SvgIcon name="trash" size={12} /> 删除
                </button>
              </div>
              <div className="admin-student-url">
                学生 ID <code>{editingStudent.id}</code>
              </div>
            </div>
          )}

          <nav
            className="admin-nav"
            aria-label="管理导航"
            style={{ gridTemplateColumns: `repeat(${NAV.length}, minmax(0, 1fr))` }}
          >
            {NAV.map(n => {
              const active = n.key === section;
              return (
                <button
                  key={n.key}
                  type="button"
                  className={`admin-nav-item admin-nav-item-${n.tone}${active ? ' admin-nav-item-active' : ''}`}
                  onClick={() => setSection(n.key)}
                >
                  <span className="admin-nav-icon">
                    <SvgIcon name={n.icon} size={18} />
                  </span>
                  <span className="admin-nav-text">
                    <span className="admin-nav-label">{n.label}</span>
                    <span className="admin-nav-hint">{n.hint}</span>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="admin-main">
          <div className={`admin-main-hero admin-main-hero-${activeNav.tone}`}>
            <div className="admin-main-hero-icon">
              <SvgIcon name={activeNav.icon} size={22} />
            </div>
            <div>
              <div className="admin-main-hero-label">{activeNav.hint}</div>
              <h2 className="admin-main-hero-title">{activeNav.label}</h2>
            </div>
          </div>

          {section === 'basic' && (
            <BasicSection
              student={editingStudent}
              onChange={applyStudentPatch}
              siblingIds={config.students.filter(s => s.id !== editingStudent.id).map(s => s.id)}
              onChangeId={next => changeStudentId(editingStudent.id, next)}
              isFirstStudent={config.students[0]?.id === editingStudent.id}
              superMode={superMode}
            />
          )}
          {section === 'subjects' && (
            <SubjectsSection student={editingStudent} onChange={applyStudentPatch} />
          )}
          {section === 'curriculum' && (
            <CurriculumSection student={editingStudent} onChange={applyStudentPatch} />
          )}
          {section === 'holidays' && superMode && (
            <HolidaysSection config={config} onChange={applyGlobal} />
          )}
        </section>
      </div>

      <footer className="app-footer">
        <SvgIcon name="book" size={16} />
        <span>好好学习，天天向上</span>
      </footer>

      {superMode ? (
        // 超管场景:底部菜单即 4 个 section,切当前编辑学生的对应设置面板
        <nav
          className="bottom-nav"
          aria-label="超管导航"
          style={{ gridTemplateColumns: `repeat(${NAV.length}, 1fr)` }}
        >
          {NAV.map(n => {
            const active = n.key === section;
            return (
              <button
                key={n.key}
                type="button"
                onClick={() => setSection(n.key)}
                className={`nav-item nav-item-${n.tone}${active ? ' nav-item-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <span className="nav-icon">
                  <SvgIcon name={n.icon} size={22} />
                </span>
                <span className="nav-label">{n.label}</span>
              </button>
            );
          })}
        </nav>
      ) : (
        <BottomNav />
      )}
    </div>
  );
}
