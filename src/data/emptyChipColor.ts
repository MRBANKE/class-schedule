// 未安排课程时的 chip 背景色候选,与常规课程配色调性一致
export const EMPTY_CHIP_COLORS = [
  '#ffb3ba',
  '#ffc98a',
  '#ffe08a',
  '#c4e3a0',
  '#a5e0d0',
  '#a8cff5',
  '#b8bffa',
  '#dcb8f5',
  '#f5b8dc',
  '#f0c4a1',
];

// 按 (day, idx) 稳定伪随机取色,同一格在不同视图看到的颜色一致
export function pickEmptyChipColor(day: string, idx: number): string {
  const key = `${day}-${idx}`;
  let h = 0;
  for (let i = 0; i < key.length; i += 1) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return EMPTY_CHIP_COLORS[h % EMPTY_CHIP_COLORS.length];
}
