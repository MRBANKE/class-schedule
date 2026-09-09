import type { PeriodConfig as Period, PeriodKind } from '../config/types';
import { parseTimeRange } from './timeRange';
import { offsetLabel } from './dayOffset';

export type PeriodStatusTone = 'past' | 'active' | 'soon' | 'future' | 'preview';

export interface PeriodStatus {
  label: string;
  tone: PeriodStatusTone;
}

const formatWaitLabel = (mins: number): string => {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `${h} 小时后开始` : `${h} 小时 ${m} 分钟后开始`;
  }
  return `${mins} 分钟后开始`;
};

export function computePeriodStatus(
  period: Period,
  now: Date,
  /** 展示日距今天的偏移:0=今天,1=明天,>=2=更晚的课日 */
  offsetDays: number,
  isEmpty: boolean = false,
  kind: PeriodKind = 'class',
): PeriodStatus {
  const { start: startMin, end: endMin } = parseTimeRange(period.time);
  const startText = (period.time ?? '').split('-')[0]?.trim() ?? '';

  // 非今天:只报"哪天 + 几点开始",不按当前时钟算进度
  if (offsetDays > 0) {
    return {
      label: `${offsetLabel(offsetDays)} ${startText} 开始`,
      tone: 'preview',
    };
  }

  // 时间格式异常(如导入的 JSON 写成 08:00-08:40 之外的形式):不参与状态计算
  if (startMin === null || endMin === null) {
    return { label: period.time || '', tone: 'future' };
  }

  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const startSec = startMin * 60;
  const endSec = endMin * 60;

  if (nowSec < startSec) {
    const remainSec = startSec - nowSec;
    const remainMin = Math.max(1, Math.ceil(remainSec / 60));
    return {
      label: formatWaitLabel(remainMin),
      tone: remainMin <= 10 ? 'soon' : 'future',
    };
  }

  if (nowSec < endSec) {
    if (isEmpty && kind !== 'break') {
      return { label: '没有课', tone: 'past' };
    }
    const passedSec = nowSec - startSec;
    const passedMin = Math.floor(passedSec / 60);
    const verb = kind === 'break' ? '正在休息' : '正在上课';
    if (passedMin < 1) return { label: `${verb} · 刚开始`, tone: 'active' };
    return { label: `${verb} · 已 ${passedMin} 分钟`, tone: 'active' };
  }

  return { label: '已结束', tone: 'past' };
}
