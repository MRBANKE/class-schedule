import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SvgIcon } from '../icons';
import Wheel, { type WheelHandle, type WheelItem } from './Wheel';
import './pickers.css';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  tone?: 'grape' | 'grass' | 'joy' | 'sunshine';
  minuteStep?: number;
  dateRangeDays?: number;
  /** 触发按钮图标,提醒类场景可传 alarm */
  icon?: string;
  /** 触发按钮图标尺寸,填充风格图标(如 alarm)需比描边图标大一些 */
  iconSize?: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

const WEEK_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const toIsoDate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const parseValue = (raw: string): { date: string; time: string } => {
  if (!raw) return { date: '', time: '' };
  const [d, t] = raw.split('T');
  return { date: d ?? '', time: (t ?? '').slice(0, 5) };
};

const parseDate = (s: string): Date | null => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(v => Number.parseInt(v, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(y, m - 1, d);
};

const buildDateItems = (rangeDays: number): WheelItem[] => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const items: WheelItem[] = [];
  const past = 30;
  const future = rangeDays;
  for (let offset = -past; offset <= future; offset += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    const key = toIsoDate(d);
    let label = `${d.getMonth() + 1}月${d.getDate()}日`;
    if (offset === 0) label = '今天';
    else if (offset === 1) label = '明天';
    else if (offset === 2) label = '后天';
    else if (offset === -1) label = '昨天';
    const sub =
      offset === 0
        ? WEEK_LABELS[d.getDay()]
        : `${d.getFullYear() === today.getFullYear() ? '' : d.getFullYear() + '年'}${WEEK_LABELS[d.getDay()]}`;
    items.push({ key, label, sub });
  }
  return items;
};

/** 常用提醒时间快捷项:免去滚三个轮子 */
const QUICK_PRESETS: { label: string; dayOffset: number; hour: number }[] = [
  { label: '今晚 20:00', dayOffset: 0, hour: 20 },
  { label: '明早 08:00', dayOffset: 1, hour: 8 },
  { label: '明晚 20:00', dayOffset: 1, hour: 20 },
  { label: '后天 08:00', dayOffset: 2, hour: 8 },
];

const presetToValue = (preset: {
  dayOffset: number;
  hour: number;
}): { date: string; time: string } => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + preset.dayOffset);
  return { date: toIsoDate(d), time: `${pad(preset.hour)}:00` };
};

/** 已过去的快捷项不再展示:否则 22 点还能一键点出"今晚 20:00"这种已过期的提醒 */
const isPresetPast = (preset: { dayOffset: number; hour: number }): boolean => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + preset.dayOffset);
  d.setHours(preset.hour, 0, 0, 0);
  return d.getTime() <= Date.now();
};

const formatDisplay = (raw: string): string => {
  const { date, time } = parseValue(raw);
  if (!date) return '';
  const d = parseDate(date);
  if (!d) return raw;
  const now = new Date();
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  const sameYear = d.getFullYear() === now.getFullYear();
  const stamp = sameYear ? md : `${d.getFullYear()}/${md}`;
  return time ? `${stamp} ${time}` : stamp;
};

export default function DateTimePicker({
  value,
  onChange,
  placeholder = '选择时间',
  tone = 'joy',
  minuteStep = 5,
  dateRangeDays = 365,
  icon = 'calendar',
  iconSize = 14,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draftDate, setDraftDate] = useState<string>('');
  const [draftTime, setDraftTime] = useState<string>('');
  /** 每次打开时记录当天日期,用于刷新"今天/明天/后天"标签而不必依赖 open 本身 */
  const [openedOn, setOpenedOn] = useState<string>('');
  const dateWheelRef = useRef<WheelHandle>(null);
  const hourWheelRef = useRef<WheelHandle>(null);
  const minuteWheelRef = useRef<WheelHandle>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const parsed = parseValue(value);
    setDraftDate(parsed.date || toIsoDate(new Date()));
    setDraftTime(parsed.time || '08:00');
    setOpenedOn(toIsoDate(new Date()));
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = '';
      // 关闭后把焦点还给触发按钮,否则键盘用户焦点会丢失在被遮罩挡住的区域
      triggerRef.current?.focus();
    };
  }, [open]);

  // 依赖 openedOn 而非 open:每次打开重算,保证跨过零点后"今天"指向正确的那一天
  const dateItems = useMemo(
    () => buildDateItems(dateRangeDays),
    [dateRangeDays, openedOn],
  );

  const hourItems: WheelItem[] = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        key: String(i),
        label: pad(i),
      })),
    [],
  );

  const minuteItems: WheelItem[] = useMemo(() => {
    const step = Math.max(1, minuteStep);
    const list: WheelItem[] = [];
    for (let m = 0; m < 60; m += step) {
      list.push({ key: String(m), label: pad(m) });
    }
    return list;
  }, [minuteStep]);

  const [dh, dm] = draftTime
    ? draftTime.split(':').map(v => Number.parseInt(v, 10))
    : [8, 0];

  const confirm = () => {
    // 先把三个轮子的当前滚动位置同步结算:用户滚完立刻点"完成"时,
    // 防抖回调还没触发,直接读 draft* 会存成滚动前的旧值
    const date = dateWheelRef.current?.commit() ?? draftDate;
    const hourKey = hourWheelRef.current?.commit();
    const minuteKey = minuteWheelRef.current?.commit();
    const h = hourKey !== null && hourKey !== undefined ? Number.parseInt(hourKey, 10) : dh;
    const m =
      minuteKey !== null && minuteKey !== undefined ? Number.parseInt(minuteKey, 10) : dm;

    if (!date) {
      onChange('');
      setOpen(false);
      return;
    }
    onChange(
      `${date}T${pad(Number.isFinite(h) ? h : dh)}:${pad(Number.isFinite(m) ? m : dm)}`,
    );
    setOpen(false);
  };

  const goToday = () => {
    const now = new Date();
    // 分钟必须对齐到 minuteStep:否则 :47 不在轮子选项里,
    // 会出现"轮子停在 00、顶部显示 :47"的三处不一致
    const step = Math.max(1, minuteStep);
    const total = now.getHours() * 60 + Math.round(now.getMinutes() / step) * step;
    const clamped = Math.min(total, 23 * 60 + 59 - ((23 * 60 + 59) % step));
    setDraftDate(toIsoDate(now));
    setDraftTime(`${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`);
  };

  const displayDate = draftDate ? parseDate(draftDate) : null;
  const displayDateText = displayDate
    ? `${displayDate.getFullYear()}年${displayDate.getMonth() + 1}月${displayDate.getDate()}日 ${WEEK_LABELS[displayDate.getDay()]}`
    : '';

  const displayText = formatDisplay(value);

  return (
    <div className={`tp tp-md tp-tone-${tone}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`tp-trigger${open ? ' tp-trigger-open' : ''}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <SvgIcon name={icon} size={iconSize} />
        <span className={value ? 'tp-trigger-value' : 'tp-trigger-placeholder'}>
          {displayText || placeholder}
        </span>
      </button>

      {open &&
        createPortal(
          <div
            className={`tp-modal-backdrop tp-tone-${tone}`}
            onClick={() => setOpen(false)}
          >
            <div
              className="tp-modal tp-modal-wide"
              role="dialog"
              aria-modal="true"
              aria-labelledby="tp-modal-title"
              onClick={e => e.stopPropagation()}
            >
              <div className="tp-modal-header">
                <div className="tp-modal-title" id="tp-modal-title">
                  选择日期和时间
                </div>
                <button
                  type="button"
                  className="tp-modal-close"
                  onClick={() => setOpen(false)}
                  aria-label="关闭"
                >
                  ×
                </button>
              </div>

              <div className="tp-display tp-display-live">
                <span className="tp-display-date">{displayDateText}</span>
                <span className="tp-display-time">
                  {pad(dh)}:{pad(dm)}
                </span>
              </div>

              <div className="tp-quick">
                {QUICK_PRESETS.filter(p => !isPresetPast(p)).map(preset => {
                  const target = presetToValue(preset);
                  const active =
                    draftDate === target.date && draftTime === target.time;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      className={`tp-quick-chip${active ? ' tp-quick-chip-active' : ''}`}
                      onClick={() => {
                        setDraftDate(target.date);
                        setDraftTime(target.time);
                      }}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              <div className="tp-wheels tp-wheels-3">
                <Wheel
                  ref={dateWheelRef}
                  items={dateItems}
                  value={draftDate}
                  onChange={setDraftDate}
                  ariaLabel="日期"
                />
                <Wheel
                  ref={hourWheelRef}
                  items={hourItems}
                  value={String(dh)}
                  onChange={k =>
                    setDraftTime(`${pad(Number.parseInt(k, 10))}:${pad(dm)}`)
                  }
                  ariaLabel="小时"
                />
                <Wheel
                  ref={minuteWheelRef}
                  items={minuteItems}
                  value={String(dm)}
                  onChange={k =>
                    setDraftTime(`${pad(dh)}:${pad(Number.parseInt(k, 10))}`)
                  }
                  ariaLabel="分钟"
                />
              </div>

              <div className="tp-footer tp-footer-split">
                <div className="tp-footer-left">
                  <button
                    type="button"
                    className="tp-btn tp-btn-ghost"
                    onClick={goToday}
                  >
                    此刻
                  </button>
                  {value && (
                    <button
                      type="button"
                      className="tp-btn tp-btn-ghost tp-btn-danger"
                      onClick={() => {
                        onChange('');
                        setOpen(false);
                      }}
                    >
                      清除
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="tp-btn tp-btn-primary"
                  onClick={confirm}
                >
                  完成
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
