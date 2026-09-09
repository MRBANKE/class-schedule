/**
 * 外网取数代理。
 *
 * 为什么要放到服务端:
 * - 中央气象台 www.nmc.cn 不允许跨域,且校验 Referer。原来只有 vite dev server 的 proxy
 *   做了这件事(见 vite.config.ts 的历史配置),生产环境静态部署必然拿不到天气,
 *   页面只能显示 stale 占位数据(src/utils/weather.ts 里已注明)。
 * - 节假日数据源在 GitHub,家庭网络下经常连不上。服务端取一次并落盘缓存,
 *   之后即使断网也能用上一次的结果。
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { CACHE_DIR } from './store.mjs';

const NMC_ORIGIN = 'https://www.nmc.cn';
const NMC_HEADERS = {
  Referer: 'https://www.nmc.cn/publish/forecast/ASN/xian.html',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
};

const NMC_TTL_MS = 60_000;
const nmcCache = new Map(); // path -> { at, status, contentType, body }

const withTimeout = async (url, options, ms) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
};

/**
 * 转发 /api/nmc/* 到 www.nmc.cn。
 * 命中 60s 缓存时直接返回:看板是常亮屏,天气组件每 30 分钟轮询一次,
 * 但多块屏 + 多标签同时刷新会在同一秒内打出十几个请求。
 */
export const proxyNmc = async (suffix) => {
  const cached = nmcCache.get(suffix);
  if (cached && Date.now() - cached.at < NMC_TTL_MS) {
    return { ...cached, cached: true };
  }
  const res = await withTimeout(`${NMC_ORIGIN}${suffix}`, { headers: NMC_HEADERS }, 10_000);
  const body = Buffer.from(await res.arrayBuffer());
  const result = {
    at: Date.now(),
    status: res.status,
    contentType: res.headers.get('content-type') || 'application/json; charset=utf-8',
    body,
  };
  // 只缓存成功响应,否则一次 502 会把错误钉住 60 秒
  if (res.ok) nmcCache.set(suffix, result);
  return result;
};

const HOLIDAY_SOURCES = (year) => [
  `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`,
  `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`,
  `https://ghproxy.net/https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`,
];

const holidayCacheFile = (year) => path.join(CACHE_DIR, `holidays-${year}.json`);

/**
 * 取某年的节假日安排。任一源成功就落盘缓存并返回;全部失败时回落到缓存文件,
 * 让离线环境仍能用上一次拉到的数据(节假日一年只变一次,缓存不会过时得离谱)。
 */
export const fetchHolidays = async (year) => {
  let lastError = null;
  for (const url of HOLIDAY_SOURCES(year)) {
    try {
      const res = await withTimeout(url, { headers: { Accept: 'application/json' } }, 8_000);
      if (!res.ok) {
        lastError = new Error(`${res.status} ${res.statusText}`);
        continue;
      }
      const data = await res.json();
      if (!data || !Array.isArray(data.days) || data.days.length === 0) {
        lastError = new Error('数据为空');
        continue;
      }
      await fsp
        .writeFile(holidayCacheFile(year), JSON.stringify(data))
        .catch(() => {});
      return { data, source: url, fromCache: false };
    } catch (e) {
      lastError = e;
    }
  }
  try {
    const raw = await fsp.readFile(holidayCacheFile(year), 'utf8');
    return { data: JSON.parse(raw), source: 'cache', fromCache: true };
  } catch {
    throw lastError instanceof Error ? lastError : new Error('拉取失败');
  }
};
