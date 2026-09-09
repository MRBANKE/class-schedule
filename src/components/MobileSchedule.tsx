import { useEffect, useMemo, useState } from 'react';
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
import { SvgIcon } from '../icons';
import SubjectIcon from './SubjectIcon';
import { offsetLabel } from '../utils/dayOffset';

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

export default function MobileSchedule({
  today,
  offsetDays = 0,
  schedule,
  periods,
  subjects,
  holiday,
  termStart,
  visibleWeekdays = WEEKDAYS,
}: Props) {
  const badgeText = offsetLabel(offsetDays);
  const getSubject = useMemo(() => createSubjectLookup(subjects), [subjects]);
  const parity = useMemo(
    () => computeWeekParity(new Date(), termStart),
    [termStart],
  );
  const [selected, setSelected] = useState<Weekday>(() => today ?? '周一');

  useEffect(() => {
    if (today) setSelected(today);
  }, [today]);

  const list = schedule[selected] ?? [];

  return (
    <section className="schedule-card mobile-schedule">
      <header className="schedule-header">
        <h2 className="section-title">
          <span className="section-title-icon">
            <SvgIcon name="calendar" size={20} />
          </span>
          课程表
        </h2>
      </header>

      {holiday && (
        <div className="schedule-holiday-tip">
          今日 {holiday.name}，放假休息
        </div>
      )}

      <div
        className="day-picker"
        style={{ ['--visible-days' as string]: String(visibleWeekdays.length) }}
      >
        {visibleWeekdays.map(day => {
          const isSelected = day === selected;
          const isTodayChip = day === today;
          // offsetDays>0 都算"预告"态(明天或更晚的课日),不能只看 isTomorrow
          const isPreview = isTodayChip && offsetDays > 0;
          const cls = [
            'day-chip',
            isSelected ? 'day-chip-selected' : '',
            isTodayChip ? 'day-chip-today' : '',
            isPreview ? 'day-chip-preview' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={day}
              type="button"
              className={cls}
              onClick={() => setSelected(day)}
            >
              {day}
              {isTodayChip && (
                <span
                  className={`day-chip-badge${isPreview ? ' day-chip-badge-preview' : ''}`}
                >
                  {badgeText}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <ol className="today-list mobile-day-list">
        {list.map((rawName, idx) => {
          const name = resolveSubjectName(rawName, subjects, parity);
          const subject = getSubject(name);
          const period = periods[idx];
          if (!period) return null;
          return (
            <li
              key={period.index}
              className="today-item"
              style={{ background: subjectGradient(subject.color) }}
            >
              <div className="today-item-time">
                <div className="today-item-label">{period.label}</div>
              </div>
              <div className="today-item-subject-block">
                <div className="today-item-subject">
                  {!subject.hideIcon && (
                    <span className="today-item-icon">
                      <SubjectIcon subject={subject} size={20} />
                    </span>
                  )}
                  <span>{subject.name}</span>
                </div>
                {subject.reminder && (
                  <div className="today-item-reminder">
                    <span>{subject.reminder}</span>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
