import { useMemo } from 'react';
import type {
  Student,
  PeriodConfig,
  Weekday,
} from '../../config/types';
import { WEEKDAYS_FULL } from '../../config/types';
import { getVisibleWeekdays } from '../../data/schedule';
import { createSubjectLookup } from '../../data/subjects';
import { SvgIcon } from '../../icons';
import TimePicker from '../../components/TimePicker';
import DatePicker from '../../components/DatePicker';
import { pickEmptyChipColor } from '../../data/emptyChipColor';
import SubjectIcon from '../../components/SubjectIcon';

interface Props {
  student: Student;
  onChange: (patch: Partial<Student>) => void;
}



const nextIndex = (list: PeriodConfig[]): number => {
  const max = list.reduce((acc, p) => Math.max(acc, p.index), 0);
  return max + 1;
};

const syncSchedule = (
  schedule: Record<Weekday, string[]>,
  nextLen: number,
  fillWith: string,
): Record<Weekday, string[]> => {
  const result = {} as Record<Weekday, string[]>;
  for (const day of WEEKDAYS_FULL) {
    const cur = schedule[day] ?? [];
    if (cur.length === nextLen) {
      result[day] = cur;
      continue;
    }
    if (cur.length > nextLen) {
      result[day] = cur.slice(0, nextLen);
    } else {
      result[day] = [...cur, ...Array(nextLen - cur.length).fill(fillWith)];
    }
  }
  return result;
};

const parseStartMinutes = (time: string): number => {
  const start = time.split('-')[0]?.trim() ?? '';
  const [h, m] = start.split(':').map(v => Number.parseInt(v, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return Number.POSITIVE_INFINITY;
  return h * 60 + m;
};

const sortByStart = (
  periods: PeriodConfig[],
  schedule: Record<Weekday, string[]>,
): { periods: PeriodConfig[]; schedule: Record<Weekday, string[]> } => {
  const decorated = periods.map((p, i) => ({ p, i }));
  decorated.sort((a, b) => {
    const diff = parseStartMinutes(a.p.time) - parseStartMinutes(b.p.time);
    return diff !== 0 ? diff : a.i - b.i;
  });
  const nextPeriods = decorated.map(x => x.p);
  const nextSchedule = {} as Record<Weekday, string[]>;
  for (const day of WEEKDAYS_FULL) {
    nextSchedule[day] = decorated.map(x => schedule[day]?.[x.i] ?? '');
  }
  return { periods: nextPeriods, schedule: nextSchedule };
};

export default function CurriculumSection({ student, onChange }: Props) {
  const getSubject = useMemo(
    () => createSubjectLookup(student.subjects),
    [student.subjects],
  );

  const commitPeriods = (nextPeriods: PeriodConfig[]) => {
    const synced = syncSchedule(student.schedule, nextPeriods.length, '');
    const sorted = sortByStart(nextPeriods, synced);
    onChange({ periods: sorted.periods, schedule: sorted.schedule });
  };

  const updatePeriodAt = (idx: number, patch: Partial<PeriodConfig>) => {
    const next = student.periods.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    commitPeriods(next);
  };

  const removePeriodAt = (idx: number) => {
    if (student.periods.length <= 1) return;
    const nextPeriods = student.periods.filter((_, i) => i !== idx);
    const nextSchedule = {} as Record<Weekday, string[]>;
    for (const day of WEEKDAYS_FULL) {
      nextSchedule[day] = (student.schedule[day] ?? []).filter(
        (_, i) => i !== idx,
      );
    }
    const sorted = sortByStart(nextPeriods, nextSchedule);
    onChange({ periods: sorted.periods, schedule: sorted.schedule });
  };

  const addPeriod = () => {
    const last = student.periods[student.periods.length - 1];
    const lastEnd = last ? parseTimeRange(last.time).end : '08:00';
    const start = lastEnd || '08:00';
    const end = shiftMinutes(start, 40);
    const next: PeriodConfig = {
      index: nextIndex(student.periods),
      label: `第${student.periods.length + 1}节`,
      time: `${start} - ${end}`,
    };
    commitPeriods([...student.periods, next]);
  };

  const parseTimeRange = (t: string): { start: string; end: string } => {
    const [s, e] = t.split('-').map(x => x.trim());
    return { start: s ?? '', end: e ?? '' };
  };

  const shiftMinutes = (hhmm: string, minutes: number): string => {
    const [h, m] = hhmm.split(':').map(v => Number.parseInt(v, 10));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
    let total = h * 60 + m + minutes;
    total = Math.max(0, Math.min(24 * 60 - 1, total));
    const nh = Math.floor(total / 60);
    const nm = total % 60;
    return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
  };

  const updateCell = (day: Weekday, idx: number, value: string) => {
    const nextDay = [...student.schedule[day]];
    nextDay[idx] = value;
    onChange({ schedule: { ...student.schedule, [day]: nextDay } });
  };

  const updateTime = (idx: number, patch: { start?: string; end?: string }) => {
    const current = parseTimeRange(student.periods[idx].time);
    const next = { ...current, ...patch };
    updatePeriodAt(idx, { time: `${next.start} - ${next.end}` });
  };

  const showSaturday = student.showSaturday === true;
  const showSunday = student.showSunday === true;
  // 与前台课表共用同一份口径,避免后台能编辑但前台不显示
  const visibleWeekdays = getVisibleWeekdays({ showSaturday, showSunday });

  return (
    <div className="admin-section">
      <h3 className="admin-subsection-title">一周课表</h3>
      <p className="admin-subsection-hint">
        左列改节次名与时间,每格从课程库中选择
      </p>

      <div className="admin-weekend-toggles">
        <label className="admin-switch admin-switch-inline">
          <input
            type="checkbox"
            checked={showSaturday}
            onChange={e => onChange({ showSaturday: e.target.checked })}
          />
          <span className="admin-switch-slider" />
          <span className="admin-switch-label">启用周六</span>
        </label>
        <label className="admin-switch admin-switch-inline">
          <input
            type="checkbox"
            checked={showSunday}
            onChange={e => onChange({ showSunday: e.target.checked })}
          />
          <span className="admin-switch-slider" />
          <span className="admin-switch-label">启用周日</span>
        </label>
      </div>

      <div
        className="admin-schedule-grid"
        style={{
          ['--visible-days' as string]: String(visibleWeekdays.length),
        }}
      >
        <div className="admin-schedule-head">
          <div className="admin-schedule-cell admin-schedule-corner">节次</div>
          {visibleWeekdays.map(day => {
            const isWeekend = day === '周六' || day === '周日';
            return (
              <div
                key={day}
                className={`admin-schedule-cell admin-schedule-day${isWeekend ? ' admin-schedule-day-weekend' : ''}`}
              >
                {day}
              </div>
            );
          })}
        </div>

        {student.periods.map((period, idx) => {
          const { start, end } = parseTimeRange(period.time);
          return (
          <div className="admin-schedule-row" key={period.index}>
            <div className="admin-schedule-cell admin-schedule-period admin-schedule-period-edit">
              <div className="admin-schedule-period-head">
                <input
                  className="admin-schedule-period-input"
                  value={period.label}
                  maxLength={12}
                  aria-label="节次名称"
                  onChange={e => updatePeriodAt(idx, { label: e.target.value })}
                />
                <button
                  type="button"
                  className="admin-schedule-period-remove"
                  onClick={() => removePeriodAt(idx)}
                  disabled={student.periods.length <= 1}
                  aria-label="删除节次"
                  title="删除节次"
                >
                  <SvgIcon name="trash" size={13} />
                </button>
              </div>
              {student.timeBased && (
                <div className="admin-schedule-period-times">
                  <TimePicker
                    size="sm"
                    tone="grass"
                    allowClear={false}
                    placeholder="开始"
                    value={start}
                    onChange={v => updateTime(idx, { start: v })}
                  />
                  <TimePicker
                    size="sm"
                    tone="grape"
                    allowClear={false}
                    placeholder="结束"
                    value={end}
                    onChange={v => updateTime(idx, { end: v })}
                  />
                </div>
              )}
            </div>
            {visibleWeekdays.map(day => {
              const value = student.schedule[day][idx] ?? '';
              const subject = getSubject(value);
              const isEmpty = !value;
              const isBiweekly = subject.weekMode === 'biweekly';
              return (
                <div className="admin-schedule-cell" key={day}>
                  <div
                    className={`admin-schedule-chip${isEmpty ? ' admin-schedule-chip-empty' : ''}`}
                    style={{
                      background: isEmpty
                        ? pickEmptyChipColor(day, idx)
                        : subject.color,
                    }}
                  >
                    {!isEmpty && !subject.hideIcon && (
                      <span className="admin-schedule-chip-icon">
                        <SubjectIcon subject={subject} size={16} />
                      </span>
                    )}
                    <select
                      className="admin-schedule-select"
                      value={value}
                      onChange={e => updateCell(day, idx, e.target.value)}
                    >
                      <option value="">请选择课程</option>
                      {!student.subjects.find(s => s.name === value) && value && (
                        <option value={value}>{value}(未在库中)</option>
                      )}
                      {student.subjects.map(s => (
                        <option key={s.name} value={s.name}>
                          {s.weekMode === 'biweekly'
                            ? `${s.name} · 单/双`
                            : s.name}
                        </option>
                      ))}
                    </select>
                    {isBiweekly && (
                      <span
                        className="admin-schedule-chip-tag"
                        title="该课程会按学期起始日计算的单双周自动切换"
                      >
                        单/双
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          );
        })}
      </div>

      <button
        type="button"
        className="admin-btn admin-btn-grass admin-btn-add admin-schedule-add-period"
        onClick={addPeriod}
      >
        <SvgIcon name="plus" size={14} /> 新增节次
      </button>

      <div className="admin-divider" />

      <h3 className="admin-subsection-title">单双周起始日期</h3>
      <p className="admin-subsection-hint">
        所选那周算第 1 周(单周),之后逐周交替
      </p>
      <div className="admin-field">
        <DatePicker
          tone="grass"
          allowClear={false}
          value={student.termStart ?? ''}
          onChange={v => onChange({ termStart: v || undefined })}
        />
      </div>
    </div>
  );
}
