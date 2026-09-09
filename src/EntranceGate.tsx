import { useEffect, useState } from 'react';
import { SvgIcon } from './icons';
import type { IconName } from './icons';
import { isAdminPath, isBoardPath } from './routes';
import './EntranceGate.css';

const ENTRANCE_TITLE = '课程表 · 家校助手';
const ENTRANCE_ICON = '/entrance-icon.png';

interface FloatItem {
  name: IconName;
  cls: string;
  size: number;
}

const FLOATS: FloatItem[] = [
  { name: 'book', cls: 'entrance-float-1', size: 42 },
  { name: 'pencil', cls: 'entrance-float-2', size: 34 },
  { name: 'palette', cls: 'entrance-float-3', size: 40 },
  { name: 'sparkles', cls: 'entrance-float-4', size: 28 },
  { name: 'calc', cls: 'entrance-float-5', size: 36 },
  { name: 'star', cls: 'entrance-float-6', size: 26 },
  { name: 'music', cls: 'entrance-float-7', size: 32 },
  { name: 'rainbow', cls: 'entrance-float-8', size: 38 },
];

interface Props {
  initialId?: string;
  errorText?: string;
}

/** 全站入口拦截:必须携带 ?id=xxx 参数且 ID 需能匹配到实际学生才可访问 */
export default function EntranceGate({ initialId = '', errorText = '' }: Props = {}) {
  const [studentId, setStudentId] = useState(initialId);
  const [error, setError] = useState(errorText);

  // props 变化时同步 error(路由从"无此 ID"跳到 gate 后拿到新错误提示)
  useEffect(() => {
    setError(errorText);
  }, [errorText]);
  useEffect(() => {
    setStudentId(initialId);
  }, [initialId]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = ENTRANCE_TITLE;
    const setLink = (rel: string, href: string) => {
      let el = document.querySelector(
        `link[rel="${rel}"]`,
      ) as HTMLLinkElement | null;
      if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', rel);
        document.head.appendChild(el);
      }
      el.setAttribute('href', href);
    };
    setLink('icon', ENTRANCE_ICON);
    setLink('apple-touch-icon', ENTRANCE_ICON);
  }, []);

  const handleEnter = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = studentId.trim();
    if (!raw) {
      setError('请输入学生 ID');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(raw)) {
      setError('只能包含英文、数字、- 或 _');
      return;
    }
    if (typeof window !== 'undefined') {
      // 学生视图统一挂在根路径,避免用户从 /superadmin/xxx 场景过来拼出畸形链接;
      // 但看板和家长后台是独立路径,在 /board、/admin(/分区) 上补完 ID 后要留在原处,
      // 不能被打回学生主页 —— 保留完整 pathname,深链的分区也就一起留住了
      const onSubRoute = isBoardPath() || isAdminPath();
      const path = onSubRoute ? window.location.pathname : '/';
      const hash = onSubRoute ? '' : window.location.hash || '#today';
      const base = `${window.location.origin}${path}`;
      window.location.href = `${base}?id=${encodeURIComponent(raw)}${hash}`;
    }
  };

  return (
    <div className="entrance-page">
      <div className="entrance-bg" aria-hidden>
        <span className="entrance-blob entrance-blob-a" />
        <span className="entrance-blob entrance-blob-b" />
        <span className="entrance-blob entrance-blob-c" />
        <span className="entrance-blob entrance-blob-d" />
        <div className="entrance-grid" />
        {FLOATS.map(f => (
          <span key={f.name} className={`entrance-float ${f.cls}`} aria-hidden>
            <SvgIcon name={f.name} size={f.size} />
          </span>
        ))}
      </div>

      <form className="entrance-card" onSubmit={handleEnter}>
        <div className="entrance-ribbon" aria-hidden />
        <div className="entrance-icon">
          <img src={ENTRANCE_ICON} alt="课程表" />
        </div>
        <div className="entrance-title">
          <h1>课程表 · 家校助手</h1>
          <p>每日课表 · 天气提醒 · 家校备忘</p>
        </div>

        <div className="entrance-features" aria-hidden>
          <span className="entrance-feature">
            <SvgIcon name="calendar" size={12} />
            <span>每日课表</span>
          </span>
          <span className="entrance-feature">
            <SvgIcon name="sun" size={12} />
            <span>天气提醒</span>
          </span>
          <span className="entrance-feature">
            <SvgIcon name="notebook" size={12} />
            <span>家校备忘</span>
          </span>
        </div>

        <div className="entrance-field">
          <label className="entrance-label" htmlFor="entrance-input">
            学生 ID
          </label>
          <input
            id="entrance-input"
            type="text"
            className={`entrance-input${error ? ' entrance-input-error' : ''}`}
            value={studentId}
            onChange={e => {
              setStudentId(e.target.value);
              setError('');
            }}
            placeholder="例如 student1"
            maxLength={30}
            autoFocus
          />
          {error && <div className="entrance-error">{error}</div>}
        </div>

        <button type="submit" className="entrance-btn">
          <span>进入课程表</span>
          <SvgIcon name="backpack" size={16} />
        </button>

        <div className="entrance-hint">
          <SvgIcon name="sparkles" size={13} />
          <span>ID 由管理员分配,可从分享链接的 ?id= 参数获取</span>
        </div>

        <div className="entrance-footer" aria-hidden>
          <SvgIcon name="book" size={16} />
          <SvgIcon name="pencil" size={16} />
          <SvgIcon name="palette" size={16} />
          <SvgIcon name="calc" size={16} />
          <SvgIcon name="music" size={16} />
          <SvgIcon name="star" size={16} />
        </div>
      </form>
    </div>
  );
}
