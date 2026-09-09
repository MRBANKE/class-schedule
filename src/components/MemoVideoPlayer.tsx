import { useCallback, useEffect, useRef, useState } from 'react';
import { SvgIcon } from '../icons';

interface Props {
  src: string;
  name?: string;
  onError?: () => void;
}

/** 秒 → mm:ss / h:mm:ss */
const formatDuration = (secondsRaw: number): string => {
  if (!Number.isFinite(secondsRaw) || secondsRaw < 0) return '0:00';
  const s = Math.floor(secondsRaw);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hh > 0) return `${hh}:${pad(mm)}:${pad(ss)}`;
  return `${mm}:${pad(ss)}`;
};

export default function MemoVideoPlayer({ src, name, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // 播放中隐藏控件、鼠标移动或暂停时显示;移动端 tap 切换
  const [uiVisible, setUiVisible] = useState(true);
  const hideTimer = useRef<number | null>(null);

  // 显示 UI 并设置隐藏计时,仅在播放态生效
  const showUi = useCallback(() => {
    setUiVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    if (videoRef.current && !videoRef.current.paused) {
      hideTimer.current = window.setTimeout(() => setUiVisible(false), 2500);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  // 事件订阅
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => setDuration(v.duration || 0);
    const onTime = () => setCurrent(v.currentTime || 0);
    const onPlay = () => {
      setPlaying(true);
      showUi();
    };
    const onPause = () => {
      setPlaying(false);
      setUiVisible(true);
    };
    const onVolume = () => {
      setVolume(v.volume);
      setMuted(v.muted);
    };
    const onProgress = () => {
      if (!v.buffered.length) return;
      setBuffered(v.buffered.end(v.buffered.length - 1));
    };
    v.addEventListener('loadedmetadata', onLoaded);
    v.addEventListener('durationchange', onLoaded);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('volumechange', onVolume);
    v.addEventListener('progress', onProgress);
    return () => {
      v.removeEventListener('loadedmetadata', onLoaded);
      v.removeEventListener('durationchange', onLoaded);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('volumechange', onVolume);
      v.removeEventListener('progress', onProgress);
    };
  }, [showUi]);

  // 全屏状态同步:允许用户按 ESC 或系统按钮退出后 UI 也同步
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(document.fullscreenElement === shellRef.current);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {
        /* iOS 需要用户手势;失败时保持暂停态,不再上报错误 */
      });
    } else {
      v.pause();
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  };

  const changeVolume = (next: number) => {
    const v = videoRef.current;
    if (!v) return;
    const clamped = Math.max(0, Math.min(1, next));
    v.volume = clamped;
    if (clamped > 0 && v.muted) v.muted = false;
  };

  const seek = (next: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(next)) return;
    v.currentTime = Math.max(0, Math.min(duration || 0, next));
  };

  const toggleFullscreen = async () => {
    const shell = shellRef.current;
    if (!shell) return;
    if (document.fullscreenElement === shell) {
      await document.exitFullscreen().catch(() => {});
    } else {
      await shell.requestFullscreen().catch(() => {});
    }
  };

  const progress = duration > 0 ? (current / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;

  return (
    <div
      ref={shellRef}
      className={`mvp${playing ? ' mvp-playing' : ''}${uiVisible ? ' mvp-show' : ''}${isFullscreen ? ' mvp-fs' : ''}`}
      onMouseMove={showUi}
      onMouseLeave={() => {
        if (playing) setUiVisible(false);
      }}
    >
      <video
        ref={videoRef}
        className="mvp-video"
        src={src}
        playsInline
        preload="metadata"
        onClick={togglePlay}
        onError={onError}
      />

      {/* 中央大播放按钮:暂停/未播时显示 */}
      {!playing && (
        <button
          type="button"
          className="mvp-center-btn"
          onClick={togglePlay}
          aria-label="播放"
        >
          <SvgIcon name="play" size={30} />
        </button>
      )}

      <div className="mvp-controls" onClick={e => e.stopPropagation()}>
        {name && <div className="mvp-title" title={name}>{name}</div>}

        <div className="mvp-progress-row">
          <div className="mvp-progress" onClick={e => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            seek(ratio * duration);
          }}>
            <div className="mvp-progress-buffered" style={{ width: `${bufferedPercent}%` }} />
            <div className="mvp-progress-filled" style={{ width: `${progress}%` }} />
            <input
              type="range"
              className="mvp-progress-input"
              min={0}
              max={duration || 0}
              step={0.1}
              value={current}
              onChange={e => seek(Number(e.target.value))}
              aria-label="进度"
            />
          </div>
        </div>

        <div className="mvp-bar">
          <button
            type="button"
            className="mvp-btn"
            onClick={togglePlay}
            aria-label={playing ? '暂停' : '播放'}
          >
            <SvgIcon name={playing ? 'pause' : 'play'} size={18} />
          </button>

          <div className="mvp-time">
            <span>{formatDuration(current)}</span>
            <span className="mvp-time-sep">/</span>
            <span>{formatDuration(duration)}</span>
          </div>

          <div className="mvp-spacer" />

          <div className="mvp-volume">
            <button
              type="button"
              className="mvp-btn"
              onClick={toggleMute}
              aria-label={muted || volume === 0 ? '取消静音' : '静音'}
            >
              <SvgIcon name={muted || volume === 0 ? 'volume-mute' : 'volume'} size={18} />
            </button>
            <input
              type="range"
              className="mvp-volume-slider"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={e => changeVolume(Number(e.target.value))}
              aria-label="音量"
            />
          </div>

          <button
            type="button"
            className="mvp-btn"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? '退出全屏' : '全屏'}
          >
            <SvgIcon name={isFullscreen ? 'fullscreen-exit' : 'fullscreen'} size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
