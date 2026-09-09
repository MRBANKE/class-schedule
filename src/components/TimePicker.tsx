import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { SvgIcon } from '../icons';
import Wheel, { type WheelItem } from './Wheel';
import './pickers.css';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  size?: 'sm' | 'md';
  tone?: 'grape' | 'grass' | 'joy' | 'sunshine';
  allowClear?: boolean;
  minuteStep?: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

export default function TimePicker({
  value,
  onChange,
  placeholder = 'HH:MM',
  size = 'md',
  tone = 'grape',
  allowClear = true,
  minuteStep = 1,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string>(value);
  const [hourText, setHourText] = useState<string>('');
  const [minuteText, setMinuteText] = useState<string>('');

  useEffect(() => {
    if (open) {
      const init = value || '08:00';
      setDraft(init);
      const [hh, mm] = init.split(':');
      setHourText(hh ?? '08');
      setMinuteText(mm ?? '00');
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

  const [dh, dm] = draft
    ? draft.split(':').map(v => Number.parseInt(v, 10))
    : [8, 0];

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

  const confirm = () => {
    onChange(`${pad(dh)}:${pad(dm)}`);
    setOpen(false);
  };

  return (
    <div className={`tp tp-${size} tp-tone-${tone}`}>
      <button
        type="button"
        className={`tp-trigger${open ? ' tp-trigger-open' : ''}`}
        onClick={() => setOpen(true)}
      >
        <SvgIcon name="clock" size={14} />
        <span className={value ? 'tp-trigger-value' : 'tp-trigger-placeholder'}>
          {value || placeholder}
        </span>
      </button>

      {open &&
        createPortal(
          <div
            className={`tp-modal-backdrop tp-tone-${tone}`}
            onClick={() => setOpen(false)}
          >
            <div
              className="tp-modal"
              role="dialog"
              onClick={e => e.stopPropagation()}
            >
              <div className="tp-modal-header">
                <div className="tp-modal-title">选择时间</div>
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
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  className="tp-display-input"
                  value={hourText}
                  onChange={e => {
                    const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
                    setHourText(raw);
                    if (raw.length > 0) {
                      const n = Math.min(23, Number.parseInt(raw, 10));
                      setDraft(`${pad(n)}:${pad(dm)}`);
                    }
                  }}
                  onBlur={() => {
                    const n = Math.min(
                      23,
                      Math.max(0, Number.parseInt(hourText || '0', 10)),
                    );
                    setHourText(pad(n));
                    setDraft(`${pad(n)}:${pad(dm)}`);
                  }}
                  onFocus={e => e.target.select()}
                  aria-label="小时"
                />
                <span className="tp-display-sep">:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  className="tp-display-input"
                  value={minuteText}
                  onChange={e => {
                    const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
                    setMinuteText(raw);
                    if (raw.length > 0) {
                      const n = Math.min(59, Number.parseInt(raw, 10));
                      setDraft(`${pad(dh)}:${pad(n)}`);
                    }
                  }}
                  onBlur={() => {
                    const n = Math.min(
                      59,
                      Math.max(0, Number.parseInt(minuteText || '0', 10)),
                    );
                    setMinuteText(pad(n));
                    setDraft(`${pad(dh)}:${pad(n)}`);
                  }}
                  onFocus={e => e.target.select()}
                  aria-label="分钟"
                />
              </div>

              <div className="tp-wheels">
                <Wheel
                  items={hourItems}
                  value={String(dh)}
                  onChange={k => {
                    const n = Number.parseInt(k, 10);
                    setHourText(pad(n));
                    setDraft(`${pad(n)}:${pad(dm)}`);
                  }}
                  ariaLabel="小时"
                />
                <div className="tp-wheels-sep">:</div>
                <Wheel
                  items={minuteItems}
                  value={String(dm)}
                  onChange={k => {
                    const n = Number.parseInt(k, 10);
                    setMinuteText(pad(n));
                    setDraft(`${pad(dh)}:${pad(n)}`);
                  }}
                  ariaLabel="分钟"
                />
              </div>

              <div className="tp-footer">
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
