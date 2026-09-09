import type { PeriodConfig } from '../config/types';
import { parseTimeRange } from './timeRange';

export function getCurrentPeriodIndex(
  periods: PeriodConfig[],
  now: Date = new Date(),
): number | null {
  if (typeof window !== 'undefined') {
    const override = new URLSearchParams(window.location.search).get('period');
    if (override !== null) {
      const n = Number.parseInt(override, 10);
      if (Number.isFinite(n) && n >= 0 && n < periods.length) return n;
      if (override === 'off') return null;
    }
  }
  const minutes = now.getHours() * 60 + now.getMinutes();
  for (let i = 0; i < periods.length; i += 1) {
    const { start, end } = parseTimeRange(periods[i].time);
    if (start === null || end === null) continue; // 时间格式异常的节次跳过,不参与匹配
    if (minutes >= start && minutes < end) return i;
  }
  return null;
}
