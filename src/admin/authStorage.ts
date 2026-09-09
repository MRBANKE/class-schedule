/**
 * 超管账号。
 *
 * 改造前:账号密码 hash 存在每台浏览器的 localStorage、会话存 sessionStorage,
 * 换一台设备就得重新"首次配置",等于每台设备各有一个超管。
 *
 * 现在:凭据由服务端保存(scrypt + 随机盐,落在挂载卷的 auth.json),
 * 登录成功后服务端下发 httpOnly 会话 Cookie —— 全家共用一套账号,
 * 密码也不再以任何形式留在前端存储里。
 *
 * hasCredentials() / loadSession() 仍是同步签名:结果来自 api/client 在渲染前
 * bootstrap() 拿到的状态,main.tsx 里的同步判断因此不用改写。
 */
import {
  authLogin,
  authLogout,
  authSetup,
  getAuthState,
  refreshAuthState,
} from '../api/client';

/** 服务端是否已经创建过超管账号 */
export function hasCredentials(): boolean {
  return getAuthState().initialized;
}

/** 当前浏览器是否持有有效会话 */
export function loadSession(): boolean {
  return getAuthState().authed;
}

/** 首次配置:创建账号并直接登录。服务端已初始化时会抛错(避免被人覆盖密码) */
export function setupCredentials(username: string, password: string): Promise<void> {
  return authSetup(username, password);
}

export function login(username: string, password: string): Promise<void> {
  return authLogin(username, password);
}

export function logout(): Promise<void> {
  return authLogout();
}

/** 与服务端重新对齐登录态(例如 Cookie 过期后) */
export function refreshSession(): Promise<void> {
  return refreshAuthState();
}
