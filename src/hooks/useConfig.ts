import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppConfig, Student } from '../config/types';
import {
  CONFIG_UPDATED_EVENT,
  loadConfig,
  resetConfig,
  saveConfig,
} from '../config/storage';

const readStudentOverride = (): string | null => {
  if (typeof window === 'undefined') return null;
  const p = new URLSearchParams(window.location.search);
  // 主参数 ?id=,兼容读取历史链接的 ?student= / ?child=
  // 用 || 而非 ??:?id= 为空串时应继续回退,而不是短路掉兼容参数
  // trim 必须与 main.tsx 的校验保持一致,否则 "?id=%20a%20" 会校验通过却匹配不到学生,
  // 静默回落到第一个学生(显示成别人的课表)
  const raw = p.get('id') || p.get('student') || p.get('child') || '';
  return raw.trim() || null;
};

export function useConfig() {
  const [config, setConfig] = useState<AppConfig>(loadConfig);
  const [studentOverride, setStudentOverride] = useState<string | null>(readStudentOverride);

  useEffect(() => {
    // 配置变化(本机保存或轮询发现别的设备改了)都会广播这个事件
    const refresh = () => setConfig(loadConfig());
    window.addEventListener(CONFIG_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(CONFIG_UPDATED_EVENT, refresh);
  }, []);

  useEffect(() => {
    const onNav = () => setStudentOverride(readStudentOverride());
    window.addEventListener('popstate', onNav);
    window.addEventListener('hashchange', onNav);
    return () => {
      window.removeEventListener('popstate', onNav);
      window.removeEventListener('hashchange', onNav);
    };
  }, []);

  // 保存失败(服务端不可达等)时,api/client 会回滚缓存并广播,
  // 上面的 refresh 监听会把界面恢复到保存前的状态,这里不需要额外处理
  const update = useCallback((next: AppConfig) => {
    saveConfig(next);
    setConfig(next);
  }, []);

  const reset = useCallback(() => {
    const fresh = resetConfig();
    setConfig(fresh);
  }, []);

  // 允许 null:全新安装或用户删完学生后应该由上层显示引导,而不是崩溃
  const activeStudent = useMemo<Student | null>(() => {
    if (studentOverride) {
      const match = config.students.find(s => s.id === studentOverride);
      if (match) return match;
    }
    return config.students[0] ?? null;
  }, [config, studentOverride]);

  const updateStudent = useCallback(
    (studentId: string, patch: Partial<Student>) => {
      // 基于最新磁盘数据合并,而不是可能已过期的 state 快照:
      // 后台与看板同时打开时,用旧快照整份覆盖会丢掉另一个标签刚保存的修改
      const latest = loadConfig();
      const next: AppConfig = {
        ...latest,
        students: latest.students.map(s =>
          s.id === studentId ? { ...s, ...patch } : s,
        ),
      };
      saveConfig(next);
      setConfig(next);
    },
    [],
  );

  return { config, activeStudent, update, updateStudent, reset };
}
