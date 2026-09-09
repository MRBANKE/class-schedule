import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Holiday,
  PeriodConfig,
  SubjectItem,
  Weekday,
} from '../config/types';
import {
  createSubjectLookup,
  subjectGradient,
  computeWeekParity,
  resolveSubjectName,
} from '../data/subjects';
import { pickEmptyChipColor } from '../data/emptyChipColor';
import { SvgIcon } from '../icons';
import SubjectIcon from './SubjectIcon';
import { computeCountdown } from '../utils/countdown';
import { computePeriodStatus } from '../utils/periodStatus';
import { offsetLabel } from '../utils/dayOffset';

interface Props {
  today: Weekday | null;
  currentPeriodIndex: number | null;
  isTomorrow?: boolean;
  offsetDays?: number;
  schedule: Record<Weekday, string[]>;
  periods: PeriodConfig[];
  subjects: SubjectItem[];
  holiday?: Holiday | null;
  maxHeight?: number;
  compact?: boolean;
  timeBased?: boolean;
  termStart?: string;
}

export default function TodayPanel({
  today,
  currentPeriodIndex,
  isTomorrow,
  offsetDays = 0,
  schedule,
  periods,
  subjects,
  holiday,
  maxHeight,
  compact,
  timeBased = true,
  termStart,
}: Props) {
  const getSubject = useMemo(() => createSubjectLookup(subjects), [subjects]);
  const [now, setNow] = useState(() => new Date());
  const listRef = useRef<HTMLOListElement>(null);
  const currentItemRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!today || !timeBased) return;
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, [today, timeBased]);

  useEffect(() => {
    if (!timeBased) return;
    if (currentPeriodIndex === null || isTomorrow) return;
    const list = listRef.current;
    const item = currentItemRef.current;
    if (!list || !item) return;
    const raf = requestAnimationFrame(() => {
      const listRect = list.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      const offsetTop = list.scrollTop + (itemRect.top - listRect.top);
      const outlineGap = 8;
      list.scrollTo({ top: Math.max(0, offsetTop - outlineGap), behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [currentPeriodIndex, isTomorrow, today, maxHeight, compact, timeBased]);

  if (!today) {
    const emptyText = holiday
      ? `今日 ${holiday.name}，放假休息、玩得开心`
      : '今天是周末，好好休息、多陪陪家人';
    return (
      <section
        className="today-card"
        style={maxHeight ? { height: maxHeight } : undefined}
      >
        <h2 className="section-title">
          <span className="section-title-icon">
            <SvgIcon name="sparkles" size={20} />
          </span>
          今日安排
        </h2>
        <p className="today-empty">{emptyText}</p>
      </section>
    );
  }

  const todayList = schedule[today];
  const parity = computeWeekParity(now, termStart);
  const resolvedList = todayList.map(name =>
    resolveSubjectName(name, subjects, parity),
  );
  const kindsForDay = resolvedList.map(n => getSubject(n).kind ?? 'class');
  const titleLabel =
    offsetDays >= 2
      ? `${offsetDays}天后课表`
      : isTomorrow
        ? '明日课表'
        : '今日课表';
  const hero = timeBased
    ? computeCountdown({
        now,
        periods,
        today,
        offsetDays,
        scheduleForDay: resolvedList,
        kindsForDay,
      })
    : null;

  return (
    <section
      className="today-card"
      style={maxHeight ? { height: maxHeight } : undefined}
    >
      <h2 className="section-title">
        <span className="section-title-icon">
          <SvgIcon name="backpack" size={20} />
        </span>
        {titleLabel} · {today}
        {offsetDays > 0 && (
          <span className="today-preview-badge">{offsetLabel(offsetDays)}</span>
        )}
      </h2>

      {hero && (
        <div className={`today-hero countdown-${hero.tone}`}>
          <div className="today-hero-icon">
            <SvgIcon name={hero.icon} size={22} />
          </div>
          <div className="today-hero-content">
            <div className="today-hero-title">{hero.title}</div>
            <div className="today-hero-subtitle">{hero.subtitle}</div>
          </div>
          {hero.progress !== undefined && (
            <div className="today-hero-progress" aria-hidden>
              <div
                className="today-hero-progress-fill"
                style={{ width: `${hero.progress * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      <ol
        className={`today-list${compact ? ' today-list-compact' : ''}`}
        ref={listRef}
      >
        {todayList.map((rawName, idx) => {
          const name = resolveSubjectName(rawName, subjects, parity);
          const subject = getSubject(name);
          const period = periods[idx];
          if (!period) return null;
          const kind = subject.kind ?? 'class';
          const isEmpty = !name.trim() && kind !== 'break';
          const isCurrent = timeBased && currentPeriodIndex === idx;
          const status = timeBased
            ? computePeriodStatus(period, now, offsetDays, isEmpty, kind)
            : null;
          const chipColor = isEmpty
            ? pickEmptyChipColor(today, idx)
            : subject.color;
          return (
            <li
              className={`today-item${status ? ` today-item-${status.tone}` : ''}${
                isCurrent ? ' today-item-active' : ''
              }${isEmpty ? ' today-item-empty' : ''}`}
              key={period.index}
              ref={isCurrent ? currentItemRef : undefined}
              style={{
                background: subjectGradient(chipColor),
                ...(isCurrent && {
                  boxShadow: `0 0 0 1.5px color-mix(in srgb, ${chipColor} 82%, #1a1f2b 18%)`,
                }),
              }}
            >
              <div className="today-item-time">
                <div className="today-item-label">{period.label}</div>
                {status && (
                  <div className={`today-item-status today-item-status-${status.tone}`}>
                    {status.label}
                  </div>
                )}
              </div>
              <div className="today-item-subject-block">
                <div className="today-item-subject">
                  {!isEmpty && (
                    <>
                      {!subject.hideIcon && (
                        <span className="today-item-icon">
                          <SubjectIcon subject={subject} size={20} />
                        </span>
                      )}
                      <span>{subject.name}</span>
                    </>
                  )}
                  {isCurrent && (
                    <span className="today-item-badge">
                      {isEmpty
                        ? '没有课'
                        : kind === 'break'
                          ? '正在休息'
                          : '正在上课'}
                    </span>
                  )}
                </div>
                {!isEmpty && subject.reminder && (
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
