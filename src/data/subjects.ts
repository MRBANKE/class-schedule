import type { SubjectItem } from '../config/types';

export type { SubjectItem as SubjectConfig };

export const DEFAULT_SUBJECTS: SubjectItem[] = [
  { name: '语文', icon: 'book', color: '#FCE7DC', kind: 'class' },
  { name: '数学', icon: 'calc', color: '#DDE7FA', kind: 'class', reminderIcon: 'calc', reminder: '别忘了带铅笔和橡皮' },
  { name: '英语', icon: 'globe', color: '#E4D8F5', kind: 'class' },
  { name: '书法', icon: 'brush', color: '#F5E7C4', kind: 'class', reminderIcon: 'brush', reminder: '带毛笔、墨水和字帖' },
  { name: '音乐', icon: 'music', color: '#FCE1C6', kind: 'class', reminderIcon: 'music', reminder: '带口风琴或竖笛' },
  { name: '阅读', icon: 'bookmark', color: '#F6D9F0', kind: 'class', reminderIcon: 'bookmark', reminder: '带课外阅读书' },
  { name: '美术', icon: 'palette', color: '#F7F1C7', kind: 'class', reminderIcon: 'palette', reminder: '带水彩笔和画纸' },
  { name: '体育', icon: 'dumbbell', color: '#D6EEDC', kind: 'class', reminderIcon: 'dumbbell', reminder: '穿运动鞋和运动服' },
  { name: '体健', icon: 'heartpulse', color: '#CFEEDE', kind: 'class', reminderIcon: 'heartpulse', reminder: '穿方便活动的运动服' },
  { name: '科学', icon: 'flask', color: '#D5E4FB', kind: 'class', reminderIcon: 'flask', reminder: '带实验记录本' },
  { name: '心理', icon: 'brain', color: '#E4E1F7', kind: 'class' },
  { name: '道法', icon: 'scale', color: '#DDD5F7', kind: 'class' },
  { name: '班会', icon: 'users', color: '#FBE5D6', kind: 'class' },
  { name: '劳动', icon: 'broom', color: '#FFF3C4', kind: 'class', reminderIcon: 'broom', reminder: '带抹布或劳动工具' },
  { name: '社团', icon: 'community', color: '#FED4DA', kind: 'after-school' },
  { name: '信息', icon: 'laptop', color: '#CFEDF3', kind: 'class' },
  { name: '综合', icon: 'puzzle', color: '#D8F1CE', kind: 'class' },
  { name: '午休', icon: 'moon', color: '#EBEBEB', kind: 'break' },
];

const FALLBACK: SubjectItem = { name: '', icon: 'book', color: '#EEEEEE' };

export const createSubjectLookup = (subjects: SubjectItem[]) => {
  const map = new Map<string, SubjectItem>();
  for (const s of subjects) map.set(s.name, s);
  return (name: string): SubjectItem =>
    map.get(name) ?? { ...FALLBACK, name };
};

export const getSubject = (name: string): SubjectItem => {
  const found = DEFAULT_SUBJECTS.find(s => s.name === name);
  return found ?? { ...FALLBACK, name };
};

export const subjectGradient = (color: string): string =>
  `linear-gradient(135deg, color-mix(in srgb, ${color} 65%, #eef3ff 35%) 0%, ${color} 55%, color-mix(in srgb, ${color} 70%, #fff2e2 30%) 100%)`;

export type WeekParity = 'odd' | 'even';

const parseISODate = (s?: string): Date | null => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(v => Number.parseInt(v, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(y, m - 1, d);
};

/**
 * 计算当前日期相对学期起始日的周次奇偶。
 * 学期起始那一周(第 1 周)为「单周」。
 */
export function computeWeekParity(
  now: Date = new Date(),
  termStart?: string,
): WeekParity {
  const start =
    parseISODate(termStart) ?? new Date(new Date().getFullYear(), 8, 1);
  start.setHours(0, 0, 0, 0);
  // 把 start 挪到当周周一,让每周从周一开始计数
  const startDay = start.getDay();
  const shift = startDay === 0 ? -6 : 1 - startDay;
  start.setDate(start.getDate() + shift);

  const cur = new Date(now);
  cur.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((cur.getTime() - start.getTime()) / 86400000);
  const week = Math.floor(diffDays / 7);
  return week % 2 === 0 ? 'odd' : 'even';
}

/**
 * 将课表格子里的原始课程名 -> 实际展示的课程名。
 * 若课程库对应的 subject.weekMode === 'biweekly',则按当前周次 parity 选 oddSubject/evenSubject;
 * 若匹配不到子课程,回退到原始名。
 */
export function resolveSubjectName(
  name: string,
  subjects: SubjectItem[],
  parity: WeekParity,
): string {
  if (!name) return '';
  const lookup = createSubjectLookup(subjects);
  const subject = lookup(name);
  if (subject.weekMode !== 'biweekly') return name;
  const target = parity === 'odd' ? subject.oddSubject : subject.evenSubject;
  if (target && target.trim()) return target;
  return name;
}
