import { useEffect, useState } from 'react';
import { SvgIcon } from '../icons';
import { hasCredentials, login, setupCredentials } from './authStorage';
import './superadmin-auth.css';

const TITLE = '课程表 · 家校助手';
const ICON = '/entrance-icon.png';

interface Props {
  onAuthed: () => void;
}

/** 超管账号密码 Gate:未初始化时显示设置,已初始化未登录时显示登录 */
export default function SuperadminAuth({ onAuthed }: Props) {
  const [mode, setMode] = useState<'setup' | 'login'>(() =>
    hasCredentials() ? 'login' : 'setup',
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = mode === 'setup' ? '首次配置 · 超管' : '超管登录';
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
    setLink('icon', ICON);
    setLink('apple-touch-icon', ICON);
  }, [mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const u = username.trim();
    if (!u) {
      setError('请输入账号');
      return;
    }
    if (!password) {
      setError('请输入密码');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'setup') {
        if (password.length < 6) {
          setError('密码至少 6 位');
          return;
        }
        if (password !== confirm) {
          setError('两次输入的密码不一致');
          return;
        }
        try {
          await setupCredentials(u, password);
        } catch (err) {
          // 409:别的设备刚刚完成了首次配置。此时应该切到登录,而不是报"保存失败"
          if (hasCredentials() || /已初始化/.test(String(err))) {
            setMode('login');
            setError('账号已在其他设备上创建,请直接登录');
          } else {
            setError(err instanceof Error ? err.message : '创建失败,请检查服务是否正常');
          }
          return;
        }
        // 强制切到超管路径,登录后自动进入 AdminApp
        if (typeof window !== 'undefined') {
          if (!/^\/superadmin(?:\/.*)?$/.test(window.location.pathname)) {
            window.history.replaceState(
              null,
              '',
              `/superadmin${window.location.search}`,
            );
            // replaceState 不会触发 popstate,手动派发让 Root 重算 mode
            window.dispatchEvent(new PopStateEvent('popstate'));
          }
        }
        onAuthed();
      } else {
        try {
          await login(u, password);
        } catch (err) {
          const msg = err instanceof Error ? err.message : '登录失败';
          if (/尚未初始化/.test(msg)) {
            setMode('setup');
            setError('尚未初始化,请先设置账号');
          } else {
            setError(msg);
          }
          return;
        }
        onAuthed();
      }
    } finally {
      setBusy(false);
    }
  };

  const isSetup = mode === 'setup';

  return (
    <div className="sa-page">
      <div className="sa-bg" aria-hidden>
        <span className="sa-blob sa-blob-a" />
        <span className="sa-blob sa-blob-b" />
        <div className="sa-grid" />
      </div>
      <form className="sa-card" onSubmit={handleSubmit}>
        <div className="sa-ribbon" aria-hidden />
        <div className="sa-icon">
          <img src={ICON} alt="课程表" />
        </div>
        <div className="sa-title">
          <h1>{isSetup ? '首次配置 · 超管' : '超管登录'}</h1>
          <p>{isSetup ? '设置一个专属的超级管理员账号密码' : `欢迎回来,${TITLE}`}</p>
        </div>

        <div className="sa-field">
          <label className="sa-label" htmlFor="sa-username">
            账号
          </label>
          <input
            id="sa-username"
            type="text"
            className="sa-input"
            value={username}
            maxLength={30}
            placeholder="例如 admin"
            autoComplete="username"
            onChange={e => {
              setUsername(e.target.value);
              setError('');
            }}
            autoFocus
          />
        </div>

        <div className="sa-field">
          <label className="sa-label" htmlFor="sa-password">
            密码
          </label>
          <input
            id="sa-password"
            type="password"
            className="sa-input"
            value={password}
            maxLength={40}
            placeholder={isSetup ? '至少 6 位' : '请输入密码'}
            autoComplete={isSetup ? 'new-password' : 'current-password'}
            onChange={e => {
              setPassword(e.target.value);
              setError('');
            }}
          />
        </div>

        {isSetup && (
          <div className="sa-field">
            <label className="sa-label" htmlFor="sa-confirm">
              确认密码
            </label>
            <input
              id="sa-confirm"
              type="password"
              className="sa-input"
              value={confirm}
              maxLength={40}
              placeholder="再次输入密码"
              autoComplete="new-password"
              onChange={e => {
                setConfirm(e.target.value);
                setError('');
              }}
            />
          </div>
        )}

        {error && <div className="sa-error">{error}</div>}

        <button type="submit" className="sa-btn" disabled={busy}>
          <span>
            {busy
              ? isSetup
                ? '设置中…'
                : '登录中…'
              : isSetup
                ? '设置并进入超管'
                : '登录'}
          </span>
          <SvgIcon name={isSetup ? 'sparkles' : 'backpack'} size={16} />
        </button>

        <div className="sa-hint">
          <SvgIcon name="sparkles" size={13} />
          <span>
            {isSetup
              ? '此账号仅用于访问超管页,请妥善保管密码'
              : '完成设置后可在超管页添加学生并生成分享链接'}
          </span>
        </div>
      </form>
    </div>
  );
}
