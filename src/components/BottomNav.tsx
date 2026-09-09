import { useEffect, useState } from 'react';
import { SvgIcon } from '../icons';
import type { IconName } from '../icons';
import { useConfig } from '../hooks/useConfig';
import { currentSearch, isAdminPath, linkProps } from '../routes';

interface NavItem {
  key: 'today' | 'memo' | 'schedule' | 'admin';
  /**
   * 目标路径,必须写死。这个导航栏在学生主页(/)和家长后台(/admin)里都会渲染,
   * 前三项若只给 '#today' 这类相对 hash,在 /admin 上点"今日"会拼成 /admin#today,
   * 人还留在后台里出不去。
   */
  path: string;
  hash: string;
  label: string;
  icon: IconName;
  tone: 'grass' | 'joy' | 'grape' | 'sunshine' | 'sky' | 'coral';
  isActive: (pathname: string, hash: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    key: 'today',
    path: '/',
    hash: '#today',
    label: '今日',
    icon: 'backpack',
    tone: 'grass',
    isActive: (p, h) => !isAdminPath(p) && (h === '' || h === '#today'),
  },
  {
    key: 'memo',
    path: '/',
    hash: '#memo',
    label: '备忘',
    icon: 'notebook',
    tone: 'joy',
    isActive: (p, h) => !isAdminPath(p) && h === '#memo',
  },
  {
    key: 'schedule',
    path: '/',
    hash: '#schedule',
    label: '课程表',
    icon: 'calendar',
    tone: 'grape',
    isActive: (p, h) => !isAdminPath(p) && h === '#schedule',
  },
  {
    key: 'admin',
    path: '/admin',
    hash: '',
    label: '管理',
    icon: 'laptop',
    tone: 'coral',
    isActive: p => isAdminPath(p),
  },
];

const readLoc = (): { pathname: string; hash: string } =>
  typeof window === 'undefined'
    ? { pathname: '', hash: '' }
    : { pathname: window.location.pathname, hash: window.location.hash };

export default function BottomNav() {
  const [loc, setLoc] = useState(readLoc);
  const { activeStudent } = useConfig();

  useEffect(() => {
    // 页内标签走 hash(hashchange),路由之间切换走 pathname(popstate),两个都要听
    const onNav = () => setLoc(readLoc());
    window.addEventListener('hashchange', onNav);
    window.addEventListener('popstate', onNav);
    return () => {
      window.removeEventListener('hashchange', onNav);
      window.removeEventListener('popstate', onNav);
    };
  }, []);

  const items = NAV_ITEMS.filter(item => {
    if (item.key === 'memo') return activeStudent?.showMemo !== false;
    if (item.key === 'admin') return activeStudent?.showAdmin !== false;
    return true;
  });

  return (
    <nav
      className="bottom-nav"
      aria-label="主导航"
      style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}
    >
      {items.map(item => {
        const active = item.isActive(loc.pathname, loc.hash);
        return (
          <a
            key={item.key}
            {...linkProps(`${item.path}${currentSearch()}${item.hash}`)}
            className={`nav-item nav-item-${item.tone}${active ? ' nav-item-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span className="nav-icon">
              <SvgIcon name={item.icon} size={22} />
            </span>
            <span className="nav-label">{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
