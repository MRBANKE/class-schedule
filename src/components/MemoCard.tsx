import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { SvgIcon } from '../icons';
import DateTimePicker from './DateTimePicker';
import MemoVideoPlayer from './MemoVideoPlayer';
import MemoAudioPlayer from './MemoAudioPlayer';
import { compressImage, compressImageAttachment } from '../utils/image';
import {
  deleteBlob,
  downloadUrlForKey,
  isSupported,
  pruneOrphans,
  putBlob,
  urlForKey,
} from '../utils/attachmentStore';
import { MEMO_UPDATED_EVENT, getMemosRaw, pushMemos } from '../api/client';

type AttachmentKind = 'image' | 'video' | 'audio' | 'doc' | 'file';

interface MemoAttachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  mime: string;
  size: number;
  /** 服务端附件库中二进制本体的 key(新数据) */
  blobKey?: string;
  /** 旧数据的 base64 dataURL,仅用于兼容读取与一次性迁移 */
  dataUrl?: string;
}

interface MemoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  remindAt?: string;
  images?: string[];
  attachments?: MemoAttachment[];
}

const MAX_TEXT_LEN = 80;
const MAX_IMAGES = 9;
const MAX_ATTACHMENTS = 5;

const MB = 1024 * 1024;

/**
 * 各类附件的单文件大小上限,0 表示不限制。
 * 二进制存 IndexedDB(非 localStorage),所以这些额度是真实可用的。
 */
const SIZE_LIMITS: Record<AttachmentKind, number> = {
  image: 20 * MB,
  video: 100 * MB,
  audio: 0, // 不限制
  doc: 50 * MB,
  file: 200 * MB,
};

const KIND_LABELS: Record<AttachmentKind, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
  doc: '文档',
  file: '文件',
};

const KIND_ICONS: Record<AttachmentKind, string> = {
  image: 'picture',
  video: 'videoframe',
  audio: 'audiowave',
  doc: 'docfile',
  file: 'paperclip',
};

const VIDEO_ACCEPT = 'video/*';
const AUDIO_ACCEPT = 'audio/*';

/** 常见文档扩展名:部分系统给出的 mime 为空,需要用扩展名兜底判断 */
const DOC_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'csv',
  'rtf',
  'md',
  'odt',
  'ods',
  'odp',
  'pages',
  'numbers',
  'key',
]);

const isDocument = (mime: string, name: string): boolean => {
  if (
    mime === 'application/pdf' ||
    mime === 'application/msword' ||
    mime === 'application/rtf' ||
    mime.startsWith('text/') ||
    mime.startsWith('application/vnd.ms-') ||
    mime.startsWith('application/vnd.openxmlformats-officedocument') ||
    mime.startsWith('application/vnd.oasis.opendocument') ||
    mime.startsWith('application/vnd.apple.')
  ) {
    return true;
  }
  return DOC_EXTENSIONS.has(fileExtension(name).toLowerCase());
};

/**
 * 自动识别附件类型。
 * 「文件」入口不限 accept,靠这里按 mime(mime 缺失时按扩展名)分流:
 * 文档归 doc(50MB 上限),其余归 file(200MB 上限)。
 */
const detectAttachmentKind = (mime: string, name = ''): AttachmentKind => {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (isDocument(mime, name)) return 'doc';
  return 'file';
};

const humanFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const fileExtension = (name: string): string => {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toUpperCase() : '';
};

/**
 * 把附件解析成可直接用于 src / 下载的 URL。
 * 新数据直接用服务端直链 /api/attachments/<key>:服务端支持 Range 请求,
 * 视频可以边播边缓冲、拖动进度条,也不必把整个文件读进内存。
 * 旧数据(尚未迁移的 base64)继续用 dataUrl。
 */
function useAttachmentUrl(att: MemoAttachment): string | null {
  if (att.blobKey) return urlForKey(att.blobKey);
  return att.dataUrl ?? null;
}

const isAttachmentKind = (v: unknown): v is AttachmentKind =>
  v === 'image' ||
  v === 'video' ||
  v === 'audio' ||
  v === 'doc' ||
  v === 'file';

/**
 * 尽量修复而不是丢弃:只要核心字段(id/text/done/createdAt)完好就保留这条备忘,
 * 附件层单独逐项过滤并补齐缺失字段。否则一个坏附件会连带删掉整条备忘的
 * 文字、提醒时间和所有图片,而挂载即回写会让这次丢失不可逆。
 */
const reviveItem = (raw: unknown): MemoItem | null => {
  if (!raw || typeof raw !== 'object') return null;
  const it = raw as Record<string, unknown>;
  if (
    typeof it.id !== 'string' ||
    typeof it.text !== 'string' ||
    typeof it.done !== 'boolean' ||
    typeof it.createdAt !== 'number'
  ) {
    return null;
  }
  const item: MemoItem = {
    id: it.id,
    text: it.text,
    done: it.done,
    createdAt: it.createdAt,
  };
  if (typeof it.remindAt === 'string') item.remindAt = it.remindAt;
  if (Array.isArray(it.images)) {
    const imgs = it.images.filter((v): v is string => typeof v === 'string');
    if (imgs.length > 0) item.images = imgs;
  }
  if (Array.isArray(it.attachments)) {
    const atts = it.attachments
      .map(reviveAttachment)
      .filter((a): a is MemoAttachment => a !== null);
    if (atts.length > 0) item.attachments = atts;
  }
  return item;
};

/** 附件需要 blobKey(新)或 dataUrl(旧)之一才有内容,其余字段可补默认值 */
const reviveAttachment = (raw: unknown): MemoAttachment | null => {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const blobKey = typeof a.blobKey === 'string' && a.blobKey ? a.blobKey : undefined;
  const dataUrl = typeof a.dataUrl === 'string' && a.dataUrl ? a.dataUrl : undefined;
  if (!blobKey && !dataUrl) return null;
  const mime = typeof a.mime === 'string' ? a.mime : 'application/octet-stream';
  const kind = isAttachmentKind(a.kind) ? a.kind : detectAttachmentKind(mime);
  return {
    id: typeof a.id === 'string' ? a.id : genId(),
    kind,
    name: typeof a.name === 'string' ? a.name : '附件',
    mime,
    size: typeof a.size === 'number' ? a.size : 0,
    blobKey,
    dataUrl,
  };
};

/** 从服务端数据(启动时已灌入 api/client 缓存)解析出备忘列表 */
const loadInitial = (): MemoItem[] => {
  const raw = getMemosRaw();
  if (!Array.isArray(raw)) return [];
  return raw.map(reviveItem).filter((it): it is MemoItem => it !== null);
};

/**
 * 乐观写:立即更新缓存并广播,再异步 PUT 到服务端。
 * 服务端写失败时 api/client 会回滚缓存、广播并弹窗,界面随之回到写入前的状态。
 */
const persist = (items: MemoItem[]): boolean => {
  void pushMemos(items);
  return true;
};

const genId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const parseRemindAt = (raw: string): Date | null => {
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

const isOverdue = (raw: string): boolean => {
  const d = parseRemindAt(raw);
  return d !== null && d.getTime() < Date.now();
};

/** 单个已保存附件的展示:自行解析 URL,媒体加载失败时降级成可下载的文件行 */
function AttachmentView({
  att,
  onPreviewImage,
  onPreviewVideo,
  onRemove,
}: {
  att: MemoAttachment;
  /** 单张附件图片以图集形式打开;调用方决定 list 内容 */
  onPreviewImage: (src: string) => void;
  onPreviewVideo: (src: string, name: string) => void;
  onRemove: () => void;
}) {
  const url = useAttachmentUrl(att);
  const [mediaFailed, setMediaFailed] = useState(false);

  const download = () => {
    // 服务端直链带 ?download=1 时会下发 Content-Disposition,中文文件名也不会丢
    const href = att.blobKey ? downloadUrlForKey(att.blobKey) : url;
    if (!href) return;
    const a = document.createElement('a');
    a.href = href;
    a.download = att.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const meta = `${fileExtension(att.name) || KIND_LABELS[att.kind]} · ${humanFileSize(att.size)}`;
  const asMedia = !mediaFailed && !!url;

  return (
    <li className="memo-item-attachment">
      {!url ? (
        <div className="memo-item-file memo-item-file-loading">
          <span className={`memo-att-icon memo-att-icon-${att.kind}`}>
            <SvgIcon name={KIND_ICONS[att.kind]} size={16} />
          </span>
          <span className="memo-att-info">
            <span className="memo-att-name">{att.name}</span>
            <span className="memo-att-meta">读取中…</span>
          </span>
        </div>
      ) : att.kind === 'video' && asMedia ? (
        <button
          type="button"
          className="memo-item-video-thumb"
          onClick={() => onPreviewVideo(url, att.name)}
          title={`播放「${att.name}」`}
        >
          {/* #t=0.1 触发浏览器抓取首帧作为静态缩略图,不会自动播放 */}
          <video
            className="memo-item-video-thumb-media"
            src={`${url}#t=0.1`}
            preload="metadata"
            muted
            playsInline
            onError={() => setMediaFailed(true)}
          />
          <span className="memo-item-video-thumb-play" aria-hidden>
            <SvgIcon name="play" size={22} />
          </span>
          <span className="memo-item-video-thumb-name">
            <SvgIcon name="videoframe" size={12} />
            <span>{att.name}</span>
          </span>
        </button>
      ) : att.kind === 'audio' && asMedia ? (
        <MemoAudioPlayer
          src={url}
          name={att.name}
          onError={() => setMediaFailed(true)}
        />
      ) : att.kind === 'image' && asMedia ? (
        <button
          type="button"
          className="memo-item-image-btn memo-item-attachment-image"
          onClick={() => onPreviewImage(url)}
          title={att.name}
        >
          <img src={url} alt={att.name} onError={() => setMediaFailed(true)} />
        </button>
      ) : (
        // 兜底:任何附件至少可以下载,不会出现既看不到内容也取不出来的死路
        <button
          type="button"
          className="memo-item-file"
          onClick={download}
          title={`下载「${att.name}」`}
        >
          <span className={`memo-att-icon memo-att-icon-${att.kind}`}>
            <SvgIcon name={KIND_ICONS[att.kind]} size={16} />
          </span>
          <span className="memo-att-info">
            <span className="memo-att-name">{att.name}</span>
            <span className="memo-att-meta">
              {mediaFailed ? `无法播放 · ${meta}` : meta}
            </span>
          </span>
          {/* 这个按钮的动作是下载,用下载图标而不是无关的装饰图形 */}
          <SvgIcon name="download" size={14} />
        </button>
      )}
      <button
        type="button"
        className="memo-item-image-remove"
        onClick={onRemove}
        aria-label="删除该附件"
        title="删除该附件"
      >
        ×
      </button>
    </li>
  );
}

export default function MemoCard() {
  const [items, setItems] = useState<MemoItem[]>(loadInitial);
  const [input, setInput] = useState('');
  const [remindInput, setRemindInput] = useState('');
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<
    MemoAttachment[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  // 图片预览:支持图集(item.images 数组内左右切换) —— list 为 1 张时表示单张预览
  const [preview, setPreview] = useState<{ list: string[]; index: number } | null>(null);
  const [previewVideo, setPreviewVideo] = useState<{ src: string; name: string } | null>(null);
  // 正在编辑的备忘 id + 草稿文本;null 表示无编辑中的项
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const editingTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  // 编辑态时把 textarea 高度贴合内容(考虑软换行),避免用固定 rows 导致大段文本被截
  useLayoutEffect(() => {
    const el = editingTextareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [editing?.text]);
  // 上传回调的依赖为空数组,用 ref 读取最新数量,避免 stale closure 算错剩余槽位
  const pendingImagesRef = useRef<string[]>(pendingImages);
  pendingImagesRef.current = pendingImages;
  const pendingAttachmentsRef = useRef<MemoAttachment[]>(pendingAttachments);
  pendingAttachmentsRef.current = pendingAttachments;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const anyFileInputRef = useRef<HTMLInputElement>(null);

  const firstRenderRef = useRef(true);
  // 标记"这批 items 来自服务端"(别的设备改了备忘,轮询同步过来),
  // 这种情况不能再回写一次,否则会变成写-读-写的循环
  const fromServerRef = useRef(false);
  // 上一次"在用"的附件 key 集合,用来判断本次 items 变化是否真的移除了附件,
  // 只有移除了才需要跑服务端孤儿回收(见下)
  const prevUsedRef = useRef<Set<string>>(new Set());

  // 别的设备/别的浏览器改了备忘时,api/client 的轮询会广播这个事件;
  // 写入失败回滚时也会广播,界面随之回到写入前的状态
  useEffect(() => {
    const onExternal = () => {
      fromServerRef.current = true;
      setItems(loadInitial());
    };
    window.addEventListener(MEMO_UPDATED_EVENT, onExternal);
    return () => window.removeEventListener(MEMO_UPDATED_EVENT, onExternal);
  }, []);

  useEffect(() => {
    // 当前所有"在用"的附件 key:备忘里引用的 + 还没点"添加"的待上传队列。
    // 待上传队列也要算在用,否则用户传了附件还没提交时,一次 items 变更就会把它删掉
    const used = new Set<string>();
    for (const it of items) {
      for (const att of it.attachments ?? []) {
        if (att.blobKey) used.add(att.blobKey);
      }
    }
    for (const att of pendingAttachmentsRef.current) {
      if (att.blobKey) used.add(att.blobKey);
    }

    // 挂载首帧不回写:此时 items 只是读取结果,若读取有任何降级,
    // 立即写回会把原始数据永久覆盖掉
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      prevUsedRef.current = used;
      return;
    }
    if (fromServerRef.current) {
      fromServerRef.current = false;
      prevUsedRef.current = used;
      return;
    }
    persist(items);
    // 只有确实移除了附件(上一次在用、这次不在用)才跑服务端孤儿回收。
    // 勾选待办、改文字、改提醒时间这类不动附件的改动占绝大多数,没必要每次都扫一遍
    let removed = false;
    for (const key of prevUsedRef.current) {
      if (!used.has(key)) {
        removed = true;
        break;
      }
    }
    prevUsedRef.current = used;
    if (removed) void pruneOrphans(used);
  }, [items]);

  // 把旧的 base64 附件迁移到 IndexedDB:腾出 localStorage 空间,
  // 也让这些附件享受 Object URL 的流式播放
  useEffect(() => {
    if (!isSupported()) return;
    const legacy = items.some(it =>
      (it.attachments ?? []).some(a => !a.blobKey && a.dataUrl),
    );
    if (!legacy) return;
    let cancelled = false;
    (async () => {
      const migrated = await Promise.all(
        items.map(async it => {
          if (!it.attachments?.some(a => !a.blobKey && a.dataUrl)) return it;
          const atts = await Promise.all(
            it.attachments.map(async att => {
              if (att.blobKey || !att.dataUrl) return att;
              try {
                const blob = await (await fetch(att.dataUrl)).blob();
                const blobKey = `${genId()}-${att.name}`;
                await putBlob(blobKey, blob);
                return { ...att, blobKey, dataUrl: undefined };
              } catch {
                return att; // 迁移失败保留原样,下次再试
              }
            }),
          );
          return { ...it, attachments: atts };
        }),
      );
      if (!cancelled) setItems(migrated);
    })();
    return () => {
      cancelled = true;
    };
    // 只在挂载后跑一次;迁移完成会写回 items,不需要再次触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!preview && !previewVideo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreview(null);
        setPreviewVideo(null);
        return;
      }
      // 图片预览时:方向键切换上一张 / 下一张
      if (!preview || preview.list.length <= 1) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setPreview(p =>
          p ? { ...p, index: (p.index - 1 + p.list.length) % p.list.length } : p,
        );
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setPreview(p =>
          p ? { ...p, index: (p.index + 1) % p.list.length } : p,
        );
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [preview, previewVideo]);

  const handleUploadFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      // 先按剩余槽位截断,避免读完才发现放不下(slice 保留的是旧项,新文件会被静默丢弃)
      const room = MAX_IMAGES - pendingImagesRef.current.length;
      if (room <= 0) {
        window.alert(`最多只能添加 ${MAX_IMAGES} 张图片`);
        return;
      }
      const all = Array.from(files);
      const picked = all.slice(0, room);
      const skipped: string[] = all.slice(room).map(f => f.name);

      setUploading(true);
      try {
        const nextImages: string[] = [];
        for (const file of picked) {
          if (!file.type.startsWith('image/')) {
            skipped.push(`${file.name}(不是图片)`);
            continue;
          }
          // 单个文件失败只跳过它,不连带丢弃前面已处理成功的
          try {
            nextImages.push(
              await compressImage(file, {
                maxSize: 1200,
                targetMaxBytes: 220 * 1024,
              }),
            );
          } catch (e) {
            skipped.push(
              `${file.name}(${e instanceof Error ? e.message : '处理失败'})`,
            );
          }
        }
        if (nextImages.length > 0) {
          setPendingImages(prev => [...prev, ...nextImages]);
        }
        if (skipped.length > 0) {
          window.alert(`以下文件未添加:\n${skipped.join('\n')}`);
        }
      } finally {
        setUploading(false);
      }
    },
    [],
  );

  const removePendingImage = (idx: number) => {
    setPendingImages(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUploadAttachments = useCallback(
    async (files: FileList | null, forceKind?: AttachmentKind) => {
      if (!files || files.length === 0) return;
      const room = MAX_ATTACHMENTS - pendingAttachmentsRef.current.length;
      if (room <= 0) {
        window.alert(`最多只能添加 ${MAX_ATTACHMENTS} 个附件`);
        return;
      }
      const all = Array.from(files);
      const picked = all.slice(0, room);
      const skipped: string[] = all.slice(room).map(f => f.name);

      setUploadingAttachment(true);
      try {
        const next: MemoAttachment[] = [];
        for (const file of picked) {
          const detected = detectAttachmentKind(file.type, file.name);
          // 图片/视频/音频入口必须与真实 mime 一致:accept 只是选择器提示,
          // 用户切到"所有文件"就能绕过,否则大文件会被当音频无上限读入内存
          if (forceKind && detected !== forceKind) {
            skipped.push(`${file.name}(不是${KIND_LABELS[forceKind]}文件)`);
            continue;
          }
          // 「文件」入口不传 forceKind,完全交给自动识别
          const kind = forceKind ?? detected;
          const limit = SIZE_LIMITS[kind];
          if (limit > 0 && file.size > limit) {
            skipped.push(
              `${file.name}(${humanFileSize(file.size)},超过 ${Math.round(limit / MB)}MB 上限)`,
            );
            continue;
          }
          try {
            // 图片附件:相机原图这类大图先做保清晰度压缩(缩到最长边 2048、转 JPEG),
            // 体积从几 MB 降到几百 KB,GIF 动图/已够小的图会原样返回;
            // 视频/音频/文档不动。压缩后落盘的是新 File(名字/mime 都已随之更新)
            const stored =
              kind === 'image' ? await compressImageAttachment(file) : file;
            // 直接把 File(本身就是 Blob)流式落盘:不做 base64 转换,
            // 既没有 33% 膨胀,也不用把整个文件读成 JS 字符串占内存
            const blobKey = `${genId()}-${stored.name}`;
            await putBlob(blobKey, stored);
            next.push({
              id: genId(),
              kind,
              name: stored.name,
              mime: stored.type || file.type || 'application/octet-stream',
              size: stored.size,
              blobKey,
            });
          } catch (e) {
            skipped.push(
              `${file.name}(${e instanceof Error ? e.message : '保存失败'})`,
            );
          }
        }
        if (next.length > 0) {
          setPendingAttachments(prev => [...prev, ...next]);
        }
        if (skipped.length > 0) {
          window.alert(`以下文件未添加:\n${skipped.join('\n')}`);
        }
      } finally {
        setUploadingAttachment(false);
      }
    },
    [],
  );

  const removePendingAttachment = (id: string) => {
    setPendingAttachments(prev => {
      // 顺手删掉已写入的本体,不必等下一次 pruneOrphans
      const target = prev.find(a => a.id === id);
      if (target?.blobKey) void deleteBlob(target.blobKey);
      return prev.filter(a => a.id !== id);
    });
  };

  const addItem = useCallback(() => {
    const text = input.trim();
    if (
      !text &&
      pendingImages.length === 0 &&
      pendingAttachments.length === 0
    )
      return;
    setItems(prev => [
      {
        id: genId(),
        text: text.slice(0, MAX_TEXT_LEN),
        done: false,
        createdAt: Date.now(),
        remindAt: remindInput || undefined,
        images: pendingImages.length > 0 ? [...pendingImages] : undefined,
        attachments:
          pendingAttachments.length > 0 ? [...pendingAttachments] : undefined,
      },
      ...prev,
    ]);
    setInput('');
    setRemindInput('');
    setPendingImages([]);
    setPendingAttachments([]);
  }, [input, remindInput, pendingImages, pendingAttachments]);

  const toggle = useCallback((id: string) => {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, done: !it.done } : it)));
  }, []);

  const remove = useCallback((id: string) => {
    setItems(prev => prev.filter(it => it.id !== id));
  }, []);

  const updateText = useCallback((id: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return; // 空文字不落盘,由 UI 层引导用户取消或重填
    setItems(prev =>
      prev.map(it => (it.id === id ? { ...it, text: trimmed } : it)),
    );
  }, []);

  const setRemind = useCallback((id: string, value: string) => {
    setItems(prev =>
      prev.map(it =>
        it.id === id ? { ...it, remindAt: value || undefined } : it,
      ),
    );
  }, []);

  const removeImageFromItem = useCallback(
    (id: string, imgIdx: number) => {
      setItems(prev =>
        prev.map(it => {
          if (it.id !== id) return it;
          const nextImgs = (it.images ?? []).filter((_, i) => i !== imgIdx);
          return {
            ...it,
            images: nextImgs.length > 0 ? nextImgs : undefined,
          };
        }),
      );
    },
    [],
  );

  const removeAttachmentFromItem = useCallback(
    (id: string, attId: string) => {
      setItems(prev =>
        prev.map(it => {
          if (it.id !== id) return it;
          const next = (it.attachments ?? []).filter(a => a.id !== attId);
          return {
            ...it,
            attachments: next.length > 0 ? next : undefined,
          };
        }),
      );
    },
    [],
  );

  const clearDone = useCallback(() => {
    setItems(prev => prev.filter(it => !it.done));
  }, []);

  const total = items.length;
  const done = items.filter(it => it.done).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  // 待上传附件按类型分别计数,显示在工具按钮 icon 角标上
  const countOf = (kind: AttachmentKind) =>
    pendingAttachments.filter(a => a.kind === kind).length;
  const videoCount = countOf('video');
  const audioCount = countOf('audio');
  // 文档与其他文件共用一个入口,角标合并计数
  const fileCount = countOf('doc') + countOf('file');
  const attachmentFull = pendingAttachments.length >= MAX_ATTACHMENTS;

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        const aRemind = a.remindAt ? new Date(a.remindAt).getTime() : Infinity;
        const bRemind = b.remindAt ? new Date(b.remindAt).getTime() : Infinity;
        if (aRemind !== bRemind) return aRemind - bRemind;
        return b.createdAt - a.createdAt;
      }),
    [items],
  );

  return (
    <section className="memo-card">
      <header className="memo-header">
        <h2 className="section-title">
          <span className="section-title-icon">
            <SvgIcon name="notebook" size={20} />
          </span>
          备忘
        </h2>
        <div className="memo-actions">
          {total > 0 && (
            <span className="memo-progress-text">
              已完成 {done} / {total}
            </span>
          )}
          {done > 0 && (
            <button className="memo-clear" type="button" onClick={clearDone}>
              清除已完成
            </button>
          )}
        </div>
      </header>

      <form
        className="memo-form"
        onSubmit={e => {
          e.preventDefault();
          addItem();
        }}
      >
        {/* 输入区:无边框灰底整块,右下角放字数 */}
        <div className="memo-composer">
          <textarea
            className="memo-input"
            rows={2}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                addItem();
              }
            }}
            placeholder="添加一条备忘,例如:记得带作业本"
            maxLength={MAX_TEXT_LEN}
          />
          <span className="memo-composer-count">
            {input.length}/{MAX_TEXT_LEN}
          </span>
        </div>

        {pendingImages.length > 0 && (
          <div className="memo-pending-images">
            {pendingImages.map((src, idx) => (
              <div className="memo-pending-image" key={idx}>
                <img src={src} alt={`附件 ${idx + 1}`} />
                <button
                  type="button"
                  className="memo-pending-image-remove"
                  onClick={() => removePendingImage(idx)}
                  aria-label="移除该图片"
                  title="移除"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {pendingAttachments.length > 0 && (
          <ul className="memo-pending-attachments">
            {pendingAttachments.map(att => (
              <li className="memo-pending-attachment" key={att.id}>
                <span className={`memo-att-icon memo-att-icon-${att.kind}`}>
                  <SvgIcon name={KIND_ICONS[att.kind]} size={14} />
                </span>
                <span className="memo-att-info">
                  <span className="memo-att-name" title={att.name}>
                    {att.name}
                  </span>
                  <span className="memo-att-meta">
                    {fileExtension(att.name) || KIND_LABELS[att.kind]}
                    {' · '}
                    {humanFileSize(att.size)}
                  </span>
                </span>
                <button
                  type="button"
                  className="memo-pending-image-remove"
                  onClick={() => removePendingAttachment(att.id)}
                  aria-label="移除该附件"
                  title="移除"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* 工具条:左侧 icon 在上文字在下的竖排按钮,右侧时间 + 主按钮 */}
        <div className="memo-toolbar">
          <div className="memo-tool-group">
            <button
              type="button"
              className="memo-tool"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || pendingImages.length >= MAX_IMAGES}
              title="上传图片"
            >
              <span className="memo-tool-icon">
                <SvgIcon name="picture" size={20} />
                {pendingImages.length > 0 && (
                  <em className="memo-tool-badge">{pendingImages.length}</em>
                )}
              </span>
              <span className="memo-tool-text">
                {uploading ? '处理中' : '图片'}
              </span>
            </button>
            <button
              type="button"
              className="memo-tool"
              onClick={() => videoInputRef.current?.click()}
              disabled={uploadingAttachment || attachmentFull}
              title="上传视频"
            >
              <span className="memo-tool-icon">
                <SvgIcon name="videoframe" size={20} />
                {videoCount > 0 && (
                  <em className="memo-tool-badge">{videoCount}</em>
                )}
              </span>
              <span className="memo-tool-text">视频</span>
            </button>
            <button
              type="button"
              className="memo-tool"
              onClick={() => audioInputRef.current?.click()}
              disabled={uploadingAttachment || attachmentFull}
              title="上传音频"
            >
              <span className="memo-tool-icon">
                <SvgIcon name="audiowave" size={20} />
                {audioCount > 0 && (
                  <em className="memo-tool-badge">{audioCount}</em>
                )}
              </span>
              <span className="memo-tool-text">音频</span>
            </button>
            {/* 文档与其他文件合并为一个入口,类型由 detectAttachmentKind 自动识别 */}
            <button
              type="button"
              className="memo-tool"
              onClick={() => anyFileInputRef.current?.click()}
              disabled={uploadingAttachment || attachmentFull}
              title="上传文件"
            >
              <span className="memo-tool-icon">
                <SvgIcon name="paperclip" size={20} />
                {fileCount > 0 && (
                  <em className="memo-tool-badge">{fileCount}</em>
                )}
              </span>
              <span className="memo-tool-text">文件</span>
            </button>
          </div>

          <div className="memo-toolbar-right">
            <span className="memo-toolbar-divider" />
            <DateTimePicker
              value={remindInput}
              onChange={setRemindInput}
              placeholder="时间"
              tone="joy"
              icon="alarm"
              iconSize={18}
            />
            <button
              className="memo-add-btn"
              type="submit"
              disabled={
                !input.trim() &&
                pendingImages.length === 0 &&
                pendingAttachments.length === 0
              }
            >
              添加
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={e => {
            handleUploadFiles(e.target.files);
            if (e.target) e.target.value = '';
          }}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept={VIDEO_ACCEPT}
          multiple
          hidden
          onChange={e => {
            handleUploadAttachments(e.target.files, 'video');
            if (e.target) e.target.value = '';
          }}
        />
        <input
          ref={audioInputRef}
          type="file"
          accept={AUDIO_ACCEPT}
          multiple
          hidden
          onChange={e => {
            handleUploadAttachments(e.target.files, 'audio');
            if (e.target) e.target.value = '';
          }}
        />
        {/* 任意文件:不限 accept,类型与大小上限按 mime / 扩展名自动判定 */}
        <input
          ref={anyFileInputRef}
          type="file"
          multiple
          hidden
          onChange={e => {
            handleUploadAttachments(e.target.files);
            if (e.target) e.target.value = '';
          }}
        />
      </form>

      {total > 0 && (
        <div className="memo-progress">
          <div className="memo-progress-fill" style={{ width: `${percent}%` }} />
        </div>
      )}

      {total === 0 ? (
        <p className="memo-empty">还没有备忘事项,先加一条吧</p>
      ) : (
        <ul className="memo-items">
          {sorted.map(item => {
            const overdue = item.remindAt && !item.done && isOverdue(item.remindAt);
            const imgs = item.images ?? [];
            return (
              <li
                key={item.id}
                className={`memo-item${item.done ? ' memo-item-done' : ''}${overdue ? ' memo-item-overdue' : ''}`}
              >
                {editing?.id === item.id ? (
                  <div className="memo-toggle memo-toggle-editing">
                    <button
                      type="button"
                      className={`memo-check memo-check-standalone${item.done ? ' checked' : ''}`}
                      onClick={() => toggle(item.id)}
                      aria-pressed={item.done}
                      aria-label={item.done ? '取消完成' : '标记完成'}
                    >
                      {item.done && (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <polyline points="4 12 10 18 20 6" />
                        </svg>
                      )}
                    </button>
                    <textarea
                      ref={editingTextareaRef}
                      className="memo-text-input"
                      autoFocus
                      rows={1}
                      value={editing.text}
                      onChange={e =>
                        setEditing({ id: item.id, text: e.target.value })
                      }
                      onKeyDown={e => {
                        // Enter 保存;Shift+Enter 换行;Esc 取消
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          updateText(item.id, editing.text);
                          setEditing(null);
                        } else if (e.key === 'Escape') {
                          setEditing(null);
                        }
                      }}
                      onBlur={() => {
                        updateText(item.id, editing.text);
                        setEditing(null);
                      }}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className="memo-toggle"
                    onClick={() => toggle(item.id)}
                    aria-pressed={item.done}
                  >
                    <span className={`memo-check${item.done ? ' checked' : ''}`}>
                      {item.done && (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <polyline points="4 12 10 18 20 6" />
                        </svg>
                      )}
                    </span>
                    <span className="memo-text-block">
                      <span className="memo-text">{item.text}</span>
                    </span>
                  </button>
                )}
                {imgs.length > 0 && (
                  <div className="memo-item-images" data-count={imgs.length}>
                    {imgs.map((src, idx) => (
                      <div className="memo-item-image" key={idx}>
                        <button
                          type="button"
                          className="memo-item-image-btn"
                          onClick={() => setPreview({ list: imgs, index: idx })}
                        >
                          <img src={src} alt={`备忘图 ${idx + 1}`} />
                        </button>
                        <button
                          type="button"
                          className="memo-item-image-remove"
                          onClick={() => removeImageFromItem(item.id, idx)}
                          aria-label="删除该图片"
                          title="删除该图片"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {(item.attachments ?? []).length > 0 && (
                  <ul className="memo-item-attachments">
                    {(item.attachments ?? []).map(att => (
                      <AttachmentView
                        key={att.id}
                        att={att}
                        onPreviewImage={src =>
                          setPreview({ list: [src], index: 0 })
                        }
                        onPreviewVideo={(src, name) => setPreviewVideo({ src, name })}
                        onRemove={() =>
                          removeAttachmentFromItem(item.id, att.id)
                        }
                      />
                    ))}
                  </ul>
                )}
                <div className="memo-time-edit">
                  <DateTimePicker
                    value={item.remindAt ?? ''}
                    onChange={v => setRemind(item.id, v)}
                    placeholder="时间"
                    tone={overdue ? 'joy' : 'grape'}
                    icon="alarm"
                    iconSize={18}
                  />
                </div>
                <button
                  type="button"
                  className="memo-edit"
                  onClick={() =>
                    setEditing({ id: item.id, text: item.text })
                  }
                  aria-label="编辑"
                  title="编辑"
                >
                  <SvgIcon name="pencil" size={14} />
                </button>
                <button
                  type="button"
                  className="memo-remove"
                  onClick={() => remove(item.id)}
                  aria-label="删除"
                  title="删除"
                >
                  <SvgIcon name="trash" size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {preview &&
        createPortal(
          (() => {
            const total = preview.list.length;
            const src = preview.list[preview.index];
            const goPrev = () =>
              setPreview(p =>
                p ? { ...p, index: (p.index - 1 + p.list.length) % p.list.length } : p,
              );
            const goNext = () =>
              setPreview(p =>
                p ? { ...p, index: (p.index + 1) % p.list.length } : p,
              );
            // 触屏 swipe:touchstart 记录起点,touchend 判断 delta
            let touchStartX: number | null = null;
            const onTouchStart = (e: React.TouchEvent) => {
              touchStartX = e.touches[0]?.clientX ?? null;
            };
            const onTouchEnd = (e: React.TouchEvent) => {
              if (touchStartX == null || total <= 1) return;
              const dx = (e.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
              touchStartX = null;
              // 40px 阈值:小抖动不算切换
              if (dx > 40) goPrev();
              else if (dx < -40) goNext();
            };
            return (
              <div
                className="memo-preview-backdrop"
                role="dialog"
                aria-modal="true"
                aria-label="图片预览"
                onClick={() => setPreview(null)}
              >
                <div
                  className="memo-preview-stage"
                  onClick={e => e.stopPropagation()}
                  onTouchStart={onTouchStart}
                  onTouchEnd={onTouchEnd}
                >
                  <img
                    src={src}
                    alt={`预览大图 ${preview.index + 1}/${total}`}
                    className="memo-preview-image"
                  />
                  {total > 1 && (
                    <>
                      <button
                        type="button"
                        className="memo-preview-nav memo-preview-nav-prev"
                        onClick={goPrev}
                        aria-label="上一张"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        className="memo-preview-nav memo-preview-nav-next"
                        onClick={goNext}
                        aria-label="下一张"
                      >
                        ›
                      </button>
                      <div className="memo-preview-counter">
                        {preview.index + 1} / {total}
                      </div>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  className="memo-preview-close"
                  onClick={() => setPreview(null)}
                  aria-label="关闭"
                >
                  ×
                </button>
              </div>
            );
          })(),
          document.body,
        )}

      {previewVideo &&
        createPortal(
          <div
            className="memo-preview-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="视频预览"
            onClick={() => setPreviewVideo(null)}
          >
            <div
              className="memo-preview-video-shell"
              onClick={e => e.stopPropagation()}
            >
              <MemoVideoPlayer
                src={previewVideo.src}
                name={previewVideo.name}
              />
            </div>
            <button
              type="button"
              className="memo-preview-close"
              onClick={() => setPreviewVideo(null)}
              aria-label="关闭"
            >
              ×
            </button>
          </div>,
          document.body,
        )}
    </section>
  );
}
