import { DEFAULT_STUDENT, DEFAULT_CONFIG, CURRENT_CONFIG_VERSION } from './defaults';
import type {
  AppConfig,
  Student,
  Holiday,
  PeriodConfig,
  SubjectItem,
  Weekday,
} from './types';
import { WEEKDAYS, WEEKDAYS_FULL } from './types';
import {
  CONFIG_UPDATED_EVENT,
  clearConfig,
  getConfigRaw,
  pushConfig,
} from '../api/client';

export { CONFIG_UPDATED_EVENT };

const isString = (v: unknown): v is string => typeof v === 'string';
const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const sanitizePeriods = (raw: unknown): PeriodConfig[] | null => {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: PeriodConfig[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const obj = item as Record<string, unknown>;
    if (!isFiniteNumber(obj.index)) return null;
    if (!isString(obj.label) || !isString(obj.time)) return null;
    const p: PeriodConfig = { index: obj.index, label: obj.label, time: obj.time };
    // 仅当旧数据显式写入 kind 且非 'class' 时保留,用于后续迁移到 subject.kind
    const kindRaw = obj.kind;
    if (kindRaw === 'break' || kindRaw === 'after-school') {
      p.kind = kindRaw;
    }
    out.push(p);
  }
  return out;
};

const sanitizeCell = (raw: unknown): string => {
  if (isString(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (isString(obj.odd) && obj.odd) return obj.odd;
    if (isString(obj.even) && obj.even) return obj.even;
  }
  return '';
};

const sanitizeSchedule = (
  raw: unknown,
  periodsCount: number,
): Record<Weekday, string[]> | null => {
  if (!raw || typeof raw !== 'object') return null;
  const map = raw as Record<string, unknown>;
  const result: Partial<Record<Weekday, string[]>> = {};
  // 工作日必须存在
  for (const day of WEEKDAYS) {
    const arr = map[day];
    if (!Array.isArray(arr)) return null;
    if (arr.length !== periodsCount) return null;
    result[day] = arr.map(sanitizeCell);
  }
  // 周末可选:缺失或长度不符时补齐为空(默认"请选择课程")
  for (const day of ['周六', '周日'] as Weekday[]) {
    const arr = map[day];
    if (Array.isArray(arr) && arr.length === periodsCount) {
      result[day] = arr.map(sanitizeCell);
    } else {
      result[day] = Array(periodsCount).fill('');
    }
  }
  return result as Record<Weekday, string[]>;
};

const sanitizeSubjects = (raw: unknown): SubjectItem[] | null => {
  if (!Array.isArray(raw)) return null;
  const out: SubjectItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    if (!isString(obj.name) || !obj.name.trim()) continue;
    if (!isString(obj.icon) || !isString(obj.color)) continue;
    const s: SubjectItem = {
      name: obj.name,
      icon: obj.icon as SubjectItem['icon'],
      color: obj.color,
      kind: 'class',
    };
    const kindRaw = obj.kind;
    if (kindRaw === 'break' || kindRaw === 'after-school' || kindRaw === 'class') {
      s.kind = kindRaw;
    }
    if (isString(obj.reminder) && obj.reminder) s.reminder = obj.reminder;
    if (isString(obj.reminderIcon) && obj.reminderIcon) {
      s.reminderIcon = obj.reminderIcon as SubjectItem['reminderIcon'];
    }
    if (obj.weekMode === 'biweekly') {
      s.weekMode = 'biweekly';
      if (isString(obj.oddSubject) && obj.oddSubject) s.oddSubject = obj.oddSubject;
      if (isString(obj.evenSubject) && obj.evenSubject) s.evenSubject = obj.evenSubject;
    }
    if (isString(obj.iconImage) && obj.iconImage) s.iconImage = obj.iconImage;
    if (obj.hideIcon === true) s.hideIcon = true;
    out.push(s);
  }
  return out;
};

// 老配置的 period.kind 迁移:根据 schedule[day][idx] 对应的 period.kind 回填 subject.kind
// 仅在 subject 未显式声明 kind(或仍是默认 class)时应用,避免覆盖用户已配置的值
const migrateKindFromPeriods = (
  subjects: SubjectItem[],
  periods: PeriodConfig[],
  schedule: Record<Weekday, string[]>,
  rawSubjects: unknown,
): SubjectItem[] => {
  const explicit = new Set<string>();
  if (Array.isArray(rawSubjects)) {
    for (const item of rawSubjects) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      if (isString(obj.name) && obj.name && obj.kind) explicit.add(obj.name);
    }
  }
  const nameToKind = new Map<string, PeriodConfig['kind']>();
  for (const day of WEEKDAYS) {
    const row = schedule[day];
    if (!row) continue;
    row.forEach((name, idx) => {
      if (!name || !name.trim()) return;
      if (explicit.has(name)) return;
      const p = periods[idx];
      if (!p || !p.kind) return;
      if (p.kind === 'class') return;
      if (!nameToKind.has(name)) nameToKind.set(name, p.kind);
    });
  }
  if (nameToKind.size === 0) return subjects;
  return subjects.map(s => {
    if (explicit.has(s.name)) return s;
    const inferred = nameToKind.get(s.name);
    return inferred ? { ...s, kind: inferred } : s;
  });
};

const sanitizeHolidays = (raw: unknown): Holiday[] => {
  if (!Array.isArray(raw)) return [];
  const out: Holiday[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    if (!isString(obj.date) || !isString(obj.name)) continue;
    out.push({
      date: obj.date,
      name: obj.name,
      isRestDay: obj.isRestDay !== false,
    });
  }
  return out;
};

const sanitizeStudent = (raw: unknown): Student | null => {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const periods = sanitizePeriods(obj.periods) ?? DEFAULT_STUDENT.periods;
  const schedule =
    sanitizeSchedule(obj.schedule, periods.length) ?? DEFAULT_STUDENT.schedule;
  const parsedSubjects = sanitizeSubjects(obj.subjects);
  const subjects = parsedSubjects
    ? migrateKindFromPeriods(parsedSubjects, periods, schedule, obj.subjects)
    : parsedSubjects;
  return {
    id: isString(obj.id) && obj.id ? obj.id : `student-${Math.random().toString(36).slice(2, 8)}`,
    title:
      isString(obj.title) && obj.title.trim() ? obj.title : DEFAULT_STUDENT.title,
    // 微信卡片描述:硬性截断到 120 字,防止有人贴一大段进配置后被原样注入 <meta>
    shareDescription:
      isString(obj.shareDescription) && obj.shareDescription.trim()
        ? obj.shareDescription.slice(0, 120)
        : undefined,
    logoIcon:
      isString(obj.logoIcon) && obj.logoIcon
        ? (obj.logoIcon as Student['logoIcon'])
        : DEFAULT_STUDENT.logoIcon,
    logoImage: isString(obj.logoImage) && obj.logoImage ? obj.logoImage : undefined,
    timeBased: obj.timeBased === false ? false : true,
    showMemo: obj.showMemo === false ? false : true,
    showAdmin: obj.showAdmin === false ? false : true,
    weatherStation:
      isString(obj.weatherStation) && obj.weatherStation
        ? obj.weatherStation
        : DEFAULT_STUDENT.weatherStation,
    weatherCity:
      isString(obj.weatherCity) && obj.weatherCity
        ? obj.weatherCity
        : DEFAULT_STUDENT.weatherCity,
    termStart:
      isString(obj.termStart) && obj.termStart
        ? obj.termStart
        : DEFAULT_STUDENT.termStart,
    boardShowWeather: obj.boardShowWeather === false ? false : true,
    boardShowMemo: obj.boardShowMemo === false ? false : true,
    boardShowReminder: obj.boardShowReminder === false ? false : true,
    boardStyle: obj.boardStyle === 'ink' ? 'ink' : 'default',
    showSaturday: obj.showSaturday === true,
    showSunday: obj.showSunday === true,
    periods,
    schedule,
    subjects: subjects && subjects.length > 0 ? subjects : DEFAULT_STUDENT.subjects,
  };
};

const looksLikeLegacyConfig = (obj: Record<string, unknown>): boolean =>
  !Array.isArray(obj.students) &&
  !Array.isArray(obj.children) &&
  (isString(obj.title) || obj.periods !== undefined || obj.schedule !== undefined);

const cloneDefaultSchedule = (): Record<Weekday, string[]> => {
  const result = {} as Record<Weekday, string[]>;
  // 必须用 WEEKDAYS_FULL:漏掉周六/周日会让启用周末后读到 undefined 而崩溃
  for (const day of WEEKDAYS_FULL) result[day] = [...DEFAULT_STUDENT.schedule[day]];
  return result;
};

const resetPeriodsAndSchedule = (s: Student): Student => ({
  ...s,
  periods: DEFAULT_STUDENT.periods.map(p => ({ ...p })),
  schedule: cloneDefaultSchedule(),
});

export const parseConfig = (raw: unknown): AppConfig => {
  if (!raw || typeof raw !== 'object') return DEFAULT_CONFIG;
  const obj = raw as Record<string, unknown>;

  const storedVersion = isFiniteNumber(obj.version) ? obj.version : 0;
  const needsScheduleReset = storedVersion < 4;

  if (looksLikeLegacyConfig(obj)) {
    const legacy = sanitizeStudent(obj);
    if (legacy) {
      return {
        version: CURRENT_CONFIG_VERSION,
        students: [needsScheduleReset ? resetPeriodsAndSchedule(legacy) : legacy],
        holidays: sanitizeHolidays(obj.holidays),
      };
    }
  }

  let students: Student[] = [];
  // v3+: students; 兼容 v2: children
  const rawList = Array.isArray(obj.students)
    ? obj.students
    : Array.isArray(obj.children)
      ? obj.children
      : [];
  for (const item of rawList) {
    const student = sanitizeStudent(item);
    if (student) {
      students.push(needsScheduleReset ? resetPeriodsAndSchedule(student) : student);
    }
  }
  // 允许空 students(全新安装或用户主动删完):由上层引导创建
  return {
    version: CURRENT_CONFIG_VERSION,
    students,
    holidays: sanitizeHolidays(obj.holidays),
  };
};

/**
 * 按原始对象身份缓存解析结果。
 * loadConfig() 在渲染路径上被反复调用(main.tsx、useConfig.updateStudent 等),
 * 而 parseConfig 会遍历整份课表;同一份服务端数据没必要重复解析,
 * 且返回稳定的对象身份可以避免无谓的 re-render。
 */
let parsedCache: { raw: unknown; value: AppConfig } | null = null;

/**
 * 读取当前配置。数据来自服务端(启动时由 api/client 的 bootstrap 灌入缓存,
 * 之后由写入与轮询保持最新),因此这里仍是同步的。
 */
export const loadConfig = (): AppConfig => {
  const raw = getConfigRaw();
  if (raw === null || raw === undefined) return DEFAULT_CONFIG;
  if (parsedCache && parsedCache.raw === raw) return parsedCache.value;
  const value = parseConfig(raw);
  parsedCache = { raw, value };
  return value;
};

/**
 * 保存配置。先乐观更新本地缓存并广播(界面立即响应),再异步 PUT 到服务端;
 * 若服务端写入失败,api/client 会回滚缓存、再广播一次并弹窗提示,
 * 界面随之回到保存前的状态 —— 不会出现"显示已保存但刷新就丢"的情况。
 */
export const saveConfig = (config: AppConfig): boolean => {
  if (typeof window === 'undefined') return false;
  void pushConfig(config);
  return true;
};

/** 需要确认服务端确实写入成功时用这个(返回 false 表示服务端拒绝或不可达) */
export const saveConfigNow = (config: AppConfig): Promise<boolean> => {
  if (typeof window === 'undefined') return Promise.resolve(false);
  return pushConfig(config);
};

export const resetConfig = (): AppConfig => {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  void clearConfig();
  return DEFAULT_CONFIG;
};

export const exportConfig = (config: AppConfig): string =>
  JSON.stringify(config, null, 2);

export const importConfigFromJson = (json: string): AppConfig => {
  const parsed = JSON.parse(json);
  return parseConfig(parsed);
};
