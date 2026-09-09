import { useEffect, useRef, useState } from 'react';
import { SvgIcon } from '../icons';

interface Props {
  src: string;
  name: string;
  onError?: () => void;
}

const formatDuration = (secondsRaw: number): string => {
  if (!Number.isFinite(secondsRaw) || secondsRaw < 0) return '0:00';
  const s = Math.floor(secondsRaw);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
};

export default function MemoAudioPlayer({ src, name, onError }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // 用 ref 装 onError,避免父级内联箭头频繁重建 effect
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [ready, setReady] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const audio = new Audio();
    audio.src = src;
    audio.preload = 'metadata';
    audioRef.current = audio;

    let destroyed = false;
    const onLoaded = () => {
      setReady(true);
      setDuration(audio.duration || 0);
    };
    const onTime = () => setCurrent(audio.currentTime || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    const onProgress = () => {
      if (!audio.buffered.length) return;
      setBuffered(audio.buffered.end(audio.buffered.length - 1));
    };
    const onVolume = () => {
      setVolume(audio.volume);
      setMuted(audio.muted);
    };
    const onErr = () => {
      if (destroyed) return;
      onErrorRef.current?.();
    };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('durationchange', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('progress', onProgress);
    audio.addEventListener('volumechange', onVolume);
    audio.addEventListener('error', onErr);

    return () => {
      destroyed = true;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
    };
  }, [src]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !ready) return;
    if (audio.paused) {
      audio.play().catch(() => {
        /* 用户手势限制;失败保持暂停态,不上报错误 */
      });
    } else {
      audio.pause();
    }
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
  };

  const changeVolume = (next: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const clamped = Math.max(0, Math.min(1, next));
    audio.volume = clamped;
    if (clamped > 0 && audio.muted) audio.muted = false;
  };

  const seek = (next: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(next)) return;
    audio.currentTime = Math.max(0, Math.min(duration || 0, next));
  };

  const progress = duration > 0 ? (current / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;

  return (
    <div className={`map${playing ? ' map-playing' : ''}${ready ? '' : ' map-loading'}`}>
      <button
        type="button"
        className="map-play"
        onClick={togglePlay}
        disabled={!ready}
        aria-label={playing ? '暂停' : '播放'}
      >
        <SvgIcon name={playing ? 'pause' : 'play'} size={16} />
      </button>

      <div className="map-body">
        <div className="map-name" title={name}>
          <SvgIcon name="audiowave" size={12} />
          <span>{name}</span>
        </div>
        <div className="map-progress-row">
          <div
            className="map-progress"
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / rect.width;
              seek(ratio * duration);
            }}
          >
            <div className="map-progress-buffered" style={{ width: `${bufferedPercent}%` }} />
            <div className="map-progress-filled" style={{ width: `${progress}%` }} />
            <input
              type="range"
              className="map-progress-input"
              min={0}
              max={duration || 0}
              step={0.1}
              value={current}
              onChange={e => seek(Number(e.target.value))}
              aria-label="进度"
            />
          </div>
          <div className="map-time">
            <span>{formatDuration(current)}</span>
            <span className="map-time-sep">/</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>
      </div>

      <div className="map-volume">
        <button
          type="button"
          className="map-volume-btn"
          onClick={toggleMute}
          aria-label={muted || volume === 0 ? '取消静音' : '静音'}
        >
          <SvgIcon name={muted || volume === 0 ? 'volume-mute' : 'volume'} size={14} />
        </button>
        <input
          type="range"
          className="map-volume-slider"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={e => changeVolume(Number(e.target.value))}
          aria-label="音量"
        />
      </div>
    </div>
  );
}
