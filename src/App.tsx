import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import BottomNav from './components/BottomNav';

type TabKey = 'today' | 'memo' | 'schedule';
import MemoCard from './components/MemoCard';
import MobileSchedule from './components/MobileSchedule';
import ScheduleTable from './components/ScheduleTable';
import TodayPanel from './components/TodayPanel';
import WeatherCard from './components/WeatherCard';
import {
  getDisplayDay,
  getVisibleWeekdays,
  weekendOptionsOf,
} from './data/schedule';
import { useConfig } from './hooks/useConfig';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useWeather } from './hooks/useWeather';
import { SvgIcon } from './icons';
import { currentSearch, linkProps } from './routes';
import { getCurrentPeriodIndex } from './utils/timeSlot';
import {
  computeWeekParity,
  createSubjectLookup,
  resolveSubjectName,
} from './data/subjects';
import './App.css';

const VALID_TABS: TabKey[] = ['today', 'memo', 'schedule'];

const readTabFromHash = (): TabKey => {
  if (typeof window === 'undefined') return 'today';
  const h = window.location.hash.replace('#', '');
  return (VALID_TABS as string[]).includes(h) ? (h as TabKey) : 'today';
};

function App() {
  const [, setTick] = useState(0);
  const [weatherHeight, setWeatherHeight] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<TabKey>(readTabFromHash);
  const weatherRef = useRef<HTMLElement>(null);

  const { config, activeStudent: maybeStudent } = useConfig();
  // main.tsx 已经保证进 App 组件时 ?id= 一定命中真实学生,这里的 ! 只是收窄类型。
  // 不能在 hooks 之前 early-return,因为下面还有 useEffect 依赖它的字段。
  const activeStudent = maybeStudent!;
  const { title, logoIcon, logoImage, periods, schedule, subjects, timeBased } = activeStudent;
  const { holidays } = config;
  const showMemo = activeStudent.showMemo !== false;

  useEffect(() => {
    if (activeTab === 'memo' && !showMemo) {
      setActiveTab('today');
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', '#today');
      }
    }
  }, [activeTab, showMemo]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const pwaIcon = logoImage || '/avatars/avatar-01.jpg';

    const setMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
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

    // 标题与图标按学生切换:iOS"添加到主屏幕"的名称取自 apple-mobile-web-app-title、
    // 图标取自 apple-touch-icon,这两项就够让每个学生的快捷方式各自显示自己的名字和头像。
    document.title = title;
    setMeta('apple-mobile-web-app-title', title);
    setLink('apple-touch-icon', pwaIcon);
    setLink('icon', pwaIcon);

    // manifest 不在这里拼:统一调用 index.html 里那份 sync(它会把当前页完整地址
    // pathname+search+hash 编码进 /manifest.webmanifest?start=,由服务端生成 start_url)。
    // 以前这里自己拼 start_url、对第一个学生删掉 ?id=、丢掉 hash,还用 data: URI 覆盖掉
    // 正确的链接 —— 那正是"添加到主屏幕只打开主页"的根因,不要再复活。
    window.__syncManifest?.();
  }, [title, logoImage]);

  useEffect(() => {
    let timerId: number;
    const scheduleNext = () => {
      const now = new Date();
      const nowMs =
        now.getHours() * 3600_000 +
        now.getMinutes() * 60_000 +
        now.getSeconds() * 1000 +
        now.getMilliseconds();
      let nextBoundaryMs = Infinity;
      for (const p of periods) {
        const parts = p.time.split('-').map(x => x.trim());
        for (const t of parts) {
          const [h, m] = t.split(':').map(v => Number.parseInt(v, 10));
          if (!Number.isFinite(h) || !Number.isFinite(m)) continue;
          const boundaryMs = h * 3600_000 + m * 60_000;
          if (boundaryMs > nowMs) {
            nextBoundaryMs = Math.min(nextBoundaryMs, boundaryMs - nowMs);
          }
        }
      }
      const delay = Math.min(
        15_000,
        Number.isFinite(nextBoundaryMs) ? nextBoundaryMs + 250 : 15_000,
      );
      timerId = window.setTimeout(() => {
        setTick(t => t + 1);
        scheduleNext();
      }, Math.max(500, delay));
    };
    scheduleNext();
    return () => window.clearTimeout(timerId);
  }, [periods]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  useEffect(() => {
    // 后台/看板/超管都是 pathname 路由,hash 里如今只剩本页的三个标签,不用再过滤
    const onHash = () => setActiveTab(readTabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const weekend = weekendOptionsOf(activeStudent);
  const visibleWeekdays = getVisibleWeekdays(weekend);
  const display = getDisplayDay(periods, holidays, new Date(), timeBased, weekend);
  const today = display.weekday;
  const holiday = display.holiday;
  // offsetDays !== 0 表示展示的是未来某天,此时不能按当前时钟高亮"正在上课"
  const currentPeriodIndex =
    display.offsetDays !== 0 || !timeBased ? null : getCurrentPeriodIndex(periods);

  const { weather, loading: weatherLoading } = useWeather(
    activeStudent.weatherStation,
    activeStudent.weatherCity,
  );
  const isNarrow = useMediaQuery('(max-width: 720px)');

  useLayoutEffect(() => {
    if (activeTab !== 'today') {
      setWeatherHeight(0);
      return;
    }
    const el = weatherRef.current;
    if (!el || isNarrow) {
      setWeatherHeight(0);
      return;
    }
    const measure = () => setWeatherHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [isNarrow, weather, activeTab]);

  const now = new Date();
  const weatherDateStr = now.toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  const headerStatus = (() => {
    if (holiday) {
      return {
        label: `今日 · ${holiday.name}`,
        hint: '放假，好好玩耍',
        tone: 'sunshine',
      };
    }
    if (!today) return { label: '周末', hint: '好好休息', tone: 'sunshine' };
    const subjectLookup = createSubjectLookup(subjects);
    const parity = computeWeekParity(now, activeStudent.termStart);
    // 'empty' 表示该节次没排课:既不是正课也不是休息,不参与课程计数,
    // 否则周六启用但没排课时会显示"共 8 节课"
    const kindAt = (idx: number): 'class' | 'break' | 'after-school' | 'empty' => {
      const raw = schedule[today]?.[idx] ?? '';
      if (!raw.trim()) return 'empty';
      const resolved = resolveSubjectName(raw, subjects, parity);
      return subjectLookup(resolved).kind ?? 'class';
    };
    const classPeriods = periods.filter((_, i) => {
      const k = kindAt(i);
      return k !== 'break' && k !== 'empty';
    });
    const classCount = classPeriods.length;
    const countHint = classCount === 0 ? '今天没有课' : `共 ${classCount} 节课`;
    if (display.offsetDays >= 2) {
      return {
        label: `${display.offsetDays}天后 · ${today}`,
        hint: countHint,
        tone: 'grape',
      };
    }
    if (display.isTomorrow) {
      return {
        label: `明日 · ${today}`,
        hint: countHint,
        tone: 'grape',
      };
    }
    if (!timeBased) {
      return {
        label: `今日 · ${today}`,
        hint: countHint,
        tone: 'grass',
      };
    }
    const currentIdx = getCurrentPeriodIndex(periods, now);
    const currentPeriod = currentIdx != null ? periods[currentIdx] : null;
    if (currentPeriod && currentIdx != null && kindAt(currentIdx) === 'break') {
      const endTxt = currentPeriod.time.split('-')[1]?.trim() ?? '';
      return {
        label: '正在休息',
        hint: endTxt
          ? `${currentPeriod.label} · ${endTxt} 结束`
          : currentPeriod.label,
        tone: 'sunshine',
      };
    }
    if (currentPeriod && currentIdx != null) {
      const rawSubject = schedule[today]?.[currentIdx] ?? '';
      if (!rawSubject.trim()) {
        const endTxt = currentPeriod.time.split('-')[1]?.trim() ?? '';
        return {
          label: '没有课',
          hint: endTxt
            ? `${currentPeriod.label} · ${endTxt} 结束`
            : currentPeriod.label,
          tone: 'sunshine',
        };
      }
    }
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const remaining = classPeriods.filter(p => {
      const end = p.time.split('-')[1]?.trim() ?? '';
      const [h, m] = end.split(':').map(v => Number.parseInt(v, 10));
      if (!Number.isFinite(h) || !Number.isFinite(m)) return false;
      return nowMin < h * 60 + m;
    }).length;
    return {
      label: `今日 · ${today}`,
      hint: remaining > 0 ? `还剩 ${remaining} 节课` : '课程已结束',
      tone: 'grass',
    };
  })();

  const scheduleProps = {
    today,
    // 传 offsetDays 而不是 isTomorrow:offsetDays>=2 时(如周六打开、下一课日是周一)
    // 二元的 isTomorrow=false 会让课表把那一天误标成"今日"
    offsetDays: display.offsetDays,
    schedule,
    periods,
    subjects,
    holiday,
    termStart: activeStudent.termStart,
    visibleWeekdays,
  };

  type SideNavItem = {
    key: TabKey | 'admin';
    icon: Parameters<typeof SvgIcon>[0]['name'];
    label: string;
    hint: string;
    tone: 'grass' | 'joy' | 'grape' | 'coral';
    href: string;
  };
  const showAdmin = activeStudent.showAdmin !== false;
  const SIDE_ITEMS: SideNavItem[] = [
    { key: 'today', icon: 'backpack', label: '今日', hint: '课程 · 天气', tone: 'grass', href: '#today' },
    ...(showMemo
      ? [{ key: 'memo' as const, icon: 'notebook' as const, label: '备忘', hint: '记录 · 提醒', tone: 'joy' as const, href: '#memo' }]
      : []),
    { key: 'schedule', icon: 'calendar', label: '课程表', hint: '一周安排', tone: 'grape', href: '#schedule' },
    // 管理是独立路径 /admin,要把 ?id= 带过去
    ...(showAdmin
      ? [{ key: 'admin' as const, icon: 'laptop' as const, label: '管理', hint: '编辑 · 配置', tone: 'coral' as const, href: `/admin${currentSearch()}` }]
      : []),
  ];

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <span className="app-title-icon">
            {logoImage ? (
              <img src={logoImage} alt="" className="app-title-logo-img" />
            ) : (
              <SvgIcon name={logoIcon} size={26} />
            )}
          </span>
          <div className="app-title-text">
            <h1>{title}</h1>
            <button
              type="button"
              className="app-title-id"
              title={`学生 ID:${activeStudent.id}(点击复制)`}
              onClick={() => {
                if (typeof navigator === 'undefined') return;
                navigator.clipboard?.writeText(activeStudent.id).catch(() => {
                  /* 忽略复制失败,不打扰用户 */
                });
              }}
            >
              <span className="app-title-id-key">ID</span>
              <span className="app-title-id-value">{activeStudent.id}</span>
            </button>
          </div>
        </div>
        <div className={`app-status app-status-${headerStatus.tone}`}>
          <span className="app-status-dot" aria-hidden />
          <div className="app-status-text">
            <span className="app-status-label">{headerStatus.label}</span>
            <span className="app-status-hint">{headerStatus.hint}</span>
          </div>
        </div>
      </header>

      <div className="app-body">
        <aside className="app-side">
          <nav className="app-side-nav" aria-label="主导航">
            {SIDE_ITEMS.map(item => {
              const active = item.key !== 'admin' && activeTab === item.key;
              return (
                <a
                  key={item.key}
                  // 统一走 linkProps:它自己会分辨 —— 页内标签(只换 hash)交回浏览器
                  // 默认行为以触发 hashchange,"管理"这种跨路由跳转才 pushState,
                  // 免得整页重载
                  {...linkProps(item.href)}
                  className={`app-side-item app-side-item-${item.tone}${active ? ' app-side-item-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="app-side-icon">
                    <SvgIcon name={item.icon} size={20} />
                  </span>
                  <span className="app-side-text">
                    <span className="app-side-label">{item.label}</span>
                    <span className="app-side-hint">{item.hint}</span>
                  </span>
                </a>
              );
            })}
          </nav>
        </aside>

        <main className="app-main">
          {activeTab === 'today' && (
            <div className="top-row">
              <WeatherCard
              ref={weatherRef}
              weather={weather}
              loading={weatherLoading}
              cityHint={activeStudent.weatherCity}
              dateStr={weatherDateStr}
            />
              <TodayPanel
                today={today}
                currentPeriodIndex={currentPeriodIndex}
                isTomorrow={display.isTomorrow}
                offsetDays={display.offsetDays}
                schedule={schedule}
                periods={periods}
                subjects={subjects}
                holiday={holiday}
                maxHeight={isNarrow ? undefined : weatherHeight || undefined}
                compact={isNarrow}
                timeBased={timeBased}
                termStart={activeStudent.termStart}
              />
            </div>
          )}
          {activeTab === 'memo' && <MemoCard />}
          {activeTab === 'schedule' &&
            (isNarrow ? (
              <MobileSchedule {...scheduleProps} />
            ) : (
              <ScheduleTable {...scheduleProps} />
            ))}
        </main>
      </div>

      <footer className="app-footer">
        <SvgIcon name="book" size={16} />
        <span>好好学习，天天向上</span>
      </footer>

      <BottomNav />
    </div>
  );
}

export default App;
