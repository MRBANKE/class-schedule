import type { MouseEvent } from 'react';

/**
 * 全站路由约定,集中在这里。
 *
 *   /                    学生主页(#today / #memo / #schedule 是页内标签)
 *   /admin[/<分区>]      家长后台(免密)
 *   /board               展示看板
 *   /superadmin[/<分区>] 超管(需登录)
 *
 * 后三个为什么用真实路径而不是 #admin / #board / #superadmin:
 * "添加到主屏幕"的启动地址取自 manifest.start_url,而服务端只看得见 path + search,
 * 看不见 # 后面的内容 —— 用 hash 存下来的快捷方式点开一律退回主页。
 * 页内标签(#today 等)留在 hash 里无所谓,丢了就是默认的"今日"。
 *
 * 老链接(#admin / #board / #superadmin)由 main.tsx 静默改写成新地址,书签仍能进。
 *
 * 这些正则以前散在 main.tsx / AdminApp / BottomNav 各写一份,加 /admin 时又要各改一遍,
 * 漂移就是从这种地方开始的,所以收到一处。
 */

/**
 * 捕获组 1 是分区(basic / subjects / …),没有则为 undefined。
 * 用 (.*) 而不是 (.+),这样带尾斜杠的 /admin/ 也算命中(分区为空串,后面归一化掉);
 * 用 (.+) 的话 /admin/ 会整个不匹配,被当成学生主页渲染。
 */
export const ADMIN_PATH_RE = /^\/admin(?:\/(.*))?$/;
export const SUPERADMIN_PATH_RE = /^\/superadmin(?:\/(.*))?$/;
export const BOARD_PATH_RE = /^\/board(?:\/.*)?$/;

const currentPath = (): string =>
  typeof window === 'undefined' ? '' : window.location.pathname;

export const isAdminPath = (pathname: string = currentPath()): boolean =>
  ADMIN_PATH_RE.test(pathname);

export const isSuperPath = (pathname: string = currentPath()): boolean =>
  SUPERADMIN_PATH_RE.test(pathname);

export const isBoardPath = (pathname: string = currentPath()): boolean =>
  BOARD_PATH_RE.test(pathname);

/** 当前 ?query。跨路由跳转必须原样带上 —— ?id= 决定看的是哪个学生 */
export const currentSearch = (): string =>
  typeof window === 'undefined' ? '' : window.location.search;

/**
 * 站内跳转。
 *
 * 路由之间切换不能交给 <a href> 的默认行为:那是整页重载,点一下"管理"就要重新拉
 * 一遍 JS、重新 bootstrap 一次 /api/state,比改造前的 hash 跳转明显卡顿。
 * 这里统一 pushState + 手动派发 popstate —— 各路由层监听的正是 popstate,
 * 收到就重新 detect 一次,体验和以前的 hash 切换一样即时。
 * (index.html 包过 pushState,manifest 的 start_url 会自动跟着同步,这里不用管。)
 */
export const navigate = (url: string): void => {
  if (typeof window === 'undefined') return;
  window.history.pushState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

/**
 * 给站内链接用的 props:仍然渲染成真正的 <a href>,只在普通左键点击时接管。
 * 中键、Ctrl/Cmd+点击(在新标签打开)、右键复制链接都交回浏览器,不破坏这些习惯操作。
 *
 * 「只换页内标签」的那一类链接故意不接管:页内标签(#today / #memo / #schedule)靠
 * hashchange 切换,而 pushState 不触发 hashchange —— 一律 pushState 的话,点"备忘"
 * 地址栏变了、页面却不动。同一页只改 hash 时交给浏览器原生跳转最省事也最正确。
 */
export const linkProps = (
  url: string,
): { href: string; onClick: (e: MouseEvent<HTMLAnchorElement>) => void } => ({
  href: url,
  onClick: e => {
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    ) {
      return;
    }
    const cur = window.location;
    const target = new URL(url, cur.href);
    const samePage =
      target.pathname === cur.pathname && target.search === cur.search;
    // 同页换 hash:放手,让浏览器触发 hashchange
    if (samePage && target.hash && target.hash !== cur.hash) return;
    e.preventDefault();
    // 已经停在目标地址(例如再点一下当前高亮的那个 tab):什么都不做。
    // 交给浏览器的话,指向同一个无 hash 地址的链接会整页重载
    if (samePage && target.hash === cur.hash) return;
    navigate(url);
  },
});
