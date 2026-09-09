import { useState } from 'react';
import type { AppConfig, Holiday } from '../../config/types';
import { SvgIcon } from '../../icons';
import DatePicker from '../../components/DatePicker';
import {
  fetchChinaHolidays,
  mergeHolidays,
  syncChinaHolidays,
} from '../../utils/chinaHolidays';

interface Props {
  config: AppConfig;
  onChange: (patch: Partial<AppConfig>) => void;
}

const today = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_CHOICES = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

interface FetchStatus {
  tone: 'ok' | 'err' | 'loading';
  text: string;
}

export default function HolidaysSection({ config, onChange }: Props) {
  const sorted = [...config.holidays].sort((a, b) => a.date.localeCompare(b.date));
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [status, setStatus] = useState<FetchStatus | null>(null);

  const commit = (next: Holiday[]) => {
    onChange({ holidays: next });
  };

  const updateAt = (idx: number, patch: Partial<Holiday>) => {
    const next = sorted.map((h, i) => (i === idx ? { ...h, ...patch } : h));
    commit(next);
  };

  const removeAt = (idx: number) => {
    commit(sorted.filter((_, i) => i !== idx));
  };

  const addHoliday = () => {
    commit([...sorted, { date: today(), name: '假期', isRestDay: true }]);
  };

  const handleFetch = async () => {
    setStatus({ tone: 'loading', text: `正在拉取 ${year} 年法定节假日…` });
    try {
      const incoming = await fetchChinaHolidays(year);
      if (incoming.length === 0) {
        setStatus({ tone: 'err', text: `${year} 年数据为空，可能还未发布` });
        return;
      }
      const merged = mergeHolidays(config.holidays, incoming);
      const added = merged.length - config.holidays.length;
      commit(merged);
      setStatus({
        tone: 'ok',
        text:
          added > 0
            ? `已导入 ${incoming.length} 天（新增 ${added} 天，同日期已覆盖）`
            : `已同步 ${incoming.length} 天，全部为覆盖更新`,
      });
    } catch (e) {
      setStatus({
        tone: 'err',
        text: `拉取失败:${e instanceof Error ? e.message : '未知错误'}`,
      });
    }
  };

  const handleSync = async () => {
    setStatus({ tone: 'loading', text: '正在检查最新节假日数据…' });
    try {
      const summary = await syncChinaHolidays(config.holidays, CURRENT_YEAR, 4);
      if (summary.incoming.length === 0) {
        setStatus({ tone: 'err', text: '未获取到任何数据，请检查网络' });
        return;
      }
      const merged = mergeHolidays(config.holidays, summary.incoming);
      commit(merged);
      const yearsTxt = summary.years.join('、');
      if (summary.added === 0 && summary.updated === 0) {
        setStatus({
          tone: 'ok',
          text: `已是最新 · 覆盖同步 ${yearsTxt} 年，共 ${summary.incoming.length} 天`,
        });
      } else {
        setStatus({
          tone: 'ok',
          text: `已刷新 ${yearsTxt} 年 · 新增 ${summary.added} 天，更新 ${summary.updated} 天，保留本地 ${summary.kept} 天`,
        });
      }
    } catch (e) {
      setStatus({
        tone: 'err',
        text: `刷新失败:${e instanceof Error ? e.message : '未知错误'}`,
      });
    }
  };

  return (
    <div className="admin-section">
      <p className="admin-section-hint">当天显示节日名并跳过课表</p>

      <div className="admin-holiday-fetch">
        <label className="admin-label admin-holiday-fetch-label">导入年份</label>
        <select
          className="admin-input admin-holiday-year"
          value={year}
          onChange={e => setYear(Number.parseInt(e.target.value, 10))}
        >
          {YEAR_CHOICES.map(y => (
            <option key={y} value={y}>
              {y} 年
            </option>
          ))}
        </select>
        <button
          type="button"
          className="admin-btn admin-btn-rose"
          onClick={handleFetch}
          disabled={status?.tone === 'loading'}
        >
          {status?.tone === 'loading' ? '拉取中…' : '一键导入'}
        </button>
        <button
          type="button"
          className="admin-btn admin-btn-grass"
          onClick={handleSync}
          disabled={status?.tone === 'loading'}
          title="从当前年开始自动探测所有可用年份，合并覆盖"
        >
          <SvgIcon name="refresh" size={13} /> 刷新同步
        </button>
        <span className="admin-holiday-fetch-hint">
          数据来源：holiday-cn（社区维护）· 刷新会自动拉取当前及后续年份，同日期以线上为准，本地新增自动保留
        </span>
      </div>

      {status && (
        <div className={`admin-toast admin-toast-${status.tone === 'loading' ? 'ok' : status.tone}`}>
          {status.text}
        </div>
      )}

      {sorted.length === 0 && (
        <div className="admin-empty">还没有添加节假日</div>
      )}

      {sorted.length > 0 && (
        <table className="admin-table admin-table-holidays">
          <thead>
            <tr>
              <th style={{ width: 180 }}>日期</th>
              <th>名称</th>
              <th style={{ width: 120 }}>放假</th>
              <th style={{ width: 60 }}>删除</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((h, idx) => (
              <tr key={`${h.date}-${idx}`}>
                <td data-label="日期">
                  <DatePicker
                    tone="rose"
                    allowClear={false}
                    value={h.date}
                    onChange={v => updateAt(idx, { date: v || h.date })}
                  />
                </td>
                <td data-label="名称">
                  <input
                    type="text"
                    className="admin-input"
                    value={h.name}
                    onChange={e => updateAt(idx, { name: e.target.value })}
                    maxLength={20}
                    placeholder="例如：中秋节"
                  />
                </td>
                <td data-label="放假">
                  <label className="admin-checkbox">
                    <input
                      type="checkbox"
                      checked={h.isRestDay}
                      onChange={e =>
                        updateAt(idx, { isRestDay: e.target.checked })
                      }
                    />
                    <span>{h.isRestDay ? '放假' : '正常'}</span>
                  </label>
                </td>
                <td className="admin-td-actions" data-label="删除">
                  <button
                    type="button"
                    className="admin-btn admin-btn-icon admin-btn-danger"
                    onClick={() => removeAt(idx)}
                    aria-label="删除"
                  >
                    <SvgIcon name="trash" size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button
        type="button"
        className="admin-btn admin-btn-rose admin-btn-add"
        onClick={addHoliday}
      >
        <SvgIcon name="plus" size={14} /> 添加节假日
      </button>
    </div>
  );
}
