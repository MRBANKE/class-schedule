import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SvgIcon } from './icons';
import SubjectIcon from './components/SubjectIcon';
import { useConfig } from './hooks/useConfig';
import { useWeather } from './hooks/useWeather';
import {
  createSubjectLookup,
  computeWeekParity,
  resolveSubjectName,
  subjectGradient,
} from './data/subjects';
import { getDisplayDay, weekendOptionsOf } from './data/schedule';
import { offsetLabel } from './utils/dayOffset';
import { getCurrentPeriodIndex } from './utils/timeSlot';
import { MEMO_UPDATED_EVENT, getMemosRaw } from './api/client';
import './BoardApp.css';

interface AttachmentCounts {
  image: number;
  video: number;
  audio: number;
  file: number;
}

interface MemoItemLite {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  remindAt?: string;
  images?: string[];
  attachmentCounts?: AttachmentCounts;
}

/**
 * 看板只用到备忘的文字与提醒时间,不需要 attachments 里的 base64/blobKey。
 * 剥掉重字段后再进 state,避免长期常亮的展示屏反复持有数 MB 字符串。
 */
const readMemos = (): MemoItemLite[] => {
  try {
    const list = getMemosRaw();
    if (!Array.isArray(list)) return [];
    return list
      .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
      .map(m => {
        // 只聚合 kind 计数,不保留 blob/dataUrl,展示屏不需要真正读取附件内容
        const counts: AttachmentCounts = {
          image: 0,
          video: 0,
          audio: 0,
          file: 0,
        };
        const atts = Array.isArray(m.attachments) ? m.attachments : [];
        for (const raw of atts) {
          if (!raw || typeof raw !== 'object') continue;
          const kind = (raw as { kind?: unknown }).kind;
          if (kind === 'image') counts.image += 1;
          else if (kind === 'video') counts.video += 1;
          else if (kind === 'audio') counts.audio += 1;
          else if (kind === 'doc' || kind === 'file') counts.file += 1;
        }
        // 早期版本直接存在 m.images 里的图片(dataURL),也计入图片胶囊
        if (Array.isArray(m.images)) {
          for (const v of m.images) {
            if (typeof v === 'string') counts.image += 1;
          }
        }
        const hasAny =
          counts.image + counts.video + counts.audio + counts.file > 0;
        return {
          id: typeof m.id === 'string' ? m.id : '',
          // text 若被写成非字符串,直接渲染会抛"Objects are not valid as a React child"整屏白屏
          text: typeof m.text === 'string' ? m.text : '',
          done: m.done === true,
          createdAt: typeof m.createdAt === 'number' ? m.createdAt : 0,
          remindAt: typeof m.remindAt === 'string' ? m.remindAt : undefined,
          images: Array.isArray(m.images)
            ? m.images.filter((v): v is string => typeof v === 'string')
            : undefined,
          attachmentCounts: hasAny ? counts : undefined,
        };
      });
  } catch {
    return [];
  }
};

/** 只比较看板实际渲染用到的字段,内容没变就不触发重渲染 */
const memoSignature = (list: MemoItemLite[]): string =>
  list
    .map(m => {
      const c = m.attachmentCounts;
      const attSig = c ? `${c.image}.${c.video}.${c.audio}.${c.file}` : '0';
      return `${m.id}|${m.done ? 1 : 0}|${m.text}|${m.remindAt ?? ''}|${attSig}`;
    })
    .join('~');

const formatDate = (d: Date): string =>
  d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

const formatTime = (d: Date): string =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const parseRemindAt = (raw?: string): Date | null => {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatRemindLabel = (raw?: string): string => {
  const d = parseRemindAt(raw);
  if (!d) return '';
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = formatTime(d);
  if (sameDay) return `今天 ${time}`;
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  return sameYear ? `${md} ${time}` : `${d.getFullYear()}/${md} ${time}`;
};

export default function BoardApp() {
  const { config, activeStudent: maybeStudent } = useConfig();
  // main.tsx 已保证进这里时有真实学生;! 仅用于收窄类型
  const activeStudent = maybeStudent!;
  const {
    title,
    logoImage,
    logoIcon,
    periods,
    schedule,
    subjects,
    termStart,
  } = activeStudent;
  const { holidays } = config;
  const showWeather = activeStudent.boardShowWeather !== false;
  const showMemo = activeStudent.boardShowMemo !== false;
  const showReminder = activeStudent.boardShowReminder !== false;
  const hasSide = showWeather || showMemo;
  const boardStyle = activeStudent.boardStyle ?? 'default';

  const [now, setNow] = useState(() => new Date());
  const [memos, setMemos] = useState<MemoItemLite[]>(readMemos);

  const { weather, loading: weatherLoading } = useWeather(
    activeStudent.weatherStation,
    activeStudent.weatherCity,
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // 兜底 iOS <16.4 不支持 :has() 的场景:挂在 body 上一个类,让 CSS 精准锁死高度和滚动
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.add('board-mode');
    return () => {
      document.body.classList.remove('board-mode');
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // 内容签名不变就不 setState:readMemos 每次都返回新数组引用,
    // 否则本机保存或轮询发现别的设备改动都会让常亮的看板无条件重渲染
    let signature = memoSignature(readMemos());
    const refresh = () => {
      const next = readMemos();
      const nextSignature = memoSignature(next);
      if (nextSignature === signature) return;
      signature = nextSignature;
      setMemos(next);
    };
    window.addEventListener(MEMO_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(MEMO_UPDATED_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const pageTitle = `${title} · 看板`;
    document.title = pageTitle;
    // iOS"添加到主屏幕"的名称取自 apple-mobile-web-app-title,和标题保持一致。
    // 首次加载时服务端已按 ?id= 写好,这里只负责配置改名后跟上
    const meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (meta) meta.setAttribute('content', pageTitle);
    const pwaIcon = logoImage || '/avatars/avatar-01.jpg';
    const setLink = (rel: string, href: string) => {
      let el = document.querySelector(
        `link[rel="${rel}"]`,
      ) as HTMLLinkElement | null;
      if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', rel);
        document.head.appendChild(el);
      }
      el.setAttribute('href', href);
    };
    setLink('icon', pwaIcon);
    setLink('apple-touch-icon', pwaIcon);
  }, [title, logoImage]);

  // 与主页保持一致:尊重 timeBased 与周末开关,避免两个视图对同一份数据给出不同结论
  const timeBased = activeStudent.timeBased !== false;
  const display = getDisplayDay(
    periods,
    holidays,
    now,
    timeBased,
    weekendOptionsOf(activeStudent),
  );
  const today = display.weekday;
  const holiday = display.holiday;
  const parity = useMemo(
    () => computeWeekParity(now, termStart),
    [now, termStart],
  );
  const getSubject = useMemo(() => createSubjectLookup(subjects), [subjects]);
  // 展示未来某天时不能按当前时钟高亮"正在上课"
  const currentPeriodIndex =
    display.offsetDays !== 0 || !timeBased ? null : getCurrentPeriodIndex(periods);

  const todayList = today ? (schedule[today] ?? null) : null;
  // 根据 board-panel-memo 可用高度动态决定显示条数,避免溢出被裁或空高度浪费。
  // null = 首帧尚未测量,渲染层此时先按上限 12 显示,拿到 ResizeObserver 首个回调后
  // 收敛,避免"先显示 6 条 → 面板量出更大空间 → 突增到 8 条"的可见闪动
  const memoPanelRef = useRef<HTMLDivElement>(null);
  const [memoCap, setMemoCap] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = memoPanelRef.current;
    if (!el) return;
    const compute = () => {
      const h = el.clientHeight;
      if (!h) return;
      // 减去标题 + 上下 padding(≈ 84px),按每条 60px 折算
      const listH = Math.max(0, h - 84);
      const perItem = 60;
      const next = Math.max(1, Math.min(12, Math.floor(listH / perItem)));
      setMemoCap(prev => (prev === next ? prev : next));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
    // 依赖 showMemo:管理端把开关从 false 切到 true 时 panel 才挂载,
    // 空依赖数组会让 effect 只在首次挂载时跑,后续开关变化不会重新观察
  }, [showMemo]);
  const memoCapEffective = memoCap ?? 12;
  const activeMemos = memos
    .filter(m => !m.done)
    .sort((a, b) => {
      const ar = a.remindAt ? new Date(a.remindAt).getTime() : Infinity;
      const br = b.remindAt ? new Date(b.remindAt).getTime() : Infinity;
      if (ar !== br) return ar - br;
      return b.createdAt - a.createdAt;
    })
    .slice(0, memoCapEffective);
  const activeMemosTotal = memos.filter(m => !m.done).length;
  const memoOverflow = activeMemosTotal - activeMemos.length;

  const parityLabel = parity === 'odd' ? '单周' : '双周';
  const clock = formatTime(now);
  const dateStr = formatDate(now);

  // 监听天气 stats 容器宽度,决定显示几个胶囊(优先级:湿度 > 体感 > 风力)
  const statsRef = useRef<HTMLDivElement>(null);
  // null = 尚未测量,与"测得宽度 0"区分开,避免首帧先按全显示渲染再收起造成闪动
  const [statsWidth, setStatsWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    setStatsWidth(el.clientWidth);
    const ro = new ResizeObserver(entries => {
      setStatsWidth(entries[0]?.contentRect.width ?? 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
    // 用 !!weather 而非 weather:天气每次轮询都是新对象,
    // 否则 ResizeObserver 会被周期性 disconnect / 重建
  }, [showWeather, !!weather]);
  const showWindStat = statsWidth !== null && statsWidth >= 220;
  const showFeelsStat = statsWidth === null || statsWidth >= 130;

  return (
    <div className={`board-app board-app-${boardStyle}`}>
      <header className="board-header">
        <div className="board-title">
          <span className="board-logo">
            {logoImage ? (
              <img src={logoImage} alt="" />
            ) : (
              <SvgIcon name={logoIcon} size={40} />
            )}
          </span>
          <div className="board-title-text">
            <h1>{title}</h1>
            <p>
              <SvgIcon name="calendar" size={16} />
              <span>{dateStr}</span>
              <span className="board-title-tag">{parityLabel}</span>
            </p>
          </div>
        </div>
        <div className="board-clock">
          <SvgIcon name="clock" size={26} />
          <span className="board-clock-label">更新时间</span>
          <span className="board-clock-time">{clock}</span>
        </div>
      </header>

      <main className={`board-main${hasSide ? '' : ' board-main-no-side'}`}>
        <section className="board-panel board-panel-schedule">
          <h2 className="board-panel-title">
            <SvgIcon name="backpack" size={22} />
            {holiday && display.offsetDays === 0
              ? `${holiday.name} · 放假`
              : today
                ? `${offsetLabel(display.offsetDays)} · ${today} 课程`
                : '今天休息'}
          </h2>
          {todayList && today ? (
            (() => {
              const rows = todayList
                .map((rawName, idx) => {
                  const period = periods[idx];
                  if (!period) return null;
                  const name = resolveSubjectName(rawName, subjects, parity);
                  const subject = getSubject(name);
                  // 类型已迁移到课程库:该格课程 kind === 'break' 才过滤
                  if (subject.kind === 'break') return null;
                  // currentPeriodIndex 在非今天时已为 null,这里再判一次 offsetDays
                  // 是为了防止未来改动漏掉(二元 isTomorrow 会漏掉 offsetDays>=2)
                  const isCurrent =
                    currentPeriodIndex === idx && display.offsetDays === 0;
                  return { period, subject, isCurrent };
                })
                .filter(
                  (v): v is {
                    period: (typeof periods)[number];
                    subject: ReturnType<typeof getSubject>;
                    isCurrent: boolean;
                  } => v !== null,
                );
              const parseHour = (t: string): number => {
                const start = t.split('-')[0]?.trim() ?? '';
                const [h] = start.split(':').map(v => Number.parseInt(v, 10));
                return Number.isFinite(h) ? h : 24;
              };
              const morning = rows.filter(r => parseHour(r.period.time) < 12);
              const afternoon = rows.filter(r => parseHour(r.period.time) >= 12);

              const renderItem = (
                r: (typeof rows)[number],
                key: string | number,
              ) => (
                <li
                  key={key}
                  className={`board-schedule-item${r.isCurrent ? ' board-schedule-item-active' : ''}`}
                  style={{ background: subjectGradient(r.subject.color) }}
                >
                  <div className="board-schedule-period">
                    <div className="board-schedule-label">{r.period.label}</div>
                  </div>
                  <div className="board-schedule-subject">
                    {!r.subject.hideIcon && (
                      <span className="board-schedule-icon">
                        <SubjectIcon subject={r.subject} size={28} />
                      </span>
                    )}
                    <div className="board-schedule-content">
                      <span className="board-schedule-name">
                        {r.subject.name || '待安排'}
                      </span>
                      {showReminder && r.subject.reminder && (
                        <span className="board-schedule-reminder">
                          <span>{r.subject.reminder}</span>
                        </span>
                      )}
                    </div>
                    {r.isCurrent && (
                      <span className="board-schedule-badge">正在上课</span>
                    )}
                  </div>
                </li>
              );

              return (
                <div className="board-schedule-columns">
                  <div className="board-schedule-col">
                    <div className="board-schedule-col-title">
                      <SvgIcon name="sun" size={14} />
                      <span>上午</span>
                      <em>{morning.length} 节</em>
                    </div>
                    <ol className="board-schedule">
                      {morning.length > 0 ? (
                        morning.map(r => renderItem(r, r.period.index))
                      ) : (
                        <li className="board-schedule-empty">今日上午无课</li>
                      )}
                    </ol>
                  </div>
                  <div className="board-schedule-col">
                    <div className="board-schedule-col-title board-schedule-col-title-pm">
                      <SvgIcon name="sun" size={14} />
                      <span>下午</span>
                      <em>{afternoon.length} 节</em>
                    </div>
                    <ol className="board-schedule">
                      {afternoon.length > 0 ? (
                        afternoon.map(r => renderItem(r, r.period.index))
                      ) : (
                        <li className="board-schedule-empty">今日下午无课</li>
                      )}
                    </ol>
                  </div>
                </div>
              );
            })()
          ) : (
            <p className="board-empty">
              {holiday
                ? `祝你度过愉快的 ${holiday.name}`
                : '好好休息,明天见'}
            </p>
          )}
        </section>

        {hasSide && (
        <section className={`board-side${!showWeather ? ' board-side-no-weather' : ''}${!showMemo ? ' board-side-no-memo' : ''}`}>
          {showWeather && (
          <div className="board-panel board-panel-weather">
            <h2 className="board-panel-title">
              <SvgIcon name="sun" size={22} />
              <span>
                {weather?.city || activeStudent.weatherCity || '天气'}
                {weather?.description ? ` · ${weather.description}` : ''}
              </span>
            </h2>
            {weatherLoading || !weather ? (
              <div className="board-weather-loading">
                <span className="board-skeleton board-skeleton-lg" />
                <span className="board-skeleton" />
                <span className="board-skeleton board-skeleton-sm" />
              </div>
            ) : (
              <div
                className={`board-weather${weather.stale ? ' board-weather-stale' : ''}`}
              >
                {weather.stale && (
                  <div className="board-weather-stale-tip">
                    天气服务暂不可用,以下为占位数据
                  </div>
                )}
                <div className="board-weather-main">
                  <div className="board-weather-primary">
                    <SvgIcon name={weather.icon} size={80} />
                    <div className="board-weather-temp">
                      <span className="board-weather-num">{weather.tempC}</span>
                      <span className="board-weather-unit">℃</span>
                    </div>
                  </div>
                  <div className="board-weather-stats" ref={statsRef}>
                    <div className="board-weather-stat board-weather-stat-humidity">
                      <span className="board-weather-stat-icon">
                        <SvgIcon name="droplet" size={20} />
                      </span>
                      <span className="board-weather-stat-label">湿度</span>
                      <span className="board-weather-stat-value">
                        {weather.humidity}%
                      </span>
                    </div>
                    {showFeelsStat && (
                      <div className="board-weather-stat board-weather-stat-feels">
                        <span className="board-weather-stat-icon">
                          <SvgIcon name="thermometer" size={20} />
                        </span>
                        <span className="board-weather-stat-label">体感</span>
                        <span className="board-weather-stat-value">
                          {weather.feelsLikeC}℃
                        </span>
                      </div>
                    )}
                    {showWindStat && (
                      <div className="board-weather-stat board-weather-stat-wind">
                        <span className="board-weather-stat-icon">
                          <SvgIcon name="wind" size={20} />
                        </span>
                        <span className="board-weather-stat-label">风力</span>
                        <span className="board-weather-stat-value">
                          {weather.windText}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                {weather.forecast[0]?.high != null &&
                  weather.forecast[0]?.low != null && (
                    <div className="board-weather-desc">
                      <span className="board-weather-range">
                        {Math.round(weather.forecast[0].low)}℃~
                        {Math.round(weather.forecast[0].high)}℃
                      </span>
                    </div>
                  )}
                {weather.forecast.length > 1 && (
                  <div className="board-forecast">
                    {weather.forecast.slice(1, 5).map(day => (
                      <div key={day.date} className="board-forecast-item">
                        <div className="board-forecast-day">
                          {day.weekdayLabel}
                        </div>
                        <SvgIcon name={day.icon} size={28} />
                        <div className="board-forecast-temp">
                          {day.high != null ? Math.round(day.high) : '--'}°
                          <span>
                            /{day.low != null ? Math.round(day.low) : '--'}°
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          )}

          {showMemo && (
          <div className="board-panel board-panel-memo" ref={memoPanelRef}>
            <h2 className="board-panel-title">
              <SvgIcon name="notebook" size={22} />
              备忘 {activeMemosTotal > 0 ? `· ${activeMemosTotal}` : ''}
            </h2>
            {activeMemos.length === 0 ? (
              <p className="board-empty">暂无待办</p>
            ) : (
              <ul className="board-memo-list">
                {activeMemos.map(m => {
                  const label = formatRemindLabel(m.remindAt);
                  const remindAt = parseRemindAt(m.remindAt);
                  const overdue =
                    remindAt !== null && remindAt.getTime() < now.getTime();
                  return (
                    <li
                      key={m.id}
                      className={`board-memo-item${overdue ? ' board-memo-item-overdue' : ''}`}
                    >
                      <span className="board-memo-dot" />
                      <div className="board-memo-body">
                        <div className="board-memo-text">{m.text || '(未填写)'}</div>
                      </div>
                      {(label || m.attachmentCounts) && (
                        <div className="board-memo-chips" aria-label="标签">
                          {label && (
                            <span
                              className={`board-memo-chip board-memo-chip-time${overdue ? ' board-memo-chip-time-overdue' : ''}`}
                            >
                              <SvgIcon name="clock" size={12} />
                              {label}
                            </span>
                          )}
                          {m.attachmentCounts && m.attachmentCounts.image > 0 && (
                            <span className="board-memo-chip board-memo-chip-image">
                              <SvgIcon name="picture" size={12} />
                              图片
                              {m.attachmentCounts.image > 1 && (
                                <em>{m.attachmentCounts.image}</em>
                              )}
                            </span>
                          )}
                          {m.attachmentCounts && m.attachmentCounts.video > 0 && (
                            <span className="board-memo-chip board-memo-chip-video">
                              <SvgIcon name="videoframe" size={12} />
                              视频
                              {m.attachmentCounts.video > 1 && (
                                <em>{m.attachmentCounts.video}</em>
                              )}
                            </span>
                          )}
                          {m.attachmentCounts && m.attachmentCounts.audio > 0 && (
                            <span className="board-memo-chip board-memo-chip-audio">
                              <SvgIcon name="audiowave" size={12} />
                              音频
                              {m.attachmentCounts.audio > 1 && (
                                <em>{m.attachmentCounts.audio}</em>
                              )}
                            </span>
                          )}
                          {m.attachmentCounts && m.attachmentCounts.file > 0 && (
                            <span className="board-memo-chip board-memo-chip-file">
                              <SvgIcon name="docfile" size={12} />
                              文件
                              {m.attachmentCounts.file > 1 && (
                                <em>{m.attachmentCounts.file}</em>
                              )}
                            </span>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {memoOverflow > 0 && (
              <div className="board-memo-more">还有 {memoOverflow} 条…</div>
            )}
          </div>
          )}
        </section>
        )}
      </main>

    </div>
  );
}
