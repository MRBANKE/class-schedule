import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Student } from '../../config/types';
import { SvgIcon } from '../../icons';
import {
  fetchProvinces,
  fetchCities,
  type NmcProvince,
  type NmcCity,
} from '../../utils/weather';
import AvatarCropModal from '../AvatarCropModal';
import { uploadAvatar } from '../../api/client';

const AVATAR_PRESETS: string[] = Array.from({ length: 25 }, (_, i) =>
  `/avatars/avatar-${String(i + 1).padStart(2, '0')}.jpg`,
);

const TARGET_MAX_BYTES = 200 * 1024;
const CANVAS_SIZES = [320, 256, 200, 160, 128];
const QUALITIES = [0.85, 0.72, 0.6, 0.48];

const readFileAsDataURL = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('读取失败'));
    reader.onerror = () => reject(reader.error ?? new Error('读取失败'));
    reader.readAsDataURL(file);
  });

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解析失败'));
    img.src = src;
  });

const dataUrlBytes = (dataUrl: string): number => {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) return dataUrl.length;
  const b64 = dataUrl.slice(commaIdx + 1);
  return Math.floor((b64.length * 3) / 4);
};

/** data URI → Blob,用于把裁剪结果(或存量 base64 头像)当二进制上传 */
const dataUrlToBlob = (dataUrl: string): Blob => {
  const comma = dataUrl.indexOf(',');
  const head = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const mime = /data:([^;,]+)/.exec(head)?.[1] || 'image/jpeg';
  const bin = /;base64/i.test(head) ? atob(body) : decodeURIComponent(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

/** 按指定裁剪矩形导出正方形头像,压缩到 200KB 以内 */
export function exportSquareAvatar(
  img: HTMLImageElement,
  sx: number,
  sy: number,
  side: number,
): string {
  let smallest: string | null = null;
  for (const target of CANVAS_SIZES) {
    const canvas = document.createElement('canvas');
    canvas.width = target;
    canvas.height = target;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 不可用');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, side, side, 0, 0, target, target);
    for (const q of QUALITIES) {
      const out = canvas.toDataURL('image/jpeg', q);
      if (dataUrlBytes(out) <= TARGET_MAX_BYTES) return out;
      if (smallest === null || dataUrlBytes(out) < dataUrlBytes(smallest)) {
        smallest = out;
      }
    }
  }
  return smallest ?? img.src;
}

export { readFileAsDataURL, loadImage };

interface Props {
  student: Student;
  onChange: (patch: Partial<Student>) => void;
  siblingIds: string[];
  onChangeId: (nextId: string) => string | null;
  isFirstStudent?: boolean;
  superMode?: boolean;
}

const SLUG_PATTERN = /^[a-zA-Z0-9_-]+$/;

const buildBoardUrl = (studentId: string): string => {
  if (typeof window === 'undefined') return '';
  // 用 origin 拼绝对路径:超管页自身 pathname 是 /superadmin/xxx,拼相对地址会出错
  return `${window.location.origin}/board?id=${encodeURIComponent(studentId)}`;
};

export default function BasicSection({
  student,
  onChange,
  siblingIds,
  onChangeId,
  superMode = false,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [slugDraft, setSlugDraft] = useState(student.id);
  const [slugError, setSlugError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [provinces, setProvinces] = useState<NmcProvince[]>([]);
  const [cities, setCities] = useState<NmcCity[]>([]);
  const [selectedProvince, setSelectedProvince] = useState<string>('');
  const [selectedCityCode, setSelectedCityCode] = useState<string>('');
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingProvinces(true);
    fetchProvinces().then(list => {
      if (!cancelled) {
        setProvinces(list);
        setLoadingProvinces(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedProvince) {
      setCities([]);
      return;
    }
    let cancelled = false;
    setLoadingCities(true);
    fetchCities(selectedProvince).then(list => {
      if (!cancelled) {
        setCities(list);
        setLoadingCities(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedProvince]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false);
    };
    document.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = '';
    };
  }, [pickerOpen]);

  useEffect(() => {
    setSlugDraft(student.id);
    setSlugError('');
  }, [student.id]);

  const commitSlug = () => {
    const next = slugDraft.trim();
    if (!next || next === student.id) {
      setSlugDraft(student.id);
      setSlugError('');
      return;
    }
    if (!SLUG_PATTERN.test(next)) {
      setSlugError('只能包含英文、数字、- 或 _');
      return;
    }
    if (siblingIds.includes(next)) {
      setSlugError('已被其他学生使用');
      return;
    }
    const err = onChangeId(next);
    if (err) {
      setSlugError(err);
    } else {
      setSlugError('');
    }
  };

  const boardUrl = buildBoardUrl(student.id);
  const [boardCopied, setBoardCopied] = useState(false);

  const copyTo = async (text: string): Promise<boolean> => {
    if (!text) return false;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      return true;
    } catch {
      return false;
    }
  };

  const handleCopyBoard = async () => {
    const ok = await copyTo(boardUrl);
    if (ok) {
      setBoardCopied(true);
      setTimeout(() => setBoardCopied(false), 1600);
    }
  };

  const [uploading, setUploading] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);

  const handleUpload = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      window.alert('请选择图片文件');
      return;
    }
    setCropFile(file);
  };

  const handleCropConfirm = async (dataUrl: string) => {
    setUploading(true);
    try {
      // 存成文件、拿一个普通静态图地址,不再把 base64 塞进配置
      const url = await uploadAvatar(dataUrlToBlob(dataUrl));
      onChange({ logoImage: url });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '上传头像失败');
    } finally {
      setCropFile(null);
      setUploading(false);
    }
  };

  // 存量迁移:老配置里的头像是 base64 data URI(分享预览抓不到)。后台打开该学生时
  // 悄悄转存成文件、把 logoImage 换成 /api/avatar 路径,每个学生只尝试一次。
  const avatarMigratedRef = useRef<string | null>(null);
  useEffect(() => {
    const img = student.logoImage;
    if (!img || !img.startsWith('data:')) return;
    if (avatarMigratedRef.current === student.id) return;
    avatarMigratedRef.current = student.id;
    uploadAvatar(dataUrlToBlob(img))
      .then((url) => onChange({ logoImage: url }))
      .catch(() => {
        /* 迁移失败不打扰用户:base64 头像仍能正常显示,下次可手动重传 */
      });
    // onChange 每次渲染都是新引用,不进依赖以免重复触发;id/logoImage 变化即重判
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id, student.logoImage]);

  return (
    <div className="admin-section">
      <h3 className="admin-subsection-title">外观</h3>
      <p className="admin-subsection-hint">头像与标题</p>
      <div className="admin-field">
        <div className="admin-logo-current">
          <button
            type="button"
            className="admin-logo-preview admin-logo-preview-btn"
            onClick={() => setPickerOpen(true)}
            title="点击更换头像"
          >
            {student.logoImage ? (
              <img src={student.logoImage} alt="" />
            ) : (
              <SvgIcon name={student.logoIcon} size={30} />
            )}
            <span className="admin-logo-preview-mask">更换</span>
          </button>
          <div className="admin-logo-current-info">
            <div className="admin-inline-row">
              <button
                type="button"
                className="admin-btn admin-btn-grape"
                onClick={() => setPickerOpen(true)}
                disabled={uploading}
              >
                选择头像
              </button>
              <button
                type="button"
                className="admin-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? '处理中…' : '上传头像'}
              </button>
            </div>
            <div className="admin-inline-hint admin-inline-hint-sm">
              可拖动裁剪
            </div>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={e => {
            handleUpload(e.target.files?.[0] ?? null);
            if (e.target) e.target.value = '';
          }}
        />
      </div>

      <div className="admin-field">
        <label className="admin-label" htmlFor="admin-title-input">
          标题
        </label>
        <input
          id="admin-title-input"
          type="text"
          className="admin-input"
          value={student.title}
          maxLength={30}
          placeholder="例如：1.2班 课程表"
          onChange={e => onChange({ title: e.target.value })}
        />
      </div>

      <div className="admin-field">
        <label className="admin-label" htmlFor="admin-share-desc-input">
          分享描述
        </label>
        <input
          id="admin-share-desc-input"
          type="text"
          className="admin-input"
          value={student.shareDescription ?? ''}
          maxLength={60}
          placeholder="分享到微信时卡片的描述，留空自动生成"
          onChange={e => onChange({ shareDescription: e.target.value })}
        />
      </div>

      {superMode && (
        <div className="admin-field">
          <label className="admin-label" htmlFor="admin-slug-input">
            学生 ID
          </label>
          <div className="admin-slug-row">
            <input
              id="admin-slug-input"
              type="text"
              className={`admin-input admin-input-mono admin-slug-input${slugError ? ' admin-input-error' : ''}`}
              value={slugDraft}
              maxLength={30}
              placeholder="student1"
              onChange={e => {
                setSlugDraft(e.target.value);
                setSlugError('');
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitSlug();
                }
              }}
            />
            {/* 保存按钮:显式提交才生效,避免用户改到一半焦点丢失时被自动写入 */}
            <button
              type="button"
              className="admin-btn admin-btn-mini admin-btn-grass"
              onClick={commitSlug}
              disabled={slugDraft.trim() === student.id}
            >
              保存
            </button>
            {/* 用 student.id 而不是 slugDraft:后者可能是未提交的中间值,打开会拿不到学生 */}
            <a
              className="admin-btn admin-btn-mini admin-btn-grape admin-slug-open"
              href={`/?id=${encodeURIComponent(student.id)}#today`}
              target="_blank"
              rel="noreferrer"
              title={`打开学生「${student.id}」的课表页面`}
            >
              打开
            </a>
          </div>
          {slugError ? (
            <div className="admin-slug-error">{slugError}</div>
          ) : (
            <div className="admin-inline-hint">
              支持英文、数字、- 和 _
            </div>
          )}
        </div>
      )}

      {superMode && (
        <>
          <h3 className="admin-subsection-title">底部菜单</h3>
          <p className="admin-subsection-hint">关闭后家长端不显示该 tab</p>
        </>
      )}
      {superMode && (
        <div className="admin-field">
          <div className="admin-tab-toggles admin-tab-toggles-left">
            <label className="admin-switch admin-switch-inline">
              <input
                type="checkbox"
                checked={student.showMemo}
                onChange={e => onChange({ showMemo: e.target.checked })}
              />
              <span className="admin-switch-slider" />
              <span className="admin-switch-label">
                <SvgIcon name="notebook" size={14} />
                备忘
              </span>
            </label>
            <label className="admin-switch admin-switch-inline">
              <input
                type="checkbox"
                checked={student.showAdmin}
                onChange={e => onChange({ showAdmin: e.target.checked })}
              />
              <span className="admin-switch-slider" />
              <span className="admin-switch-label">
                <SvgIcon name="laptop" size={14} />
                管理
              </span>
            </label>
          </div>
        </div>
      )}

      <h3 className="admin-subsection-title">看板</h3>
      <p className="admin-subsection-hint">
        用于展示屏(墨水屏、教室大屏)常驻的独立视图
      </p>
      <div className="admin-field">
        <div className="admin-tab-toggles">
          <label className="admin-switch admin-switch-inline">
            <input
              type="checkbox"
              checked={student.boardShowWeather !== false}
              onChange={e =>
                onChange({ boardShowWeather: e.target.checked })
              }
            />
            <span className="admin-switch-slider" />
            <span className="admin-switch-label">
              <SvgIcon name="sun" size={14} />
              天气
            </span>
          </label>
          <label className="admin-switch admin-switch-inline">
            <input
              type="checkbox"
              checked={student.boardShowMemo !== false}
              onChange={e => onChange({ boardShowMemo: e.target.checked })}
            />
            <span className="admin-switch-slider" />
            <span className="admin-switch-label">
              <SvgIcon name="notebook" size={14} />
              备忘
            </span>
          </label>
          <label className="admin-switch admin-switch-inline">
            <input
              type="checkbox"
              checked={student.boardShowReminder !== false}
              onChange={e =>
                onChange({ boardShowReminder: e.target.checked })
              }
            />
            <span className="admin-switch-slider" />
            <span className="admin-switch-label">
              <SvgIcon name="bulb" size={14} />
              课程备注
            </span>
          </label>
        </div>
        <div className="admin-inline-hint">关闭后看板不显示该模块</div>
      </div>

      <div className="admin-field">
        <div className="admin-label">看板风格</div>
        <div className="admin-week-radio">
          <button
            type="button"
            className={`admin-week-radio-item admin-week-radio-item-every${
              (student.boardStyle ?? 'default') === 'default'
                ? ' admin-week-radio-item-active'
                : ''
            }`}
            onClick={() => onChange({ boardStyle: 'default' })}
          >
            <span className="admin-week-radio-icon">
              <SvgIcon name="palette" size={18} />
            </span>
            <span className="admin-week-radio-text">
              <span className="admin-week-radio-label">彩色(默认)</span>
              <span className="admin-week-radio-hint">彩色渐变卡片</span>
            </span>
          </button>
          <button
            type="button"
            className={`admin-week-radio-item admin-week-radio-item-ink${
              student.boardStyle === 'ink'
                ? ' admin-week-radio-item-active'
                : ''
            }`}
            onClick={() => onChange({ boardStyle: 'ink' })}
          >
            <span className="admin-week-radio-icon">
              <SvgIcon name="book" size={18} />
            </span>
            <span className="admin-week-radio-text">
              <span className="admin-week-radio-label">墨水屏</span>
              <span className="admin-week-radio-hint">纯白底描边风格</span>
            </span>
          </button>
        </div>
      </div>

      <div className="admin-field">
        <label className="admin-label">看板链接</label>
        <div className="admin-full-url">
          <code className="admin-full-url-text" title={boardUrl}>
            {boardUrl || '—'}
          </code>
          <div className="admin-full-url-actions">
            <a
              className="admin-btn admin-btn-mini admin-btn-sky"
              href={boardUrl}
              target="_blank"
              rel="noreferrer"
            >
              打开
            </a>
            <button
              type="button"
              className={`admin-btn admin-btn-mini admin-btn-grass${boardCopied ? ' admin-btn-primary' : ''}`}
              onClick={handleCopyBoard}
            >
              {boardCopied ? '已复制' : '复制链接'}
            </button>
          </div>
        </div>
        <div className="admin-inline-hint">用于展示屏常驻,自适应屏幕</div>
      </div>

      <h3 className="admin-subsection-title">天气地区</h3>
      <p className="admin-subsection-hint">今日页与看板均取该地区天气</p>
      <div className="admin-field">
        <div className="admin-weather-current">
          <SvgIcon name="sun" size={16} />
          <span className="admin-weather-current-city">
            {student.weatherCity || '未设置'}
          </span>
          <code className="admin-weather-code">{student.weatherStation || '—'}</code>
        </div>
        <div className="admin-weather-picker">
          <select
            className="admin-input admin-weather-select"
            value={selectedProvince}
            onChange={e => {
              setSelectedProvince(e.target.value);
              setSelectedCityCode('');
            }}
            disabled={loadingProvinces}
          >
            <option value="">
              {loadingProvinces ? '省份加载中…' : '选择省份'}
            </option>
            {provinces.map(p => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            className="admin-input admin-weather-select"
            value={selectedCityCode}
            onChange={e => {
              const code = e.target.value;
              setSelectedCityCode(code);
              if (!code) return;
              const city = cities.find(c => c.code === code);
              if (!city) return;
              onChange({
                weatherStation: city.code,
                weatherCity: city.name,
              });
            }}
            disabled={!selectedProvince || loadingCities}
          >
            <option value="">
              {loadingCities
                ? '城市加载中…'
                : cities.length === 0 && selectedProvince
                  ? '暂无城市'
                  : '选择市/区'}
            </option>
            {cities.map(c => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {pickerOpen &&
        createPortal(
          <div
            className="admin-modal-backdrop"
            onClick={() => setPickerOpen(false)}
          >
            <div
              className="admin-modal-panel"
              role="dialog"
              onClick={e => e.stopPropagation()}
            >
              <header className="admin-modal-header">
                <h3>选择预设头像</h3>
                <button
                  type="button"
                  className="admin-modal-close"
                  onClick={() => setPickerOpen(false)}
                  aria-label="关闭"
                >
                  ×
                </button>
              </header>
              <div className="admin-modal-body">
                <div className="admin-avatar-grid">
                  {AVATAR_PRESETS.map(path => {
                    const active = student.logoImage === path;
                    return (
                      <button
                        key={path}
                        type="button"
                        className={`admin-avatar-item${active ? ' admin-avatar-item-active' : ''}`}
                        onClick={() => {
                          onChange({ logoImage: path });
                          setPickerOpen(false);
                        }}
                        aria-label={path}
                      >
                        <img src={path} alt="" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {cropFile && (
        <AvatarCropModal
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={handleCropConfirm}
        />
      )}
    </div>
  );
}
