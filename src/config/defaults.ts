import { DEFAULT_SUBJECTS } from '../data/subjects';
import type { AppConfig, Student } from './types';

export const DEFAULT_STUDENT: Student = {
  id: 'default',
  title: '示例课程表',
  logoIcon: 'school',
  logoImage: '/avatars/avatar-04.jpg',
  timeBased: true,
  showMemo: true,
  showAdmin: true,
  weatherStation: 'RfjCI',
  weatherCity: '西安',
  termStart: `${new Date().getFullYear()}-09-01`,
  boardShowWeather: true,
  boardShowMemo: true,
  boardStyle: 'default',
  showSaturday: false,
  showSunday: false,
  periods: [
    { index: 1, time: '08:20 - 09:00', label: '第1节', kind: 'class' },
    { index: 2, time: '09:30 - 10:10', label: '第2节', kind: 'class' },
    { index: 3, time: '10:25 - 11:05', label: '第3节', kind: 'class' },
    { index: 4, time: '11:20 - 12:00', label: '第4节', kind: 'class' },
    { index: 5, time: '14:25 - 15:05', label: '第5节', kind: 'class' },
    { index: 6, time: '15:25 - 16:05', label: '第6节', kind: 'class' },
    { index: 7, time: '16:20 - 17:00', label: '课后服务七', kind: 'after-school' },
    { index: 8, time: '17:15 - 17:55', label: '课后服务八', kind: 'after-school' },
  ],
  schedule: {
    周一: ['数学', '语文', '书法', '英语', '体育', '班会', '数学', '语文'],
    周二: ['语文', '数学', '音乐', '体健', '科学', '道法', '语文', '英语'],
    周三: ['数学', '语文', '阅读', '美术', '心理', '体育', '社团', '社团'],
    周四: ['语文', '数学', '英语', '体育', '道法', '音乐', '语文', '数学'],
    周五: ['数学', '语文', '美术', '英语', '体育', '劳动', '数学', '语文'],
    周六: ['', '', '', '', '', '', '', ''],
    周日: ['', '', '', '', '', '', '', ''],
  },
  subjects: DEFAULT_SUBJECTS,
};

export const CURRENT_CONFIG_VERSION = 4;

/**
 * 全新安装默认无学生 —— 由用户在超管页创建自己的第一个学生。
 * DEFAULT_STUDENT 仅作为「新增学生」时的模板,不会自动写入配置。
 */
export const DEFAULT_CONFIG: AppConfig = {
  version: CURRENT_CONFIG_VERSION,
  students: [],
  holidays: [],
};
