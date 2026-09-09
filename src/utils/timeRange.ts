/**
 * 节次时间("HH:MM - HH:MM")的统一安全解析。
 *
 * 后台编辑器始终写入 `${start} - ${end}`,但导入 JSON 或手改 localStorage
 * 可能产生 "08:00-08:40" 这类无空格写法。此前各处用 split(' - ') 硬解析,
 * 拿到 undefined 后再 .split(':') 会直接抛 TypeError 导致整页白屏,
 * 且只在时间越过某节次起点后才触发,极难排查。
 */

/** "HH:MM" → 当天分钟数;格式非法返回 null */
export const parseHHMM = (raw: string | undefined): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((raw ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
};

/** 解析节次时间区间,任一端非法则该端为 null。分隔符按 '-' 切分,容忍空格有无 */
export const parseTimeRange = (
  time: string | undefined,
): { start: number | null; end: number | null } => {
  const parts = (time ?? '').split('-');
  return {
    start: parseHHMM(parts[0]),
    end: parseHHMM(parts[1]),
  };
};
