/**
 * 展示日相对今天的文案。
 *
 * offsetDays 由 getDisplayDay 产出:0=今天,1=明天,>=2=更晚的下一课日
 * (周末或假期时会跳过若干天)。这里集中一处,避免各组件各写一套导致口径不一致。
 */
export const offsetLabel = (offsetDays: number): string => {
  if (offsetDays <= 0) return '今日';
  if (offsetDays === 1) return '明日';
  return `${offsetDays}天后`;
};

/** 用于句子中的说法,例如"明天是 周一" / "2天后是 周一" */
export const offsetSentenceLabel = (offsetDays: number): string => {
  if (offsetDays <= 0) return '今天';
  if (offsetDays === 1) return '明天';
  return `${offsetDays}天后`;
};
