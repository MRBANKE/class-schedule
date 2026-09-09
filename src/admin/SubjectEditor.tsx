import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SubjectItem } from '../config/types';
import { ICONS, SvgIcon } from '../icons';
import type { IconName } from '../icons';
import AvatarCropModal from './AvatarCropModal';

// 40 个 2026 义务教育阶段常见课程标志性图标(去除与课程无关的装饰图标)
const SUBJECT_ICONS: IconName[] = [
  // 语文 · 阅读 · 书法
  'book', 'bookmark', 'feather', 'pencil', 'notebook', 'brush',
  // 数学 · 几何 · 统计
  'calc', 'ruler', 'chart', 'puzzle',
  // 英语 · 外语 · 演讲
  'globe', 'globe2', 'microphone',
  // 体育与健康
  'dumbbell', 'target', 'heartpulse', 'heart',
  // 道法 · 心理 · 思维
  'brain', 'scale', 'chess',
  // 音乐 · 美术 · 影视
  'music', 'piano', 'palette', 'film', 'camera',
  // 科学 · 生物 · 化学
  'flask', 'atom', 'dna', 'sprout',
  // 信息科技 · 创造
  'laptop', 'robot', 'bulb',
  // 天文 · 探索
  'moon', 'star', 'rocket',
  // 班会 · 社团 · 劳动 · 记录
  'users', 'community', 'broom', 'clipboard', 'medal',
];

const PRESET_COLORS = [
  '#FCE7DC', '#DDE7FA', '#E4D8F5', '#F5E7C4', '#FCE1C6', '#F6D9F0',
  '#F7F1C7', '#D6EEDC', '#CFEEDE', '#D5E4FB', '#E4E1F7', '#DDD5F7',
  '#FBE5D6', '#FFF3C4', '#FED4DA', '#CFEDF3', '#D8F1CE', '#EBEBEB',
];

interface Props {
  subject: SubjectItem;
  isNew?: boolean;
  allowDelete: boolean;
  siblings: SubjectItem[];
  onSave: (next: SubjectItem, originalName: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

type IconMode = 'preset' | 'custom' | 'none';

const detectMode = (s: SubjectItem): IconMode => {
  if (s.hideIcon) return 'none';
  if (s.iconImage) return 'custom';
  return 'preset';
};

export default function SubjectEditor({
  subject,
  isNew,
  allowDelete,
  siblings,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [draft, setDraft] = useState<SubjectItem>(subject);
  const [iconMode, setIconMode] = useState<IconMode>(() => detectMode(subject));
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const validIcons = SUBJECT_ICONS.filter(n => n in ICONS);

  useEffect(() => {
    setDraft(subject);
    setIconMode(detectMode(subject));
  }, [subject]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const updateDraft = (patch: Partial<SubjectItem>) => {
    setDraft(prev => ({ ...prev, ...patch }));
  };

  const switchIconMode = (mode: IconMode) => {
    setIconMode(mode);
    if (mode === 'preset') {
      updateDraft({ iconImage: undefined, hideIcon: false });
    } else if (mode === 'custom') {
      updateDraft({ hideIcon: false });
    } else {
      updateDraft({ hideIcon: true, iconImage: undefined });
    }
  };

  const handlePickFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      window.alert('请选择图片文件');
      return;
    }
    setCropFile(file);
  };

  const handleCropConfirm = (dataUrl: string) => {
    updateDraft({ iconImage: dataUrl, hideIcon: false });
    setCropFile(null);
  };

  const handleSave = () => {
    const trimmed = draft.name.trim();
    if (!trimmed) {
      window.alert('课程名不能为空');
      return;
    }
    // 重名校验:归一化两端空格 + 折叠内部多空格,避免"数学 "与"数学"、"数 学"绕过校验
    const norm = (s: string) => s.trim().replace(/\s+/g, ' ');
    const key = norm(trimmed);
    if (siblings.some(s => norm(s.name) === key)) {
      window.alert(`已存在名为「${trimmed}」的课程,请换个名字或直接使用现有课程`);
      return;
    }
    onSave({ ...draft, name: trimmed }, subject.name);
  };

  return createPortal(
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div
        className="admin-modal-panel"
        role="dialog"
        onClick={e => e.stopPropagation()}
      >
        <header className="admin-modal-header">
          <h3>{isNew ? '新增课程' : '编辑课程'}</h3>
          <button
            type="button"
            className="admin-modal-close"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </header>

        <div className="admin-modal-body">
          <div
            className="admin-modal-preview"
            style={{ background: draft.color }}
          >
            {!draft.hideIcon && (
              <span className="admin-modal-preview-icon">
                {draft.iconImage ? (
                  <img
                    src={draft.iconImage}
                    alt=""
                    className="admin-modal-preview-icon-img"
                  />
                ) : (
                  <SvgIcon name={draft.icon} size={22} />
                )}
              </span>
            )}
            <span className="admin-modal-preview-name">
              {draft.name || '未命名'}
            </span>
          </div>

          <div className="admin-field">
            <label className="admin-label" htmlFor="subj-name">课程名</label>
            <input
              id="subj-name"
              className="admin-input"
              value={draft.name}
              maxLength={12}
              placeholder="例如：数学"
              onChange={e => updateDraft({ name: e.target.value })}
              autoFocus
            />
          </div>

          <div className="admin-field">
            <div className="admin-label">颜色</div>
            <div className="admin-color-grid">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`admin-color-swatch${c === draft.color ? ' admin-color-swatch-active' : ''}`}
                  style={{ background: c }}
                  onClick={() => updateDraft({ color: c })}
                />
              ))}
            </div>
            <label className="admin-color-custom">
              <span>自定义</span>
              <input
                type="color"
                value={draft.color}
                onChange={e => updateDraft({ color: e.target.value })}
              />
            </label>
          </div>

          <div className="admin-field">
            <div className="admin-label">图标</div>
            <div className="admin-icon-mode-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={iconMode === 'preset'}
                className={`admin-icon-mode-tab${iconMode === 'preset' ? ' admin-icon-mode-tab-active' : ''}`}
                onClick={() => switchIconMode('preset')}
              >
                选择图标
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={iconMode === 'custom'}
                className={`admin-icon-mode-tab${iconMode === 'custom' ? ' admin-icon-mode-tab-active' : ''}`}
                onClick={() => switchIconMode('custom')}
              >
                上传图标
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={iconMode === 'none'}
                className={`admin-icon-mode-tab${iconMode === 'none' ? ' admin-icon-mode-tab-active' : ''}`}
                onClick={() => switchIconMode('none')}
              >
                不显示
              </button>
            </div>

            {iconMode === 'preset' && (
              <div className="admin-icon-grid admin-icon-grid-scroll">
                {validIcons.map(name => (
                  <button
                    key={name}
                    type="button"
                    className={`admin-icon-cell${name === draft.icon ? ' admin-icon-cell-active' : ''}`}
                    onClick={() => updateDraft({ icon: name })}
                    title={name}
                  >
                    <SvgIcon name={name} size={20} />
                  </button>
                ))}
              </div>
            )}

            {iconMode === 'custom' && (
              <div className="admin-icon-upload">
                <div
                  className="admin-icon-upload-preview"
                  style={{ background: draft.color }}
                >
                  {draft.iconImage ? (
                    <img src={draft.iconImage} alt="自定义图标" />
                  ) : (
                    <SvgIcon name="camera" size={22} />
                  )}
                </div>
                <div className="admin-icon-upload-actions">
                  <button
                    type="button"
                    className="admin-btn admin-btn-grape"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {draft.iconImage ? '更换图片' : '上传图片'}
                  </button>
                  {draft.iconImage && (
                    <button
                      type="button"
                      className="admin-btn"
                      onClick={() => updateDraft({ iconImage: undefined })}
                    >
                      清除
                    </button>
                  )}
                  <div className="admin-inline-hint admin-inline-hint-sm">
                    可拖动缩放裁剪
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={e => {
                    handlePickFile(e.target.files?.[0] ?? null);
                    if (e.target) e.target.value = '';
                  }}
                />
              </div>
            )}

            {iconMode === 'none' && (
              <div className="admin-inline-hint">只显示课程名与颜色</div>
            )}
          </div>

          <div className="admin-field">
            <label className="admin-label" htmlFor="subj-kind">
              节次类型
            </label>
            <select
              id="subj-kind"
              className="admin-input"
              value={draft.kind ?? 'class'}
              onChange={e =>
                updateDraft({ kind: e.target.value as SubjectItem['kind'] })
              }
            >
              <option value="class">上课</option>
              <option value="break">休息 · 午休</option>
              <option value="after-school">课后服务</option>
            </select>
            <div className="admin-inline-hint">
              决定上课时显示的状态文案
            </div>
          </div>

          <div className="admin-field">
            <label className="admin-label" htmlFor="subj-reminder">
              备注（上课提醒）
            </label>
            <input
              id="subj-reminder"
              className="admin-input"
              value={draft.reminder ?? ''}
              maxLength={40}
              placeholder="例如：带铅笔和橡皮"
              onChange={e =>
                updateDraft({
                  reminder: e.target.value ? e.target.value : undefined,
                })
              }
            />
          </div>

          <div className="admin-field">
            <div className="admin-label">上课周次</div>
            <div className="admin-week-radio">
              <button
                type="button"
                className={`admin-week-radio-item admin-week-radio-item-every${(draft.weekMode ?? 'every') === 'every' ? ' admin-week-radio-item-active' : ''}`}
                onClick={() =>
                  updateDraft({
                    weekMode: undefined,
                    oddSubject: undefined,
                    evenSubject: undefined,
                  })
                }
              >
                <span className="admin-week-radio-icon">
                  <SvgIcon name="calendar" size={18} />
                </span>
                <span className="admin-week-radio-text">
                  <span className="admin-week-radio-label">每周</span>
                  <span className="admin-week-radio-hint">
                    每周都上这门课
                  </span>
                </span>
              </button>
              <button
                type="button"
                className={`admin-week-radio-item admin-week-radio-item-biweekly${draft.weekMode === 'biweekly' ? ' admin-week-radio-item-active' : ''}`}
                onClick={() => updateDraft({ weekMode: 'biweekly' })}
              >
                <span className="admin-week-radio-icon">
                  <SvgIcon name="refresh" size={18} />
                </span>
                <span className="admin-week-radio-text">
                  <span className="admin-week-radio-label">单双周切换</span>
                  <span className="admin-week-radio-hint">
                    单周 / 双周分别上不同课
                  </span>
                </span>
              </button>
            </div>
            {draft.weekMode === 'biweekly' && (
              <div className="admin-week-pair">
                <label className="admin-week-pair-row admin-week-pair-row-odd">
                  <span className="admin-week-pair-tag">单周</span>
                  <select
                    className="admin-input"
                    value={draft.oddSubject ?? ''}
                    onChange={e =>
                      updateDraft({
                        oddSubject: e.target.value || undefined,
                      })
                    }
                  >
                    <option value="">— 请选择单周课程 —</option>
                    {siblings
                      .filter(
                        s =>
                          s.name !== draft.name && s.weekMode !== 'biweekly',
                      )
                      .map(s => (
                        <option key={s.name} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="admin-week-pair-row admin-week-pair-row-even">
                  <span className="admin-week-pair-tag">双周</span>
                  <select
                    className="admin-input"
                    value={draft.evenSubject ?? ''}
                    onChange={e =>
                      updateDraft({
                        evenSubject: e.target.value || undefined,
                      })
                    }
                  >
                    <option value="">— 请选择双周课程 —</option>
                    {siblings
                      .filter(
                        s =>
                          s.name !== draft.name && s.weekMode !== 'biweekly',
                      )
                      .map(s => (
                        <option key={s.name} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="admin-inline-hint">按当前周次自动切换</div>
              </div>
            )}
          </div>

        </div>

        <footer className="admin-modal-footer">
          {!isNew && (
            <button
              type="button"
              className="admin-btn admin-btn-danger"
              onClick={onDelete}
              disabled={!allowDelete}
            >
              删除
            </button>
          )}
          <div className="admin-modal-footer-spacer" />
          <button
            type="button"
            className="admin-btn"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={handleSave}
          >
            保存
          </button>
        </footer>
      </div>

      {cropFile && (
        <AvatarCropModal
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={handleCropConfirm}
        />
      )}
    </div>,
    document.body,
  );
}
