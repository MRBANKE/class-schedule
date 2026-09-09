/**
 * 老用户的浏览器里可能还留着改造前的数据:
 * localStorage['config-v1'](课表配置)、localStorage['memo-v1'](备忘,含少量小图 base64)、
 * IndexedDB memo-attachments/blobs(备忘附件二进制)。
 *
 * 服务端还完全没有数据时,把这些搬过去一次;搬完写个标记不再重复触发,
 * 否则下次打开一个"服务端本来就没数据"的全新学生链接也会误当成"要迁移"。
 */
import { getConfigRaw, getMemosRaw, pushConfig, pushMemos } from './client';

const MIGRATED_FLAG = 'migrated-to-server-v1';
const LEGACY_CONFIG_KEY = 'config-v1';
const LEGACY_MEMO_KEY = 'memo-v1';
const LEGACY_DB_NAME = 'memo-attachments';
const LEGACY_DB_VERSION = 1;
const LEGACY_STORE = 'blobs';

const readLegacyJson = (key: string): unknown => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/** 是否需要迁移:服务端(bootstrap 后的缓存)一片空白,且本机还留着旧数据,且没迁过 */
export function needsMigration(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage.getItem(MIGRATED_FLAG)) return false;
  } catch {
    return false;
  }
  if (getConfigRaw() !== null || getMemosRaw() !== null) return false;
  return (
    readLegacyJson(LEGACY_CONFIG_KEY) !== null ||
    readLegacyJson(LEGACY_MEMO_KEY) !== null
  );
}

const openLegacyDb = (): Promise<IDBDatabase | null> =>
  new Promise(resolve => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(LEGACY_DB_NAME, LEGACY_DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      // 本机原本没这个库时会走到这里创建出一个空库,迁移不到附件,但不应因此报错
      if (!req.result.objectStoreNames.contains(LEGACY_STORE)) {
        req.result.createObjectStore(LEGACY_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });

const readLegacyBlobs = async (): Promise<Map<string, Blob>> => {
  const out = new Map<string, Blob>();
  const db = await openLegacyDb();
  if (!db) return out;
  if (!db.objectStoreNames.contains(LEGACY_STORE)) {
    db.close();
    return out;
  }
  await new Promise<void>(resolve => {
    const tx = db.transaction(LEGACY_STORE, 'readonly');
    const store = tx.objectStore(LEGACY_STORE);
    const keysReq = store.getAllKeys();
    keysReq.onsuccess = () => {
      const keys = keysReq.result.filter(
        (k): k is string => typeof k === 'string',
      );
      if (keys.length === 0) {
        resolve();
        return;
      }
      let remaining = keys.length;
      const done = () => {
        remaining -= 1;
        if (remaining === 0) resolve();
      };
      for (const key of keys) {
        const valueReq = store.get(key);
        valueReq.onsuccess = () => {
          if (valueReq.result instanceof Blob) out.set(key, valueReq.result);
          done();
        };
        valueReq.onerror = done;
      }
    };
    keysReq.onerror = () => resolve();
  });
  db.close();
  return out;
};

const uploadLegacyAttachment = async (key: string, blob: Blob): Promise<void> => {
  const mime = blob.type || 'application/octet-stream';
  const qs = new URLSearchParams({ key, name: key, mime });
  const res = await fetch(`/api/attachments?${qs.toString()}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': mime },
    body: blob,
  });
  if (!res.ok) throw new Error(`附件 ${key} 迁移失败:${res.status}`);
};

/**
 * 执行一次性迁移。调用方(main.tsx)应在 bootstrap() 成功之后、渲染真正的应用之前
 * await 它 —— 否则界面会先用 bootstrap 拿到的空配置渲染一次,给人"数据丢了"的错觉。
 */
export async function migrateLegacyData(): Promise<void> {
  try {
    const config = readLegacyJson(LEGACY_CONFIG_KEY);
    const memos = readLegacyJson(LEGACY_MEMO_KEY);
    const blobs = await readLegacyBlobs();
    for (const [key, blob] of blobs) {
      try {
        await uploadLegacyAttachment(key, blob);
      } catch {
        // 单个附件失败不阻塞其余迁移;万一漏了,家长仍能在超管页看到课表和备忘文字
      }
    }
    if (config !== null) await pushConfig(config);
    if (memos !== null) await pushMemos(memos);
  } finally {
    // 无论成功与否都标记为已迁移,避免服务端长期没数据时反复重试重复上传旧数据
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(MIGRATED_FLAG, '1');
      }
    } catch {
      /* ignore */
    }
  }
}
