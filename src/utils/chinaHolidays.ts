import type { Holiday } from '../config/types';

interface RawDay {
  name: string;
  date: string;
  isOffDay: boolean;
}

interface RawFile {
  year: number;
  days?: RawDay[];
}

const SOURCES = (year: number): string[] => [
  // 首选自家服务端:它会去试下面这几个源并把结果缓存到数据目录,
  // 因此家庭网络连不上 GitHub 时也能拿到(且不受浏览器跨域限制)
  `/api/holidays/${year}`,
  `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`,
  `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`,
  `https://ghproxy.com/https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`,
];

const parseHolidays = (raw: RawFile): Holiday[] => {
  if (!raw?.days || !Array.isArray(raw.days)) return [];
  return raw.days
    .filter(d => d && typeof d.date === 'string' && typeof d.name === 'string' && d.isOffDay === true)
    .map(d => ({ date: d.date, name: d.name, isRestDay: true }));
};

export async function fetchChinaHolidays(year: number): Promise<Holiday[]> {
  const urls = SOURCES(year);
  let lastError: unknown = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        lastError = new Error(`${res.status} ${res.statusText}`);
        continue;
      }
      const data = (await res.json()) as RawFile;
      const list = parseHolidays(data);
      if (list.length > 0) return list;
      lastError = new Error('数据为空');
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('拉取失败，请检查网络');
}

export function mergeHolidays(
  existing: Holiday[],
  incoming: Holiday[],
): Holiday[] {
  const map = new Map<string, Holiday>();
  for (const h of existing) map.set(h.date, h);
  for (const h of incoming) map.set(h.date, h);
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface SyncSummary {
  years: number[];
  incoming: Holiday[];
  added: number;
  updated: number;
  kept: number;
}

const holidaysEqual = (a: Holiday, b: Holiday): boolean =>
  a.date === b.date && a.name === b.name && a.isRestDay === b.isRestDay;

export async function syncChinaHolidays(
  existing: Holiday[],
  startYear: number,
  maxSpan = 4,
): Promise<SyncSummary> {
  const years: number[] = [];
  const incoming: Holiday[] = [];
  for (let y = startYear; y < startYear + maxSpan; y += 1) {
    try {
      const days = await fetchChinaHolidays(y);
      if (days.length === 0) break;
      years.push(y);
      incoming.push(...days);
    } catch {
      break;
    }
  }
  const existingMap = new Map<string, Holiday>();
  for (const h of existing) existingMap.set(h.date, h);
  let added = 0;
  let updated = 0;
  for (const h of incoming) {
    const prev = existingMap.get(h.date);
    if (!prev) added += 1;
    else if (!holidaysEqual(prev, h)) updated += 1;
  }
  const incomingDates = new Set(incoming.map(h => h.date));
  const kept = existing.filter(h => !incomingDates.has(h.date)).length;
  return { years, incoming, added, updated, kept };
}
