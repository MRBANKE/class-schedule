import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { SvgIcon } from '../icons';
import Wheel, { type WheelItem } from './Wheel';
import './pickers.css';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  tone?: 'grape' | 'grass' | 'joy' | 'sunshine' | 'sky' | 'rose';
  allowClear?: boolean;
  yearsBack?: number;
  yearsForward?: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

const WEEK_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const parseDate = (s: string): { y: number; m: number; d: number } | null => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(v => Number.parseInt(v, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return { y, m, d };
};

const daysInMonth = (year: number, month: number): number =>
  new Date(year, month, 0).getDate();

const formatDisplay = (raw: string): string => {
  const parsed = parseDate(raw);
  if (!parsed) return '';
  const date = new Date(parsed.y, parsed.m - 1, parsed.d);
  return `${parsed.y}年${parsed.m}月${parsed.d}日 · ${WEEK_LABELS[date.getDay()]}`;
};

export default function DatePicker({
  value,
  onChange,
  placeholder = '选择日期',
  tone = 'grape',
  allowClear = true,
  yearsBack = 2,
  yearsForward = 3,
}: Props) {
  const [open, setOpen] = useState(false);
  const currentYear = new Date().getFullYear();
  const initY = currentYear;
  const initM = new Date().getMonth() + 1;
  const initD = new Date().getDate();

  const [dy, setDy] = useState<number>(initY);
  const [dm, setDm] = useState<number>(initM);
  const [dd, setDd] = useState<number>(initD);

  useEffect(() => {
    if (!open) return;
    const parsed = parseDate(value);
    if (parsed) {
      setDy(parsed.y);
      setDm(parsed.m);
      setDd(parsed.d);
    } else {
      const now = new Date();
      setDy(now.getFullYear());
      setDm(now.getMonth() + 1);
      setDd(now.getDate());
    }
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
    };
  }, [open]);

  const yearItems: WheelItem[] = useMemo(() => {
    const list: WheelItem[] = [];
    for (let y = currentYear - yearsBack; y <= currentYear + yearsForward; y += 1) {
      list.push({ key: String(y), label: `${y}` });
    }
    return list;
  }, [currentYear, yearsBack, yearsForward]);

  const monthItems: WheelItem[] = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        key: String(i + 1),
        label: `${i + 1}月`,
      })),
    [],
  );

  const dayItems: WheelItem[] = useMemo(() => {
    const total = daysInMonth(dy, dm);
    return Array.from({ length: total }, (_, i) => ({
      key: String(i + 1),
      label: `${i + 1}日`,
    }));
  }, [dy, dm]);

  useEffect(() => {
    const total = daysInMonth(dy, dm);
    if (dd > total) setDd(total);
  }, [dy, dm, dd]);

  const confirm = () => {
    onChange(`${dy}-${pad(dm)}-${pad(dd)}`);
    setOpen(false);
  };

  const goToday = () => {
    const now = new Date();
    setDy(now.getFullYear());
    setDm(now.getMonth() + 1);
    setDd(now.getDate());
  };

  const previewDate = new Date(dy, dm - 1, dd);
  const previewText = `${dy}年${dm}月${dd}日 ${WEEK_LABELS[previewDate.getDay()]}`;

  const displayText = formatDisplay(value);

  return (
    <div className={`tp tp-md tp-tone-${tone}`}>
      <button
        type="button"
        className={`tp-trigger${open ? ' tp-trigger-open' : ''}`}
        onClick={() => setOpen(true)}
      >
        <SvgIcon name="calendar" size={14} />
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
              onClick={e => e.stopPropagation()}
            >
              <div className="tp-modal-header">
                <div className="tp-modal-title">选择日期</div>
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
                <span className="tp-display-date">{previewText}</span>
              </div>

              <div className="tp-wheels tp-wheels-3">
                <Wheel
                  items={yearItems}
                  value={String(dy)}
                  onChange={k => setDy(Number.parseInt(k, 10))}
                  ariaLabel="年"
                />
                <Wheel
                  items={monthItems}
                  value={String(dm)}
                  onChange={k => setDm(Number.parseInt(k, 10))}
                  ariaLabel="月"
                />
                <Wheel
                  items={dayItems}
                  value={String(dd)}
                  onChange={k => setDd(Number.parseInt(k, 10))}
                  ariaLabel="日"
                />
              </div>

              <div className="tp-footer">
                <button
                  type="button"
                  className="tp-btn tp-btn-ghost"
                  onClick={goToday}
                >
                  今天
                </button>
                {allowClear && value && (
                  <button
                    type="button"
                    className="tp-btn tp-btn-ghost"
                    onClick={() => {
                      onChange('');
                      setOpen(false);
                    }}
                  >
                    清除
                  </button>
                )}
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
