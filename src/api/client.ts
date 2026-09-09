/**
 * 与后端 server/index.mjs 通信的唯一入口。
 *
 * main.tsx 渲染前先调用一次 bootstrap():一次性拉取 config/memos/auth 状态灌进模块级缓存,
 * 之后 loadConfig()/getMemosRaw() 等各处的"同步读取"都是读这份缓存,不必到处改成 async。
 * 写入是"乐观更新缓存 + 广播事件 + 异步 PUT":界面立即响应,PUT 失败再回滚缓存并重新广播。
 * 跨设备/跨标签的同步交给 startRevisionPolling() 定期比较 /api/rev 的 mtime,变了就重新拉取并广播。
 */

export const CONFIG_UPDATED_EVENT = 'kb:config-updated';
export const MEMO_UPDATED_EVENT = 'kb:memo-updated';

interface AuthState {
  initialized: boolean;
  authed: boolean;
}

interface Revisions {
  config: number;
  memos: number;
}

let configCache: unknown = null;
let memosCache: unknown = null;
let authState: AuthState = { initialized: false, authed: false };
let revCache: Revisions = { config: 0, memos: 0 };

const dispatch = (name: string): void => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(name));
};

const fetchJson = async (path: string, init?: RequestInit): Promise<any> => {
  const res = await fetch(path, { credentials: 'same-origin', ...init });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data && typeof data.error === 'string') message = data.error;
    } catch {
      /* 响应体不是 JSON 时用状态码兜底 */
    }
    throw new Error(message);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

const alertSaveFailed = (e: unknown): void => {
  if (typeof window === 'undefined') return;
  const detail = e instanceof Error ? e.message : '';
  window.alert(
    `保存失败:无法连接到服务器。${detail ? `\n${detail}` : ''}\n请检查网络后重试,刚才的修改未保存。`,
  );
};

/* ------------------------------ 启动引导 ------------------------------ */

export async function bootstrap(): Promise<{ ok: boolean; error?: string }> {
  try {
    const data = await fetchJson('/api/state');
    configCache = data?.config ?? null;
    memosCache = Array.isArray(data?.memos) ? data.memos : null;
    authState = {
      initialized: !!data?.auth?.initialized,
      authed: !!data?.authed,
    };
    revCache = {
      config: Number(data?.rev?.config) || 0,
      memos: Number(data?.rev?.memos) || 0,
    };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '未知错误' };
  }
}

/* ------------------------------ 课表配置 ------------------------------ */

export const getConfigRaw = (): unknown => configCache;

export async function pushConfig(config: unknown): Promise<boolean> {
  const prev = configCache;
  configCache = config;
  dispatch(CONFIG_UPDATED_EVENT);
  try {
    const data = await fetchJson('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (typeof data?.rev === 'number') revCache.config = data.rev;
    return true;
  } catch (e) {
    configCache = prev;
    dispatch(CONFIG_UPDATED_EVENT);
    alertSaveFailed(e);
    return false;
  }
}

export async function clearConfig(): Promise<boolean> {
  const prev = configCache;
  configCache = null;
  dispatch(CONFIG_UPDATED_EVENT);
  try {
    const data = await fetchJson('/api/config', { method: 'DELETE' });
    if (typeof data?.rev === 'number') revCache.config = data.rev;
    return true;
  } catch (e) {
    configCache = prev;
    dispatch(CONFIG_UPDATED_EVENT);
    alertSaveFailed(e);
    return false;
  }
}

/* ------------------------------ 备忘 ------------------------------ */

export const getMemosRaw = (): unknown => memosCache;

export async function pushMemos(memos: unknown): Promise<boolean> {
  const prev = memosCache;
  memosCache = memos;
  dispatch(MEMO_UPDATED_EVENT);
  try {
    const data = await fetchJson('/api/memos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(memos),
    });
    if (typeof data?.rev === 'number') revCache.memos = data.rev;
    return true;
  } catch (e) {
    memosCache = prev;
    dispatch(MEMO_UPDATED_EVENT);
    alertSaveFailed(e);
    return false;
  }
}

/* ------------------------------ 附件 ------------------------------ */

export const attachmentUrl = (key: string): string =>
  `/api/attachments/${encodeURIComponent(key)}`;

export async function uploadAttachment(
  key: string,
  blob: Blob,
  name: string,
): Promise<void> {
  const mime = blob.type || 'application/octet-stream';
  const qs = new URLSearchParams({ key, name, mime });
  await fetchJson(`/api/attachments?${qs.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': mime },
    body: blob,
  });
}

/**
 * 上传头像:把裁剪压缩后的图片二进制直接 POST 给服务端,存成 data/avatars/ 下的
 * 真实文件,返回一个普通静态图地址(/api/avatar/<名字>)。不再转 base64 塞进配置 ——
 * 这样分享到微信时 og:image 是带扩展名、无查询串的静态图,预览阶段才抓得到。
 */
export async function uploadAvatar(blob: Blob): Promise<string> {
  const mime = blob.type || 'image/jpeg';
  const data = await fetchJson('/api/avatar', {
    method: 'POST',
    headers: { 'Content-Type': mime },
    body: blob,
  });
  if (!data || typeof data.url !== 'string') throw new Error('上传头像失败');
  return data.url;
}

export async function fetchAttachmentBlob(key: string): Promise<Blob | null> {
  try {
    const res = await fetch(attachmentUrl(key), { credentials: 'same-origin' });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

export async function fetchAttachmentKeys(): Promise<string[]> {
  const data = await fetchJson('/api/attachments');
  return Array.isArray(data?.keys) ? data.keys : [];
}

export async function removeAttachment(key: string): Promise<void> {
  await fetchJson(attachmentUrl(key), { method: 'DELETE' });
}

/* ------------------------------ 超管账号 ------------------------------ */

export const getAuthState = (): AuthState => authState;

export async function refreshAuthState(): Promise<void> {
  try {
    const data = await fetchJson('/api/auth/status');
    authState = { initialized: !!data?.initialized, authed: !!data?.authed };
  } catch {
    // 网络错误时保留上一次已知状态,不把已登录用户误判成未登录
  }
}

export async function authSetup(username: string, password: string): Promise<void> {
  await fetchJson('/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  authState = { initialized: true, authed: true };
}

export async function authLogin(username: string, password: string): Promise<void> {
  await fetchJson('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  authState = { initialized: true, authed: true };
}

export async function authLogout(): Promise<void> {
  try {
    await fetchJson('/api/auth/logout', { method: 'POST' });
  } finally {
    authState = { ...authState, authed: false };
  }
}

/* ------------------------------ 跨设备轮询同步 ------------------------------ */

let pollTimer: ReturnType<typeof setInterval> | null = null;

async function pollOnce(): Promise<void> {
  try {
    const rev = await fetchJson('/api/rev');
    if (rev.config !== revCache.config) {
      const data = await fetchJson('/api/config');
      configCache = data?.config ?? null;
      // 只有取数成功才推进 revCache:否则这一轮的 GET 抛错被下面 catch 吞掉后,
      // 下一轮会误判"无变化"而永远不再拉取这个 revision,跨设备同步就此静默卡住
      revCache.config = rev.config;
      dispatch(CONFIG_UPDATED_EVENT);
    }
    if (rev.memos !== revCache.memos) {
      const data = await fetchJson('/api/memos');
      memosCache = Array.isArray(data?.memos) ? data.memos : null;
      revCache.memos = rev.memos;
      dispatch(MEMO_UPDATED_EVENT);
    }
  } catch {
    // 单次轮询失败不打扰用户,等下一轮再试
  }
}

/** 开始轮询别的设备/浏览器对配置与备忘的修改。只在页面可见时轮询,省电也省流量 */
export function startRevisionPolling(intervalMs = 5000): void {
  if (typeof window === 'undefined' || pollTimer) return;
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') void pollOnce();
  }, intervalMs);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void pollOnce();
  });
}
