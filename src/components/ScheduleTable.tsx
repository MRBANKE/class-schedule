import { useMemo } from 'react';
import type {
  Holiday,
  PeriodConfig,
  SubjectItem,
  Weekday,
} from '../config/types';
import { WEEKDAYS } from '../config/types';
import {
  createSubjectLookup,
  subjectGradient,
  computeWeekParity,
  resolveSubjectName,
} from '../data/subjects';
import { pickEmptyChipColor } from '../data/emptyChipColor';
import { offsetLabel } from '../utils/dayOffset';
import { SvgIcon } from '../icons';
import SubjectIcon from './SubjectIcon';

interface Props {
  today: Weekday | null;
  /** 高亮那一天距今天的偏移:0=今天,1=明天,>=2=更晚的下一课日 */
  offsetDays?: number;
  schedule: Record<Weekday, string[]>;
  periods: PeriodConfig[];
  subjects: SubjectItem[];
  holiday?: Holiday | null;
  termStart?: string;
  /** 实际展示的星期(含按开关启用的周六/周日),默认周一至周五 */
  visibleWeekdays?: readonly Weekday[];
}

export default function ScheduleTable({
  today,
  offsetDays = 0,
  schedule,
  periods,
  subjects,
  holiday,
  termStart,
  visibleWeekdays = WEEKDAYS,
}: Props) {
  const isTomorrow = offsetDays === 1;
  // offsetDays>=2:今天不上课(周末/假期),高亮的是更晚的那个课日
  const isLaterDay = offsetDays >= 2;
  const badgeText = offsetLabel(offsetDays);
  const getSubject = useMemo(() => createSubjectLookup(subjects), [subjects]);
  const parity = useMemo(() => computeWeekParity(new Date(), termStart), [termStart]);
  // 类型迁移到课程库后:节次视为 after-school / break 的条件是——任一工作日在该节次配置了对应 kind 的课程;
  // after-school 优先级高于 break(同节次既有课后又有休息时,以课后服务作为视觉主导)
  const rowKinds = periods.map((_, rowIndex) => {
    let hasBreak = false;
    for (const day of visibleWeekdays) {
      const name = schedule[day]?.[rowIndex];
      if (!name) continue;
      const resolved = resolveSubjectName(name, subjects, parity);
      const k = getSubject(resolved).kind ?? 'class';
      if (k === 'after-school') return 'after-school';
      if (k === 'break') hasBreak = true;
    }
    return hasBreak ? 'break' : 'class';
  });
  const afterSchoolStartIndex = rowKinds.findIndex(k => k === 'after-school');

  const tip = holiday
    ? `今日 ${holiday.name}，放假休息`
    : today
      ? isLaterDay
        ? `今天休息，${offsetDays}天后是 ${today}`
        : isTomorrow
          ? `明天是 ${today}，已提前高亮`
          : `今天是 ${today}，已高亮显示`
      : '今天休息，好好玩耍';

  return (
    <section className="schedule-card">
      <header className="schedule-header">
        <h2 className="section-title">
          <span className="section-title-icon">
            <SvgIcon name="calendar" size={20} />
          </span>
          课程表
        </h2>
        <div className="schedule-actions">
          <span className="schedule-tip">{tip}</span>
        </div>
      </header>
      <div
        className="schedule-grid"
        style={{ ['--visible-days' as string]: String(visibleWeekdays.length) }}
      >
        <div className="schedule-head-row">
          <div className="grid-cell period-head">节次</div>
          {visibleWeekdays.map(day => {
            const isToday = day === today;
            const classes = [
              'grid-cell',
              'weekday-head',
              isToday ? 'weekday-head-today' : '',
              isToday && offsetDays > 0 ? 'weekday-head-preview' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div key={day} className={classes}>
                <span className="weekday-head-name">{day}</span>
                {isToday && (
                  <span className="weekday-head-badge">{badgeText}</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="schedule-body">
          {periods.map((period, rowIndex) => {
            const isAfterSchool = rowKinds[rowIndex] === 'after-school';
            const isBreakRow = rowKinds[rowIndex] === 'break';
            const isAfterSchoolStart = rowIndex === afterSchoolStartIndex;
            const rowClasses = [
              'schedule-row',
              isAfterSchool ? 'row-after-school' : '',
              isBreakRow ? 'row-break' : '',
              isAfterSchoolStart ? 'row-after-school-start' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div key={period.index} className={rowClasses}>
                <div className="grid-cell period-cell">
                  <span className="period-label">{period.label}</span>
                </div>
                {visibleWeekdays.map(day => {
                  const rawName = schedule[day]?.[rowIndex] ?? '';
                  const isEmpty = !rawName.trim();
                  const subjectName = resolveSubjectName(rawName, subjects, parity);
                  const subject = getSubject(subjectName);
                  return (
                    <div key={day} className="grid-cell subject-cell">
                      <div
                        className={`subject-chip${isEmpty ? ' subject-chip-empty' : ''}`}
                        style={{
                          background: isEmpty
                            ? subjectGradient(pickEmptyChipColor(day, rowIndex))
                            : subjectGradient(subject.color),
                        }}
                      >
                        {!isEmpty && (
                          <>
                            {!subject.hideIcon && (
                              <span className="subject-icon">
                                <SubjectIcon subject={subject} size={18} />
                              </span>
                            )}
                            <span className="subject-name">{subject.name}</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
