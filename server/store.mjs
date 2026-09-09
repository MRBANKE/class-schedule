/**
 * 数据落盘层：所有数据都写在 DATA_DIR(容器里是挂载卷 /app/data)下的普通文件里,
 * 不依赖任何外部数据库,备份就是把整个目录拷走。
 *
 * 两个关键约束:
 * 1. 原子写:先写 <file>.tmp 再 rename。直接覆盖写在断电/容器被 kill 时会留下半截 JSON,
 *    而 config.json 一旦损坏,整个课表就回到默认值。
 * 2. 串行写:同一个文件的并发写入排队执行。看板与后台可能同时保存,
 *    两个 writeFile 交叉执行会互相踩到对方的 tmp 文件。
 */
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

export const DATA_DIR = path.resolve(process.env.DATA_DIR || '/app/data');
export const ATTACH_DIR = path.join(DATA_DIR, 'attachments');
export const AVATAR_DIR = path.join(DATA_DIR, 'avatars');
export const CACHE_DIR = path.join(DATA_DIR, 'cache');

const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const MEMOS_FILE = path.join(DATA_DIR, 'memos.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const ensureDirs = async () => {
  for (const dir of [DATA_DIR, ATTACH_DIR, AVATAR_DIR, CACHE_DIR]) {
    await fsp.mkdir(dir, { recursive: true });
  }
};

/** 每个文件一条写入队列,保证同一文件的写入不会交叉 */
const writeQueues = new Map();

const enqueueWrite = (file, task) => {
  const prev = writeQueues.get(file) ?? Promise.resolve();
  // 用 catch 兜住上一个任务的失败,否则一次写失败会让该文件后续所有写入都被拒绝
  const next = prev.catch(() => {}).then(task);
  writeQueues.set(file, next);
  // 队列跑空后清理,避免长期运行持有一条越来越长的 promise 链
  next.catch(() => {}).then(() => {
    if (writeQueues.get(file) === next) writeQueues.delete(file);
  });
  return next;
};

const writeFileAtomic = (file, contents) =>
  enqueueWrite(file, async () => {
    const tmp = `${file}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, contents);
    await fsp.rename(tmp, file);
  });

const readJson = async (file) => {
  try {
    const raw = await fsp.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    // 文件不存在是正常状态(还没保存过);JSON 损坏则当作没有数据,
    // 但要留下日志,否则用户只会看到"配置莫名回到默认"
    if (e && e.code !== 'ENOENT') {
      console.error(`[store] 读取 ${path.basename(file)} 失败:`, e.message);
    }
    return null;
  }
};

/** 文件 mtime 作为版本号,给前端轮询判断"别的设备改过没有" */
const revisionOf = (file) => {
  try {
    return Math.round(fs.statSync(file).mtimeMs);
  } catch {
    return 0;
  }
};

export const readConfig = () => readJson(CONFIG_FILE);
export const writeConfig = (value) =>
  writeFileAtomic(CONFIG_FILE, JSON.stringify(value));
export const deleteConfig = () =>
  enqueueWrite(CONFIG_FILE, () => fsp.rm(CONFIG_FILE, { force: true }));

export const readMemos = () => readJson(MEMOS_FILE);
export const writeMemos = (value) =>
  writeFileAtomic(MEMOS_FILE, JSON.stringify(value));

export const revisions = () => ({
  config: revisionOf(CONFIG_FILE),
  memos: revisionOf(MEMOS_FILE),
});

/**
 * 只取"学生 id -> {标题, 图标}"这一小份索引,供动态 manifest、HTML 标题与图标改写用。
 * config.json 里带 base64 头像/图标,可能有好几 MB,不能每个 HTML 请求都整份读进来解析,
 * 所以按 mtime 缓存 —— 配置没动过就直接复用上次的结果。标题与图标共用这一次读取。
 */
let metaCache = { rev: -1, titles: new Map(), icons: new Map(), descs: new Map() };

const studentMeta = async () => {
  const rev = revisionOf(CONFIG_FILE);
  if (metaCache.rev === rev) return metaCache;
  const cfg = await readConfig();
  const titles = new Map();
  const icons = new Map();
  const descs = new Map();
  if (Array.isArray(cfg?.students)) {
    for (const s of cfg.students) {
      if (!s || typeof s.id !== 'string') continue;
      if (typeof s.title === 'string' && s.title) titles.set(s.id, s.title);
      // logoImage 可能是站内路径(/avatars/xx.jpg)或上传的 base64 data URI
      if (typeof s.logoImage === 'string' && s.logoImage) icons.set(s.id, s.logoImage);
      // 微信分享卡片描述(og:description),用户在后台填,可空
      if (typeof s.shareDescription === 'string' && s.shareDescription.trim()) {
        descs.set(s.id, s.shareDescription.trim());
      }
    }
  }
  metaCache = { rev, titles, icons, descs };
  return metaCache;
};

export const studentTitles = async () => (await studentMeta()).titles;
export const studentIcons = async () => (await studentMeta()).icons;
export const studentDescriptions = async () => (await studentMeta()).descs;

/* ------------------------------- 头像 ------------------------------- */

/**
 * 上传的头像存成 data/avatars/ 下的真实图片文件,直接用普通 URL(/api/avatar/<名字>)
 * 引用 —— 不再转 base64 塞进 config.json。这样分享到微信时 og:image 是一个带扩展名、
 * 无查询串的静态图地址,微信抓卡片的预览阶段才认;base64 走的 /api/icon?id=&v= 那种
 * 带参数、无扩展名的地址,预览阶段常抓不到(卡片抓过一次后才显示得出)。
 *
 * 文件名用「内容的 sha256 + 扩展名」:同一张图只存一份,换头像 URL 必变(iOS/微信的
 * 图片缓存自然失效),也不含用户可控字符,拼进路径无穿越风险。
 */
const AVATAR_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const AVATAR_NAME_RE = /^[0-9a-f]{64}\.(?:jpg|png|webp|gif)$/;
// config 里引用上传头像的形态:/api/avatar/<sha256>.<ext>
const AVATAR_REF_RE = /^\/api\/avatar\/([0-9a-f]{64}\.(?:jpg|png|webp|gif))$/;

/** 把图片字节按内容寻址落盘,返回文件名(<sha256>.<ext>);已存在则跳过写入 */
export const saveAvatar = async (buffer, mime) => {
  const ext = AVATAR_EXT[mime] || 'jpg';
  const hash = createHash('sha256').update(buffer).digest('hex');
  const name = `${hash}.${ext}`;
  const file = path.join(AVATAR_DIR, name);
  try {
    await fsp.access(file);
  } catch {
    const tmp = `${file}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, buffer);
    await fsp.rename(tmp, file);
  }
  return name;
};

/** 校验并返回头像文件的磁盘路径;名字不合法(可能穿越/非头像)返回 null */
export const avatarFile = (name) => {
  if (typeof name !== 'string' || !AVATAR_NAME_RE.test(name)) return null;
  return path.join(AVATAR_DIR, name);
};

/**
 * 回收没有任何学生引用的头像文件。以磁盘上的 config.json 为准。
 * 带宽限期:刚上传但还没写进配置的头像(上传与保存配置之间有个窗口,期间别的设备
 * 触发的 config PUT 不该把它删掉)在这段时间内保留,与附件回收同样的理由。
 */
export const pruneAvatars = async (graceMs = 6 * 60 * 60 * 1000) => {
  const cfg = await readConfig();
  const keep = new Set();
  if (Array.isArray(cfg?.students)) {
    for (const s of cfg.students) {
      const img = s && typeof s.logoImage === 'string' ? s.logoImage : '';
      const m = AVATAR_REF_RE.exec(img);
      if (m) keep.add(m[1]);
    }
  }
  let files;
  try {
    files = await fsp.readdir(AVATAR_DIR);
  } catch {
    return 0;
  }
  const now = Date.now();
  let removed = 0;
  for (const file of files) {
    if (file.endsWith('.tmp') || !AVATAR_NAME_RE.test(file)) continue;
    if (keep.has(file)) continue;
    const full = path.join(AVATAR_DIR, file);
    try {
      const stat = await fsp.stat(full);
      if (now - stat.mtimeMs < graceMs) continue;
      await fsp.rm(full, { force: true });
      removed += 1;
    } catch {
      /* 并发删除,忽略 */
    }
  }
  return removed;
};

/* ------------------------------- 附件 ------------------------------- */

/**
 * 附件 key 由前端生成(形如 "<id>-<原始文件名>"),会出现中文、空格、路径分隔符,
 * 直接拼进路径既可能越权穿越(../),也可能超出文件名长度上限。
 * 因此磁盘文件名一律用 key 的 sha256,原始 key 与文件名存进 .meta.json。
 */
const keyToBase = (key) => createHash('sha256').update(key).digest('hex');

const attachPaths = (key) => {
  const base = keyToBase(key);
  return {
    blob: path.join(ATTACH_DIR, base),
    meta: path.join(ATTACH_DIR, `${base}.meta.json`),
  };
};

export const attachmentMeta = async (key) => {
  const { blob, meta } = attachPaths(key);
  let stat;
  try {
    stat = await fsp.stat(blob);
  } catch {
    return null;
  }
  const info = (await readJson(meta)) ?? {};
  return {
    key,
    path: blob,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    name: typeof info.name === 'string' ? info.name : '附件',
    mime: typeof info.mime === 'string' ? info.mime : 'application/octet-stream',
  };
};

/** 把请求体流式写入附件目录,返回落盘大小。limit 为 0 表示不限制 */
export const saveAttachment = async (key, stream, { name, mime, limit }) => {
  const { blob, meta } = attachPaths(key);
  const tmp = `${blob}.${process.pid}.tmp`;
  let size = 0;
  const out = fs.createWriteStream(tmp);
  try {
    await new Promise((resolve, reject) => {
      stream.on('data', (chunk) => {
        size += chunk.length;
        if (limit > 0 && size > limit) {
          // destroy 会同时让 pipeline 的 promise 以此错误 reject
          stream.destroy(new Error(`附件超过 ${Math.round(limit / 1048576)}MB 上限`));
        }
      });
      stream.on('error', reject);
      out.on('error', reject);
      out.on('finish', resolve);
      stream.pipe(out);
    });
  } catch (e) {
    out.destroy();
    await fsp.rm(tmp, { force: true });
    throw e;
  }
  await fsp.rename(tmp, blob);
  await fsp.writeFile(meta, JSON.stringify({ key, name, mime, size }));
  return size;
};

export const deleteAttachment = async (key) => {
  const { blob, meta } = attachPaths(key);
  await fsp.rm(blob, { force: true });
  await fsp.rm(meta, { force: true });
};

/** 列出所有附件的原始 key(供前端 pruneOrphans 回收无引用附件) */
export const listAttachmentKeys = async () => {
  let files;
  try {
    files = await fsp.readdir(ATTACH_DIR);
  } catch {
    return [];
  }
  const keys = [];
  for (const f of files) {
    if (!f.endsWith('.meta.json')) continue;
    const info = await readJson(path.join(ATTACH_DIR, f));
    if (info && typeof info.key === 'string') keys.push(info.key);
  }
  return keys;
};

/**
 * 回收没有任何备忘引用的附件。
 *
 * 必须在服务端做:数据现在是多设备共享的,某台设备的 memos 可能还没轮询到最新,
 * 若由它来决定"哪些附件是孤儿",就会删掉别的设备刚添加的附件。
 * 这里以磁盘上的 memos.json 为准,再加上调用方传来的 keep(它本地还没提交的待上传附件),
 * 并给一个宽限期:刚上传但还没保存进备忘的附件不会被立刻清掉。
 */
export const pruneAttachments = async (keep = [], graceMs = 6 * 60 * 60 * 1000) => {
  const memos = await readMemos();
  const usedKeys = new Set(keep.filter((k) => typeof k === 'string'));
  if (Array.isArray(memos)) {
    for (const memo of memos) {
      const list = memo && Array.isArray(memo.attachments) ? memo.attachments : [];
      for (const att of list) {
        if (att && typeof att.blobKey === 'string') usedKeys.add(att.blobKey);
      }
    }
  }
  // key → 磁盘文件名是确定的 sha256 映射,所以直接比对文件名即可,
  // 连 meta 丢失的孤儿 blob 也能一并回收
  const usedBases = new Set([...usedKeys].map(keyToBase));

  let files;
  try {
    files = await fsp.readdir(ATTACH_DIR);
  } catch {
    return 0;
  }
  const now = Date.now();
  let removed = 0;
  for (const file of files) {
    if (file.endsWith('.tmp')) continue;
    const base = file.endsWith('.meta.json') ? file.slice(0, -'.meta.json'.length) : file;
    if (usedBases.has(base)) continue;
    const full = path.join(ATTACH_DIR, file);
    try {
      const stat = await fsp.stat(full);
      if (now - stat.mtimeMs < graceMs) continue;
      await fsp.rm(full, { force: true });
      if (!file.endsWith('.meta.json')) removed += 1;
    } catch {
      /* 并发删除,忽略 */
    }
  }
  return removed;
};

export const attachmentUsage = async () => {
  let files;
  try {
    files = await fsp.readdir(ATTACH_DIR);
  } catch {
    return 0;
  }
  let total = 0;
  for (const f of files) {
    try {
      total += (await fsp.stat(path.join(ATTACH_DIR, f))).size;
    } catch {
      /* 并发删除,忽略 */
    }
  }
  return total;
};

/* ------------------------------- 超管账号 ------------------------------- */

const hashPassword = async (password, salt) => {
  const buf = await scrypt(password, salt, 64);
  return buf.toString('hex');
};

export const readAuth = () => readJson(AUTH_FILE);

export const hasCredentials = async () => {
  const auth = await readAuth();
  return !!(auth && typeof auth.username === 'string' && typeof auth.hash === 'string');
};

export const setCredentials = async (username, password) => {
  const salt = randomBytes(16).toString('hex');
  const hash = await hashPassword(password, salt);
  await writeFileAtomic(
    AUTH_FILE,
    JSON.stringify({ username, salt, hash, createdAt: Date.now() }),
  );
};

export const verifyCredentials = async (username, password) => {
  const auth = await readAuth();
  if (!auth || typeof auth.hash !== 'string' || typeof auth.salt !== 'string') {
    return false;
  }
  if (auth.username !== username) return false;
  const hash = await hashPassword(password, auth.salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(auth.hash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
};

/* ------------------------------- 会话 ------------------------------- */

let sessionsCache = null;

const loadSessions = async () => {
  if (sessionsCache) return sessionsCache;
  const raw = await readJson(SESSIONS_FILE);
  sessionsCache = raw && typeof raw === 'object' ? raw : {};
  return sessionsCache;
};

const persistSessions = async () => {
  const sessions = await loadSessions();
  const now = Date.now();
  for (const [token, exp] of Object.entries(sessions)) {
    if (typeof exp !== 'number' || exp < now) delete sessions[token];
  }
  await writeFileAtomic(SESSIONS_FILE, JSON.stringify(sessions));
};

export const createSession = async () => {
  const sessions = await loadSessions();
  const token = randomBytes(32).toString('hex');
  sessions[token] = Date.now() + SESSION_TTL_MS;
  await persistSessions();
  return token;
};

export const isSessionValid = async (token) => {
  if (!token) return false;
  const sessions = await loadSessions();
  const exp = sessions[token];
  return typeof exp === 'number' && exp > Date.now();
};

export const dropSession = async (token) => {
  if (!token) return;
  const sessions = await loadSessions();
  if (token in sessions) {
    delete sessions[token];
    await persistSessions();
  }
};

/** 重设账号时清空所有会话,否则旧 token 仍能进后台 */
export const dropAllSessions = async () => {
  sessionsCache = {};
  await writeFileAtomic(SESSIONS_FILE, JSON.stringify({}));
};
