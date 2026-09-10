/**
 * 课程表 · 家校助手 —— 一体化服务端。
 *
 * 一个进程干三件事:
 * 1. 托管前端构建产物 dist/
 * 2. /api/* 读写 DATA_DIR 下的数据文件(课表配置、备忘、附件、超管账号)
 * 3. 反代天气与节假日,解决浏览器跨域与家庭网络连不上 GitHub 的问题
 *
 * 安全边界(务必了解):课表配置与备忘的写接口不校验登录,与改造前"数据存在浏览器
 * 本地、谁打开都能改"的行为一致 —— 家长走 /admin 是免密入口,看板页也要写备忘。
 * 登录只用于 /superadmin 管理界面。因此本服务只建议部署在家庭内网/局域网,
 * 若要暴露到公网,请在前面套一层反向代理做整体鉴权。
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticHandler, sendFile } from './static.mjs';
import { fetchHolidays, proxyNmc } from './upstream.mjs';
import * as store from './store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 21873);
const HOST = process.env.HOST || '0.0.0.0';
const STATIC_DIR = path.resolve(process.env.STATIC_DIR || path.join(__dirname, '..', 'dist'));
/** 配置里含 base64 头像/图标,备忘里含 base64 图片,上限给足 */
const JSON_LIMIT = Number(process.env.MAX_JSON_MB || 64) * 1024 * 1024;
const UPLOAD_LIMIT = Number(process.env.MAX_UPLOAD_MB || 512) * 1024 * 1024;
/** 头像上传上限:裁剪压缩后本就很小,给 16MB 足够,也挡住有人拿它当大文件桶 */
const AVATAR_LIMIT = 16 * 1024 * 1024;
/** 刚上传但还没保存进备忘的附件,在这个宽限期内不会被回收 */
const PRUNE_GRACE_MS = Number(process.env.PRUNE_GRACE_HOURS || 6) * 60 * 60 * 1000;
const SESSION_COOKIE = 'kb_sid';
/**
 * 对外访问的根地址(协议+域名+端口),用来把 og:image / og:url 拼成绝对 URL ——
 * 微信/QQ 抓图文卡片时相对路径抓不到,必须绝对。反代后面服务端看到的 Host 往往不是
 * 用户实际访问的域名,所以优先用显式配置的 PUBLIC_ORIGIN(如 https://kcb.uzuy.cn:88),
 * 没配才退回按请求头(X-Forwarded-Proto/Host)推断。
 */
const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN || '').trim().replace(/\/+$/, '');

/* 声明在 createStaticHandler 之后赋值,避免循环:见文件下方 injectPageHead */
let serveStatic;

/* ------------------------------ 基础工具 ------------------------------ */

const sendJson = (res, status, payload) => {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    // API 响应绝不能被缓存,否则改完课表刷新还是旧的
    'Cache-Control': 'no-store',
  });
  res.end(body);
};

const readBody = (req, limit) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        reject(Object.assign(new Error('请求体过大'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

const readJsonBody = async (req, limit = JSON_LIMIT) => {
  const buf = await readBody(req, limit);
  if (buf.length === 0) throw Object.assign(new Error('请求体为空'), { status: 400 });
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw Object.assign(new Error('请求体不是合法 JSON'), { status: 400 });
  }
};

const parseCookies = (header) => {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
};

/** 会话 Cookie 不设 Max-Age:关掉浏览器即失效,与改造前用 sessionStorage 的行为一致 */
const sessionCookie = (token) =>
  `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax`;
const clearedCookie = () =>
  `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

const currentToken = (req) => parseCookies(req.headers.cookie)[SESSION_COOKIE] || '';

const asString = (v) => (typeof v === 'string' ? v : '');

/**
 * 浏览器发起跨站请求时(哪怕是不用预检的"简单请求")也会带上 Origin 头,
 * 非浏览器客户端(curl/脚本)大多不带 —— 那不在 CSRF 威胁模型内,放过。
 * 用来挡"家里人开着课程表页面,同时逛到的恶意网页悄悄提交 /api/config、/api/auth/setup"这类攻击。
 */
const isSameOrigin = (req) => {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers.host;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
};

/**
 * 拼出本次请求对应的对外根地址。优先用显式配置的 PUBLIC_ORIGIN;否则按请求头推断
 * (支持反代常见的 X-Forwarded-Proto / X-Forwarded-Host)。都拿不到就返回空串,
 * 此时 og:image / og:url 保持相对路径 —— 微信抓不到卡片,但页面本身不受影响。
 */
const resolveOrigin = (req) => {
  if (PUBLIC_ORIGIN) return PUBLIC_ORIGIN;
  const proto = (asString(req.headers['x-forwarded-proto']).split(',')[0].trim()) || 'http';
  const host =
    asString(req.headers['x-forwarded-host']).split(',')[0].trim() || asString(req.headers.host);
  return host ? `${proto}://${host}` : '';
};

/** 把站内路径补成对外绝对 URL(已是 http(s) 的原样返回;没有 origin 就退回原值) */
const absoluteUrl = (origin, pathOrUrl) => {
  if (!pathOrUrl) return '';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (!origin) return pathOrUrl;
  return origin + (pathOrUrl[0] === '/' ? pathOrUrl : `/${pathOrUrl}`);
};

/**
 * 附件的 mime 是调用方随意传的查询参数,前端"文件"入口不限类型,手机拍的视频/录音/
 * HEIC 照片、Word/PDF 等文档的真实 mime 五花八门,没法靠白名单枚举全 —— 枚举不全就会把
 * 合法附件也降级成"下载不了看不了"。改成只挡"直接打开会被浏览器当代码/脚本执行"的
 * 那一小撮类型(text/html、image/svg+xml 等),配合 X-Content-Type-Options: nosniff,
 * 其余类型原样放行,既堵住存储型 XSS,又不影响正常附件预览播放。
 * 顺带校验 mime 的基本语法:格式不对(可能带控制字符)的也降级,避免写进 meta 后
 * 响应头写入失败,导致这个附件之后永远读不出来。
 */
const DANGEROUS_MIME = new Set([
  'text/html', 'application/xhtml+xml',
  'image/svg+xml',
  'text/xml', 'application/xml', 'application/xslt+xml',
  'application/javascript', 'text/javascript', 'application/x-javascript', 'application/ecmascript',
  'application/x-shockwave-flash',
]);
const MIME_TOKEN_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;
const sanitizeMime = (mime) => {
  const base = asString(mime).split(';')[0].trim().toLowerCase();
  if (!MIME_TOKEN_RE.test(base) || DANGEROUS_MIME.has(base)) return 'application/octet-stream';
  return base;
};

/**
 * 头像只收这几种位图格式(store.AVATAR_EXT 的键)。SVG 能内嵌脚本,不进头像;
 * 认不出的类型返回空串,上传直接拒掉。
 */
const AVATAR_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const avatarMime = (raw) => {
  const base = asString(raw).split(';')[0].trim().toLowerCase();
  return AVATAR_MIME.has(base) ? base : '';
};

/* --------------------------- 动态 manifest --------------------------- */
/**
 * iOS/Android"添加到主屏幕"生成的快捷方式,启动 URL 取自 manifest.start_url。
 * 静态 manifest 固定 start_url:"/",快捷方式打开就丢掉 ?id=xxx 等参数、退回入口页。
 * 这里按请求 query 里的 start 动态生成 start_url —— 前端(index.html)把当前页的
 * pathname+search+hash 编码进 ?start= 传过来。用真实同源 URL 而非 data:/blob:,
 * 因为 iOS 的添加流程读 data: manifest 时无法把相对 start_url 解析到正确基地址。
 */
const sanitizeStartUrl = (raw) => {
  const s = asString(raw);
  // 只收站内绝对路径:必须单个 / 开头,挡掉 //host、/\host 这类协议相对跳转。
  // 连百分号编码形式(/%2f、/%5c)一起挡掉 —— 宽松的 URL 解析器可能先解码再分析
  // authority,那就又变成了跳外站
  if (!s || s[0] !== '/' || s[1] === '/' || s[1] === '\\') return '/';
  if (/^\/%(2f|5c)/i.test(s)) return '/';
  // 控制字符非法(避免写进响应体/被 iOS 判为坏 manifest)
  // eslint-disable-next-line no-control-regex -- 这里的意图就是匹配控制字符
  if (/[\u0000-\u001f\u007f]/.test(s)) return '/';
  if (s.length > 1024) return '/';
  return s;
};

/* --------------------------- 页面标题解析 --------------------------- */
/**
 * 还原"这个地址在浏览器里会显示成什么标题",让桌面快捷方式的名称与页面标题一致。
 * 规则必须跟前端对齐,否则会出现"图标名称和打开后的标题不是一个"的割裂感:
 *   src/App.tsx(/)、src/admin/AdminApp.tsx(/admin) → student.title
 *   src/BoardApp.tsx                     → `${student.title} · 看板`
 *   src/admin/SuperadminAuth.tsx         → 超管登录 / 首次配置 · 超管
 *   src/EntranceGate.tsx                 → 课程表 · 家校助手
 */
const DEFAULT_TITLE = '课程表 · 家校助手';
const BOARD_PATH_RE = /^\/board(?:\/.*)?$/;
const SUPERADMIN_PATH_RE = /^\/superadmin(?:\/.*)?$/;

/** 与前端 readStudentId 一致:主参数 ?id=,兼容历史链接的 ?student= / ?child= */
const studentIdFrom = (search) => {
  const p = new URLSearchParams(asString(search));
  return (p.get('id') ?? p.get('student') ?? p.get('child') ?? '').trim();
};

const resolveTitle = async (urlPath, search) => {
  const id = studentIdFrom(search);
  const titles = id ? await store.studentTitles() : null;
  const studentTitle = titles?.get(id) || '';

  if (SUPERADMIN_PATH_RE.test(urlPath)) {
    // 已登录的超管界面标题跟着当前学生走,但服务端拿不到"正在编辑哪个学生",
    // 只能给登录/首配那两个确定的标题
    return (await store.hasCredentials()) ? '超管登录' : '首次配置 · 超管';
  }
  if (!studentTitle) return DEFAULT_TITLE;
  return BOARD_PATH_RE.test(urlPath) ? `${studentTitle} · 看板` : studentTitle;
};

/* --------------------------- 分享描述解析 --------------------------- */
/**
 * 微信/QQ 卡片的描述(og:description)。优先用后台为该学生填的 shareDescription;
 * 没填就按标题自动生成一句,始终有个像样的兜底,不至于是空的或通用占位。
 */
const DEFAULT_SHARE_DESC = '小学课程表 · 天气 · 备忘录';

const resolveDescription = async (search) => {
  const id = studentIdFrom(search);
  if (!id) return DEFAULT_SHARE_DESC;
  const desc = (await store.studentDescriptions()).get(id) || '';
  if (desc) return desc;
  const title = (await store.studentTitles()).get(id) || '';
  return title ? `${title} · 今日课程与备忘` : DEFAULT_SHARE_DESC;
};

/* --------------------------- 主屏图标解析 --------------------------- */
/**
 * 解析某个学生的主屏图标,给 <head>(apple-touch-icon / icon)与 manifest 共用一份。
 *
 * 为什么要在服务端注入,而不能只靠 App.tsx 里那次 useEffect 改 apple-touch-icon:
 * 跟标题、manifest 是同一个时序问题 —— "添加到主屏幕"的预览图标取自页面加载那一刻
 * markup 里的 apple-touch-icon,JS 事后再改,预览往往已经抓走了旧值(markup 里写死的
 * 是 /entrance-icon.png,更早访问过时 iOS 还会显示它缓存下来的上一张图,于是预览停在旧图)。
 * 服务端把当前学生的图标直接写进 markup,预览从第一个字节起就是对的。
 *
 * 图标形态有两种:
 * - 站内路径(/avatars/xx.jpg,预设或默认;或 /api/avatar/xxx.jpg 用户上传):直接用。
 *   换预设时路径变,URL 一变 iOS 的图标缓存自然失效,预览会跟着更新。
 * - 上传的 base64 data URI(老配置遗留):不塞进 markup/manifest(体积大,且 iOS/安卓对 data:
 *   图标支持都不稳),改指向 /api/icon?id=&v=<配置版本> 由服务端解码返回;带上版本号,
 *   换图标后 URL 变、iOS 才肯重新拉,不再显示缓存里的旧图。
 * 没有学生或没设图标时回退 /entrance-icon.png(应用入口图,和 index.html 里的 icon 一致)。
 */
const ICON_FALLBACK = { href: '/entrance-icon.png', type: 'image/png', maskable: false };

const mimeFromPath = (p) => {
  const s = p.toLowerCase();
  if (s.endsWith('.svg')) return 'image/svg+xml';
  if (s.endsWith('.png')) return 'image/png';
  if (s.endsWith('.jpg') || s.endsWith('.jpeg')) return 'image/jpeg';
  if (s.endsWith('.webp')) return 'image/webp';
  if (s.endsWith('.gif')) return 'image/gif';
  return '';
};

// 站内静态图标路径的安全形态:/ 开头、第二个字符是普通字符(挡掉 //host、/\host),
// 全程只允许字母数字和 -._/ —— 这样直接拼进 HTML 属性值不会引入引号/尖括号注入。
const SAFE_ICON_PATH_RE = /^\/[A-Za-z0-9][\w\-./]*$/;

const resolveIcon = async (search) => {
  const id = studentIdFrom(search);
  if (!id) return ICON_FALLBACK;
  const raw = (await store.studentIcons()).get(id) || '';
  if (!raw) return ICON_FALLBACK;
  if (/^data:/i.test(raw)) {
    // data URI 走接口,拼上配置版本做缓存击穿
    const v = store.revisions().config;
    return { href: `/api/icon?id=${encodeURIComponent(id)}&v=${v}`, type: '', maskable: false };
  }
  if (SAFE_ICON_PATH_RE.test(raw)) {
    return { href: raw, type: mimeFromPath(raw), maskable: false };
  }
  // 外链或形态可疑的路径:不冒险注入,回退默认图标
  return ICON_FALLBACK;
};

/** 标题来自用户填的配置,进 HTML 前必须转义,否则 < & " 会把 head 拆坏 */
const escapeHtml = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const buildManifest = (startUrl, title, icon) => {
  // 单一图标:有学生自定义头像就用头像,否则用应用入口图 entrance-icon.png。
  // 不标 maskable —— 头像(照片)被裁圆或圆角会切到脸/关键内容;entrance-icon 也是完整
  // 位图,不适合系统裁切遮罩。安卓拿到的 PWA 图标仍能正常显示,只是不做自适应遮罩。
  const iconEntry = icon && icon.href !== ICON_FALLBACK.href
    ? {
        src: icon.href,
        sizes: 'any',
        ...(icon.type ? { type: icon.type } : {}),
        purpose: 'any',
      }
    : { src: '/entrance-icon.png', sizes: 'any', type: 'image/png', purpose: 'any' };
  return JSON.stringify({
    // 安卓"添加到主屏幕"的图标名称取 short_name(没有才退回 name),
    // 两个都给成页面标题,快捷方式名称才和标题一致
    name: title,
    short_name: title,
    description: '小学课程表 + 天气 + 备忘录',
    start_url: startUrl,
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f6f8fc',
    theme_color: '#4c6ef5',
    lang: 'zh-CN',
    icons: [iconEntry],
  });
};

/**
 * 按"本次请求的地址"改写 index.html 的 head:manifest 链接的 ?start= 、页面标题、
 * 以及 iOS 用来命名主屏图标的 apple-mobile-web-app-title。
 *
 * 为什么必须在服务端做,而不能只靠前端那段同步脚本:
 * manifest 链接与 title 在 <head> 里都排在脚本之前,HTML 解析到它们的那一刻浏览器就
 * 把值取走了。之后 JS 再改,对"添加到主屏幕"这种系统级流程往往已经晚了 —— 系统拿到的
 * 仍是 markup 里那个不带参数的 /manifest.webmanifest(start_url 是 "/",快捷方式永远
 * 只打开主页)和那个通用标题。服务端改写让 markup 一开始就是对的,不存在时序问题。
 *
 * hash 不会发给服务端,只能由前端脚本在加载后补(iOS 不会为此重读 manifest,所以 hash
 * 实际保不住)。这正是看板从 #board 改成真实路径 /board 的原因 —— 路径服务端看得见,
 * 常亮看板的快捷方式在所有平台都能一键直达。
 */
const MANIFEST_LINK_RE = /<link\b[^>]*\brel=["']?manifest["']?[^>]*>/i;
const TITLE_RE = /<title>[\s\S]*?<\/title>/i;
const APPLE_TITLE_RE = /<meta\b[^>]*\bname=["']?apple-mobile-web-app-title["']?[^>]*>/i;
// rel="icon" 与 rel="apple-touch-icon" 分开匹配:后者的值里也含 "icon",但被
// apple-touch- 前缀挡在 rel=["']?icon 之外,不会误命中,顺序上先换 apple 再换 icon。
const APPLE_ICON_LINK_RE = /<link\b[^>]*\brel=["']?apple-touch-icon["']?[^>]*>/i;
const ICON_LINK_RE = /<link\b[^>]*\brel=["']?icon["']?[^>]*>/i;
// Open Graph:整条 <meta property="og:xxx"> 重写 content。og:image/og:url 要绝对地址。
const OG_TITLE_RE = /<meta\b[^>]*\bproperty=["']?og:title["']?[^>]*>/i;
const OG_DESC_RE = /<meta\b[^>]*\bproperty=["']?og:description["']?[^>]*>/i;
const OG_IMAGE_RE = /<meta\b[^>]*\bproperty=["']?og:image["']?[^>]*>/i;
const OG_URL_RE = /<meta\b[^>]*\bproperty=["']?og:url["']?[^>]*>/i;
// 普通描述 meta,顺带同步成同一份描述(部分抓取器读它而非 og:description)
const DESC_META_RE = /<meta\b[^>]*\bname=["']?description["']?[^>]*>/i;

/**
 * 卡片配图。学生有头像(站内路径或走 /api/icon 的上传图)就用头像;没有则回退到
 * 应用入口图 entrance-icon.png(也是 ICON_FALLBACK.href),两条分支现在返回值一致。
 */
const shareImageHref = (icon) => icon.href;

const setAttr = (tag, name, value) =>
  new RegExp(`\\b${name}=`, 'i').test(tag)
    ? tag.replace(new RegExp(`\\b${name}=(["'])[\\s\\S]*?\\1`, 'i'), `${name}="${value}"`)
    : tag.replace(/\s*\/?>$/, ` ${name}="${value}" />`);

const injectPageHead = async (html, { urlPath, search, req }) => {
  // /index.html 与 / 是同一个页面,统一成 / ,快捷方式地址更干净
  const base = urlPath === '/index.html' ? '/' : urlPath || '/';
  const start = base + (search || '');
  // encodeURIComponent 会转义 " & < > ,放进双引号属性里是安全的
  const href = `/manifest.webmanifest?start=${encodeURIComponent(start)}`;
  const rawTitle = await resolveTitle(base, search);
  const title = escapeHtml(rawTitle);
  const icon = await resolveIcon(search);

  // Open Graph 用的三份值:描述、卡片配图(绝对)、当前页地址(绝对)
  const origin = req ? resolveOrigin(req) : '';
  const desc = escapeHtml(await resolveDescription(search));
  const ogImage = escapeHtml(absoluteUrl(origin, shareImageHref(icon)));
  const ogUrl = escapeHtml(absoluteUrl(origin, base + (search || '')));

  return html
    .replace(MANIFEST_LINK_RE, (tag) => setAttr(tag, 'href', href))
    // 标题也在服务端写死:iOS"添加到主屏幕"的名称优先取 apple-mobile-web-app-title,
    // 靠 JS 在加载后改同样有来不及的风险,和 manifest 是一个道理
    .replace(TITLE_RE, `<title>${title}</title>`)
    .replace(APPLE_TITLE_RE, (tag) => setAttr(tag, 'content', title))
    // 图标同理:整条 link 重建,把 href(以及 rel=icon 的 type)一次性写对,
    // 免得 markup 里残留的 type="image/svg+xml" 和换上的 jpg 对不上。
    // href 走 escapeHtml:/api/icon?id=&v= 里的 & 在 HTML 属性里要写成 &amp;
    // (manifest 那份是 JSON,保留原始 & 不转义,两处各按各的规矩来)
    .replace(APPLE_ICON_LINK_RE, `<link rel="apple-touch-icon" href="${escapeHtml(icon.href)}" />`)
    .replace(
      ICON_LINK_RE,
      `<link rel="icon"${icon.type ? ` type="${icon.type}"` : ''} href="${escapeHtml(icon.href)}" />`,
    )
    // og:*:标题/描述用当前页的值,配图与地址补成绝对 URL,微信才抓得到卡片
    .replace(OG_TITLE_RE, (tag) => setAttr(tag, 'content', title))
    .replace(OG_DESC_RE, (tag) => setAttr(tag, 'content', desc))
    .replace(DESC_META_RE, (tag) => setAttr(tag, 'content', desc))
    .replace(OG_IMAGE_RE, (tag) => (ogImage ? setAttr(tag, 'content', ogImage) : tag))
    .replace(OG_URL_RE, (tag) => (ogUrl ? setAttr(tag, 'content', ogUrl) : tag));
};

serveStatic = createStaticHandler(STATIC_DIR, { transformIndexHtml: injectPageHead });

/* ------------------------------ API 路由 ------------------------------ */

const handleApi = async (req, res, url) => {
  const { pathname } = url;
  const method = req.method || 'GET';

  if (method !== 'GET' && method !== 'HEAD' && !isSameOrigin(req)) {
    sendJson(res, 403, { error: '跨站请求被拒绝' });
    return true;
  }

  if (pathname === '/api/health') {
    sendJson(res, 200, { ok: true, dataDir: store.DATA_DIR });
    return true;
  }

  // 主屏图标:仅为"上传的 base64 data URI"图标而设 —— 预设/默认是站内路径,
  // markup 与 manifest 直接引用那个路径,不会走到这里。解码后当普通图片返回,
  // 让 apple-touch-icon / manifest 能引用一个体积小、可缓存、换图标就变的 URL。
  if (pathname === '/api/icon' && (method === 'GET' || method === 'HEAD')) {
    const id = asString(url.searchParams.get('id')).trim();
    const raw = id ? (await store.studentIcons()).get(id) || '' : '';
    const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/i.exec(raw);
    if (!m) {
      // 不是 data URI(站内路径 / 没设 / 没这个学生):重定向到该图标或默认图
      const dest = raw && /^\/[A-Za-z0-9][\w\-./]*$/.test(raw) ? raw : '/entrance-icon.png';
      res.writeHead(302, { Location: dest, 'Cache-Control': 'no-store' });
      res.end();
      return true;
    }
    const declared = sanitizeMime(m[1] || 'image/png');
    // data: 图标若声明成会被当脚本执行的类型,sanitizeMime 会降级为 octet-stream,
    // 那样浏览器不拿它当图片。图标本就该是图片,非图片类型一律回退默认 SVG。
    const mime = declared.startsWith('image/') ? declared : 'image/png';
    let bytes;
    try {
      bytes = Buffer.from(m[3], m[2] ? 'base64' : 'utf8');
    } catch {
      bytes = null;
    }
    if (!bytes || bytes.length === 0) {
      res.writeHead(302, { Location: '/entrance-icon.png', 'Cache-Control': 'no-store' });
      res.end();
      return true;
    }
    // URL 带 ?v=<配置版本>,内容随版本变;同版本内容不变,可长缓存 + immutable
    const v = asString(url.searchParams.get('v'));
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': bytes.length,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': v ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(method === 'HEAD' ? undefined : bytes);
    return true;
  }

  // 上传头像:前端把裁剪压缩后的图片二进制 POST 上来,内容寻址落盘到 data/avatars/,
  // 返回一个普通静态图地址 /api/avatar/<名字>。不再转 base64 —— 见 store.saveAvatar 注释。
  if (pathname === '/api/avatar' && method === 'POST') {
    const mime = avatarMime(req.headers['content-type'] || url.searchParams.get('mime'));
    if (!mime) {
      sendJson(res, 415, { error: '头像必须是 JPG/PNG/WebP/GIF 图片' });
      return true;
    }
    let buf;
    try {
      buf = await readBody(req, AVATAR_LIMIT);
    } catch (e) {
      sendJson(res, e?.status === 413 ? 413 : 400, {
        error: e instanceof Error ? e.message : '上传失败',
      });
      return true;
    }
    if (buf.length === 0) {
      sendJson(res, 400, { error: '图片为空' });
      return true;
    }
    const name = await store.saveAvatar(buf, mime);
    sendJson(res, 200, { ok: true, url: `/api/avatar/${name}` });
    return true;
  }

  // 提供上传的头像文件。内容寻址(文件名即内容 sha256),可放心长缓存 + immutable。
  if (pathname.startsWith('/api/avatar/') && (method === 'GET' || method === 'HEAD')) {
    const file = store.avatarFile(decodeURIComponent(pathname.slice('/api/avatar/'.length)));
    if (!file) {
      sendJson(res, 404, { error: '头像不存在' });
      return true;
    }
    const ok = await sendFile(req, res, file, {
      cacheControl: 'public, max-age=31536000, immutable',
    });
    if (!ok) sendJson(res, 404, { error: '头像不存在' });
    return true;
  }

  // 前端启动引导:一次拿到全部初始状态,避免开屏打四五个请求
  if (pathname === '/api/state' && method === 'GET') {
    const [config, memos, initialized, authed] = await Promise.all([
      store.readConfig(),
      store.readMemos(),
      store.hasCredentials(),
      store.isSessionValid(currentToken(req)),
    ]);
    sendJson(res, 200, {
      config,
      memos,
      auth: { initialized },
      authed,
      rev: store.revisions(),
    });
    return true;
  }

  // 轮询端点:只回两个 mtime,让别的设备的修改能在几秒内同步过来
  if (pathname === '/api/rev' && method === 'GET') {
    sendJson(res, 200, store.revisions());
    return true;
  }

  if (pathname === '/api/config') {
    if (method === 'GET') {
      sendJson(res, 200, { config: await store.readConfig(), rev: store.revisions().config });
      return true;
    }
    if (method === 'PUT') {
      const body = await readJsonBody(req);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        sendJson(res, 400, { error: '配置必须是对象' });
        return true;
      }
      await store.writeConfig(body);
      sendJson(res, 200, { ok: true, rev: store.revisions().config });
      // 换了头像后旧文件没人引用了,顺手回收(带宽限期,不阻塞响应)
      store.pruneAvatars(PRUNE_GRACE_MS).catch(() => {});
      return true;
    }
    if (method === 'DELETE') {
      await store.deleteConfig();
      sendJson(res, 200, { ok: true, rev: store.revisions().config });
      store.pruneAvatars(PRUNE_GRACE_MS).catch(() => {});
      return true;
    }
  }

  if (pathname === '/api/memos') {
    if (method === 'GET') {
      sendJson(res, 200, { memos: await store.readMemos(), rev: store.revisions().memos });
      return true;
    }
    if (method === 'PUT') {
      const body = await readJsonBody(req);
      if (!Array.isArray(body)) {
        sendJson(res, 400, { error: '备忘必须是数组' });
        return true;
      }
      await store.writeMemos(body);
      sendJson(res, 200, { ok: true, rev: store.revisions().memos });
      return true;
    }
  }

  if (pathname === '/api/attachments' && method === 'GET') {
    sendJson(res, 200, { keys: await store.listAttachmentKeys() });
    return true;
  }

  if (pathname === '/api/attachments' && method === 'POST') {
    const key = asString(url.searchParams.get('key')).trim();
    if (!key || key.length > 512) {
      sendJson(res, 400, { error: 'key 缺失或过长' });
      return true;
    }
    try {
      const size = await store.saveAttachment(key, req, {
        name: asString(url.searchParams.get('name')) || key,
        mime: sanitizeMime(url.searchParams.get('mime')),
        limit: UPLOAD_LIMIT,
      });
      sendJson(res, 200, { ok: true, key, size });
    } catch (e) {
      sendJson(res, 413, { error: e instanceof Error ? e.message : '写入失败' });
    }
    return true;
  }

  // 回收无引用附件。以服务端 memos.json 为准,附带调用方还没提交的待上传附件
  if (pathname === '/api/attachments/prune' && method === 'POST') {
    let keep = [];
    try {
      const body = await readJsonBody(req, 1 << 20);
      if (Array.isArray(body?.keep)) keep = body.keep;
    } catch {
      /* 允许空 body */
    }
    const removed = await store.pruneAttachments(keep, PRUNE_GRACE_MS);
    sendJson(res, 200, { ok: true, removed });
    return true;
  }

  if (pathname === '/api/usage' && method === 'GET') {
    sendJson(res, 200, { attachments: await store.attachmentUsage() });
    return true;
  }

  if (pathname.startsWith('/api/attachments/')) {
    const key = decodeURIComponent(pathname.slice('/api/attachments/'.length));
    if (!key) {
      sendJson(res, 400, { error: 'key 缺失' });
      return true;
    }
    if (method === 'DELETE') {
      await store.deleteAttachment(key);
      sendJson(res, 200, { ok: true });
      return true;
    }
    if (method === 'GET' || method === 'HEAD') {
      const meta = await store.attachmentMeta(key);
      if (!meta) {
        sendJson(res, 404, { error: '附件不存在' });
        return true;
      }
      await sendFile(req, res, meta.path, {
        // 存量数据(改这版之前上传的)也过一遍白名单,双重保险
        contentType: sanitizeMime(meta.mime),
        // 附件内容按 key 不可变(key 里带随机 id),可以放心长缓存
        cacheControl: 'private, max-age=31536000, immutable',
        download: url.searchParams.get('download') ? meta.name : undefined,
      });
      return true;
    }
  }

  /* -------------------------- 超管账号 -------------------------- */

  if (pathname === '/api/auth/status' && method === 'GET') {
    sendJson(res, 200, {
      initialized: await store.hasCredentials(),
      authed: await store.isSessionValid(currentToken(req)),
    });
    return true;
  }

  if (pathname === '/api/auth/setup' && method === 'POST') {
    // 只允许在"还没有账号"时创建。否则任何人都能覆盖掉超管密码
    if (await store.hasCredentials()) {
      sendJson(res, 409, { error: '已初始化,请直接登录' });
      return true;
    }
    const body = await readJsonBody(req, 1 << 16);
    const username = asString(body?.username).trim();
    const password = asString(body?.password);
    if (!username) {
      sendJson(res, 400, { error: '请输入账号' });
      return true;
    }
    if (password.length < 6) {
      sendJson(res, 400, { error: '密码至少 6 位' });
      return true;
    }
    await store.setCredentials(username, password);
    await store.dropAllSessions();
    const token = await store.createSession();
    res.setHeader('Set-Cookie', sessionCookie(token));
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const body = await readJsonBody(req, 1 << 16);
    const username = asString(body?.username).trim();
    const password = asString(body?.password);
    if (!(await store.hasCredentials())) {
      sendJson(res, 409, { error: '尚未初始化,请先设置账号' });
      return true;
    }
    if (!(await store.verifyCredentials(username, password))) {
      sendJson(res, 401, { error: '账号或密码错误' });
      return true;
    }
    const token = await store.createSession();
    res.setHeader('Set-Cookie', sessionCookie(token));
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    await store.dropSession(currentToken(req));
    res.setHeader('Set-Cookie', clearedCookie());
    sendJson(res, 200, { ok: true });
    return true;
  }

  /* -------------------------- 外网代理 -------------------------- */

  if (pathname.startsWith('/api/nmc/') && (method === 'GET' || method === 'HEAD')) {
    const suffix = pathname.slice('/api/nmc'.length) + (url.search || '');
    try {
      const out = await proxyNmc(suffix);
      res.writeHead(out.status, {
        'Content-Type': out.contentType,
        'Content-Length': out.body.length,
        'Cache-Control': 'no-store',
      });
      res.end(method === 'HEAD' ? undefined : out.body);
    } catch (e) {
      sendJson(res, 502, { error: e instanceof Error ? e.message : '天气取数失败' });
    }
    return true;
  }

  if (pathname.startsWith('/api/holidays/') && method === 'GET') {
    const year = Number(pathname.slice('/api/holidays/'.length));
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      sendJson(res, 400, { error: '年份不合法' });
      return true;
    }
    try {
      const { data, fromCache } = await fetchHolidays(year);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-From-Cache': fromCache ? '1' : '0',
      });
      res.end(JSON.stringify(data));
    } catch (e) {
      sendJson(res, 502, { error: e instanceof Error ? e.message : '节假日取数失败' });
    }
    return true;
  }

  sendJson(res, 404, { error: `未知接口 ${pathname}` });
  return true;
};

/* ------------------------------ 服务启动 ------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    // 动态 manifest:带上 ?start= 里的当前页地址,让"添加到主屏幕"保留完整参数。
    // 拦在静态托管之前,否则会被 dist/manifest.webmanifest 静态文件顶掉。
    if (url.pathname === '/manifest.webmanifest') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method Not Allowed');
        return;
      }
      const start = sanitizeStartUrl(url.searchParams.get('start'));
      // start 已归一成站内绝对路径,给个占位 base 只是为了拆出 pathname / search
      const parsed = new URL(start, 'http://x');
      const [mTitle, mIcon] = await Promise.all([
        resolveTitle(parsed.pathname, parsed.search),
        resolveIcon(parsed.search),
      ]);
      const body = Buffer.from(buildManifest(start, mTitle, mIcon));
      res.writeHead(200, {
        'Content-Type': 'application/manifest+json; charset=utf-8',
        'Content-Length': body.length,
        // 不同学生的快捷方式 start 不同,别共用缓存;每次都按当前参数重新生成
        'Cache-Control': 'no-cache',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method Not Allowed');
      return;
    }
    const served = await serveStatic(req, res, url);
    if (!served) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
    }
  } catch (e) {
    console.error('[server]', req.method, url.pathname, e);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const status = e && typeof e.status === 'number' ? e.status : 500;
    sendJson(res, status, { error: e instanceof Error ? e.message : '服务器内部错误' });
  }
});

// 常亮看板会长期保持连接,给足超时,避免被 Node 默认 5s keep-alive 频繁断开
server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;

await store.ensureDirs();

server.listen(PORT, HOST, () => {
  console.log(`[server] 课程表服务已启动 http://${HOST}:${PORT}`);
  console.log(`[server] 数据目录 ${store.DATA_DIR}`);
  console.log(`[server] 静态目录 ${STATIC_DIR}`);
});

const shutdown = (signal) => {
  console.log(`[server] 收到 ${signal},正在退出`);
  server.close(() => process.exit(0));
  // 有长连接(看板)时 close 不会立刻回调,兜一个硬超时
  setTimeout(() => process.exit(0), 5_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
