import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Ref } from 'react';

export interface WheelItem {
  key: string;
  label: string;
  sub?: string;
}

export interface WheelHandle {
  /**
   * 立即按当前滚动位置结算,并同步返回选中的 key。
   * 滚动停止后要等 100ms 防抖才会触发 onChange,用户滚完立刻点"完成"时
   * state 里还是旧值;调用方需要用这个返回值,而不是读 state。
   */
  commit: () => string | null;
}

interface Props {
  items: WheelItem[];
  value: string;
  onChange: (key: string) => void;
  itemHeight?: number;
  visibleCount?: number;
  ariaLabel?: string;
  ref?: Ref<WheelHandle>;
}

export default function Wheel({
  items,
  value,
  onChange,
  itemHeight = 40,
  visibleCount = 5,
  ariaLabel,
  ref,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const height = itemHeight * visibleCount;
  const padding = (height - itemHeight) / 2;
  const foundIndex = items.findIndex(i => i.key === value);
  // -1 表示 value 不在选项里(如 minuteStep=5 时的 :47),此时不要强行归到第 0 项,
  // 否则轮子高亮 00、顶部显示 :47,点完成又存 :47,三处互相矛盾
  const currentIndex = foundIndex < 0 ? null : foundIndex;
  const [scrollFrac, setScrollFrac] = useState<number>(currentIndex ?? 0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || currentIndex === null) return;
    const target = currentIndex * itemHeight;
    if (Math.abs(el.scrollTop - target) > 2) {
      el.scrollTop = target;
    }
    setScrollFrac(currentIndex);
  }, [currentIndex, itemHeight]);

  // 卸载时清掉待触发的防抖定时器与 raf,避免对已卸载组件 setState
  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  /** 把 scrollTop 换算成选项下标 */
  const indexFromScroll = (scrollTop: number): number =>
    Math.max(0, Math.min(items.length - 1, Math.round(scrollTop / itemHeight)));

  useImperativeHandle(
    ref,
    () => ({
      commit: () => {
        const el = scrollRef.current;
        if (!el) return value || null;
        if (timerRef.current) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        const nextKey = items[indexFromScroll(el.scrollTop)]?.key ?? null;
        if (nextKey && nextKey !== value) onChange(nextKey);
        return nextKey;
      },
    }),
    [items, itemHeight, value, onChange],
  );

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setScrollFrac(el.scrollTop / itemHeight);
    });
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      const clamped = indexFromScroll(el.scrollTop);
      const target = clamped * itemHeight;
      if (Math.abs(el.scrollTop - target) > 1) {
        el.scrollTo({ top: target, behavior: 'smooth' });
      }
      const nextKey = items[clamped]?.key;
      if (nextKey && nextKey !== value) {
        onChange(nextKey);
      }
    }, 100);
  };

  const jump = (idx: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: idx * itemHeight, behavior: 'smooth' });
  };

  return (
    <div className="wheel" style={{ height }} role="listbox" aria-label={ariaLabel}>
      <div className="wheel-band" style={{ top: padding, height: itemHeight }} aria-hidden />
      <div
        ref={scrollRef}
        className="wheel-scroll"
        style={{ height }}
        onScroll={handleScroll}
      >
        <div className="wheel-spacer" style={{ height: padding }} aria-hidden />
        {items.map((it, idx) => {
          const activeIdx = Math.round(scrollFrac);
          const isActive = idx === activeIdx;
          const dist = Math.abs(idx - scrollFrac);
          const clamped = Math.min(dist, 3);
          const scale = Math.max(0.7, 1 - clamped * 0.14);
          const opacity = Math.max(0.32, 1 - clamped * 0.28);
          return (
            <button
              type="button"
              key={it.key}
              className={`wheel-item wheel-item-d${Math.min(
                Math.round(dist),
                3,
              )}${isActive ? ' wheel-item-active' : ''}`}
              style={{
                height: itemHeight,
                transform: `scale(${scale})`,
                opacity,
              }}
              onClick={() => {
                jump(idx);
                onChange(it.key);
              }}
              role="option"
              aria-selected={isActive}
            >
              <span className="wheel-item-label">{it.label}</span>
              {it.sub && <span className="wheel-item-sub">{it.sub}</span>}
            </button>
          );
        })}
        <div className="wheel-spacer" style={{ height: padding }} aria-hidden />
      </div>
    </div>
  );
}
