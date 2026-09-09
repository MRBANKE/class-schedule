import type { Holiday, PeriodConfig, Student, Weekday } from '../config/types';
import { WEEKDAYS, WEEKDAYS_FULL } from '../config/types';
import { parseTimeRange } from '../utils/timeRange';

export type { PeriodConfig as Period, Weekday };
export { WEEKDAYS };

/** 周末显示开关;未开启的那天视为休息日 */
export interface WeekendOptions {
  showSaturday?: boolean;
  showSunday?: boolean;
}

/** 该学生实际参与展示的星期列表,课表页与后台编辑页共用同一份口径 */
export const getVisibleWeekdays = (
  opts: WeekendOptions = {},
): readonly Weekday[] => [
  ...WEEKDAYS,
  ...(opts.showSaturday === true ? (['周六'] as Weekday[]) : []),
  ...(opts.showSunday === true ? (['周日'] as Weekday[]) : []),
];

export const weekendOptionsOf = (student: Pick<Student, 'showSaturday' | 'showSunday'>): WeekendOptions => ({
  showSaturday: student.showSaturday === true,
  showSunday: student.showSunday === true,
});

const readOverride = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(key);
};

const weekdayFromDate = (d: Date, opts: WeekendOptions = {}): Weekday | null => {
  const day = d.getDay();
  if (day === 6) return opts.showSaturday === true ? '周六' : null;
  if (day === 0) return opts.showSunday === true ? '周日' : null;
  return WEEKDAYS[day - 1];
};

const getLastPeriodEndMinutes = (periods: PeriodConfig[]): number => {
  const last = periods[periods.length - 1];
  return parseTimeRange(last?.time).end ?? 18 * 60;
};

const toIsoDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const findHoliday = (date: Date, holidays: Holiday[]): Holiday | null => {
  const key = toIsoDate(date);
  return holidays.find(h => h.date === key) ?? null;
};

export interface DisplayDay {
  weekday: Weekday | null;
  isTomorrow: boolean;
  /** 距离实际今日的天数偏移;0=今日,1=明日,>=2=下一课日在明日之后 */
  offsetDays: number;
  holiday: Holiday | null;
}

export function getDisplayDay(
  periods: PeriodConfig[],
  holidays: Holiday[] = [],
  now: Date = new Date(),
  timeBased: boolean = true,
  weekend: WeekendOptions = {},
): DisplayDay {
  const todayOverride = readOverride('today');
  if (todayOverride && (WEEKDAYS_FULL as readonly string[]).includes(todayOverride)) {
    const preview = readOverride('preview') === '1';
    return {
      weekday: todayOverride as Weekday,
      isTomorrow: preview,
      offsetDays: preview ? 1 : 0,
      holiday: null,
    };
  }
  if (todayOverride === 'off') {
    return { weekday: null, isTomorrow: false, offsetDays: 0, holiday: null };
  }

  const todayHoliday = findHoliday(now, holidays);
  if (todayHoliday?.isRestDay) {
    return {
      weekday: null,
      isTomorrow: false,
      offsetDays: 0,
      holiday: todayHoliday,
    };
  }

  const todayWeekday = weekdayFromDate(now, weekend);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const isAfterLast =
    timeBased &&
    todayWeekday !== null &&
    nowMinutes >= getLastPeriodEndMinutes(periods);

  if (!todayWeekday || isAfterLast) {
    const cursor = new Date(now);
    for (let i = 1; i <= 7; i += 1) {
      cursor.setDate(cursor.getDate() + 1);
      const nWeek = weekdayFromDate(cursor, weekend);
      const nHoliday = findHoliday(cursor, holidays);
      if (nWeek && !nHoliday?.isRestDay) {
        return {
          weekday: nWeek,
          isTomorrow: i === 1,
          offsetDays: i,
          holiday: null,
        };
      }
    }
    return { weekday: null, isTomorrow: false, offsetDays: 0, holiday: null };
  }

  return {
    weekday: todayWeekday,
    isTomorrow: false,
    offsetDays: 0,
    holiday: null,
  };
}
