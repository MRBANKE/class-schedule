import type { IconName } from '../icons';
import { parseTimeRange } from './timeRange';
import type { PeriodConfig as Period, PeriodKind, Weekday } from '../config/types';

/** 节次起始时刻文本,格式异常时返回空串而不是 undefined */
const startTextOf = (period: Period | undefined): string =>
  (period?.time ?? '').split('-')[0]?.trim() ?? '';

const formatMinutes = (mins: number): string => {
  if (mins < 60) return `${mins} 分钟`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分钟`;
};

export type CountdownTone = 'active' | 'break' | 'idle' | 'off';

export interface CountdownState {
  tone: CountdownTone;
  icon: IconName;
  title: string;
  subtitle: string;
  progress?: number;
}

export function computeCountdown(params: {
  now: Date;
  periods: Period[];
  today: Weekday | null;
  /** 展示日距今天的偏移:0=今天,1=明天,>=2=更晚的课日(周末/假期时) */
  offsetDays: number;
  scheduleForDay: string[] | null;
  kindsForDay?: PeriodKind[];
}): CountdownState {
  const { now, periods, today, offsetDays, scheduleForDay, kindsForDay } = params;
  const kindAt = (i: number): PeriodKind => kindsForDay?.[i] ?? 'class';

  if (!today || !scheduleForDay) {
    return {
      tone: 'off',
      icon: 'sparkles',
      title: '今天休息',
      subtitle: '陪家人走走，读一本喜欢的书',
    };
  }

  // 只要不是今天,就不能拿当前时钟去算进度,否则会得出"距下课还剩 X 分钟"这类假信息
  if (offsetDays > 0) {
    const first = periods[0];
    const firstSubject = scheduleForDay[0];
    return {
      tone: 'idle',
      icon: 'moon',
      title:
        offsetDays === 1
          ? `明天有课 · ${today}`
          : `${offsetDays}天后有课 · ${today}`,
      subtitle: `第1节 ${firstSubject} · ${startTextOf(first)} 开始`,
    };
  }

  const minutes = now.getHours() * 60 + now.getMinutes();
  const seconds = now.getSeconds();

  for (let i = 0; i < periods.length; i += 1) {
    const { start, end } = parseTimeRange(periods[i].time);
    if (start === null || end === null) continue; // 时间格式异常的节次跳过
    if (minutes >= start && minutes < end) {
      const totalSec = (end - start) * 60;
      const passedSec = (minutes - start) * 60 + seconds;
      const remainSec = totalSec - passedSec;
      const remainMin = Math.max(1, Math.ceil(remainSec / 60));
      const nextIdx = i + 1;
      const subject = scheduleForDay[i];
      const isBreak = kindAt(i) === 'break';
      const isEmpty = !isBreak && !subject?.trim();
      const verb = isEmpty ? '没有课' : isBreak ? '正在休息' : '正在上课';
      const remainLabel =
        isEmpty ? '距节次结束' : isBreak ? '距休息结束' : '距下课还剩';
      let subtitle = `${remainLabel} ${remainMin} 分钟`;
      if (nextIdx < periods.length) {
        const nextSubject = scheduleForDay[nextIdx];
        const nextStart = startTextOf(periods[nextIdx]);
        const nextLabel = nextSubject?.trim() ? nextSubject : '待安排';
        subtitle += ` · 下节 ${nextLabel} · ${nextStart}`;
      } else {
        subtitle += ' · 今日最后一节';
      }
      const title = isEmpty
        ? `没有课 · ${periods[i].label}`
        : `${verb} · ${periods[i].label} ${subject}`;
      return {
        tone: isEmpty ? 'idle' : isBreak ? 'break' : 'active',
        icon: isEmpty ? 'moon' : isBreak ? 'sparkles' : 'clock',
        title,
        subtitle,
        progress: Math.min(1, passedSec / totalSec),
      };
    }
    if (minutes < start) {
      const gap = start - minutes;
      const subject = scheduleForDay[i];
      const startTxt = startTextOf(periods[i]);
      if (i === 0) {
        return {
          tone: 'idle',
          icon: 'backpack',
          title: '还没到上课时间',
          subtitle: `距 第1节 ${subject} · ${formatMinutes(gap)} · ${startTxt}`,
        };
      }
      return {
        tone: 'break',
        icon: 'sparkles',
        title: '课间休息',
        subtitle: `${gap} 分钟后开始 · ${periods[i].label} ${subject}`,
      };
    }
  }

  return {
    tone: 'idle',
    icon: 'moon',
    title: '今日课程已结束',
    subtitle: '收拾书包，回家路上注意安全',
  };
}
