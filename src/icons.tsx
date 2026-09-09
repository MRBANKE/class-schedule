import { useId } from 'react';
import type { FC, ReactNode } from 'react';
import CartoonAvatar, { AVATAR_PALETTES } from './components/CartoonAvatar';
import CartoonAvatarCurly from './components/CartoonAvatarCurly';

export interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

const wrap = (
  { size = 24, className, strokeWidth = 1.6 }: IconProps,
  children: ReactNode,
) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    {children}
  </svg>
);

const gradWrap = (
  { size = 24, className, strokeWidth = 1.4 }: IconProps,
  defs: ReactNode,
  body: ReactNode,
) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={strokeWidth}
    className={className}
    aria-hidden
  >
    <defs>{defs}</defs>
    {body}
  </svg>
);

const useUid = (prefix: string) => {
  const raw = useId().replace(/:/g, '');
  return `${prefix}-${raw}`;
};

/* ---------- 科目图标 ---------- */

const BookOpen: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h5.2A2.3 2.3 0 0 1 12 6.3V20a2 2 0 0 0-2-2H4.5A1.5 1.5 0 0 1 3 16.5v-11Z" />
      <path d="M21 5.5A1.5 1.5 0 0 0 19.5 4h-5.2A2.3 2.3 0 0 0 12 6.3V20a2 2 0 0 1 2-2h5.5a1.5 1.5 0 0 0 1.5-1.5v-11Z" />
    </>,
  );

const Calculator: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <rect x="4.5" y="3" width="15" height="18" rx="2.4" />
      <rect x="8" y="6.5" width="8" height="3.5" rx="0.8" />
      <circle cx="8.5" cy="14" r="0.9" />
      <circle cx="12" cy="14" r="0.9" />
      <circle cx="15.5" cy="14" r="0.9" />
      <circle cx="8.5" cy="17.5" r="0.9" />
      <circle cx="12" cy="17.5" r="0.9" />
      <circle cx="15.5" cy="17.5" r="0.9" />
    </>,
  );

const Globe: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 12h17" />
      <path d="M12 3c2.6 3.2 3.9 6.2 3.9 9s-1.3 5.8-3.9 9c-2.6-3.2-3.9-6.2-3.9-9S9.4 6.2 12 3Z" />
    </>,
  );

const Dumbbell: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M6.5 6v12" />
      <path d="M17.5 6v12" />
      <path d="M3.5 9v6" />
      <path d="M20.5 9v6" />
      <path d="M6.5 12h11" />
    </>,
  );

const MusicNote: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M9 17V5.5l10-2V15" />
      <circle cx="6.5" cy="17" r="2.5" />
      <circle cx="16.5" cy="15" r="2.5" />
    </>,
  );

const Palette: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.6-.3-1.2-.7-1.5-.5-.4-.8-.9-.8-1.5 0-1.1.9-2 2-2h1.5A5 5 0 0 0 21 11c0-4.4-4-8-9-8Z" />
      <circle cx="7.5" cy="12" r="1.1" />
      <circle cx="10" cy="7.5" r="1.1" />
      <circle cx="14.5" cy="7.5" r="1.1" />
      <circle cx="17.5" cy="12" r="1.1" />
    </>,
  );

const Flask: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M9 3h6" />
      <path d="M10 3v6l-4.6 8.2A2 2 0 0 0 7.1 20h9.8a2 2 0 0 0 1.7-2.8L14 9V3" />
      <path d="M7 15.5h10" />
    </>,
  );

const Scale: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M12 4v17" />
      <path d="M6 21h12" />
      <path d="M5 7h14" />
      <path d="m5 7-2.2 6.2A2.6 2.6 0 0 0 5.3 16.6a2.6 2.6 0 0 0 2.5-3.4L5 7Z" />
      <path d="m19 7-2.2 6.2A2.6 2.6 0 0 0 19.3 16.6a2.6 2.6 0 0 0 2.5-3.4L19 7Z" />
    </>,
  );

const Laptop: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <rect x="3.5" y="4.5" width="17" height="11" rx="1.8" />
      <path d="M2 19.5h20" />
      <path d="m3 19.5 1-2h16l1 2" />
    </>,
  );

const Puzzle: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M10 4h4a1.5 1.5 0 0 1 1.5 1.5v.8a1.7 1.7 0 0 0 3.4 0V6a1 1 0 0 1 1-1H21v3.5a1.5 1.5 0 0 1-1.5 1.5h-.8a1.7 1.7 0 0 0 0 3.4h.8A1.5 1.5 0 0 1 21 14.9V20h-5.1a1.5 1.5 0 0 1-1.5-1.5v-.8a1.7 1.7 0 0 0-3.4 0v.8A1.5 1.5 0 0 1 9.5 20H4.4A1.4 1.4 0 0 1 3 18.6v-4.7h.8a1.7 1.7 0 0 0 0-3.4H3V5.5A1.5 1.5 0 0 1 4.5 4H10Z" />
    </>,
  );

const BookMarked: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M4 4v16l4-3h12V4Z" />
      <path d="M14 4v6l-2-1.4L10 10V4" />
    </>,
  );

const Moon: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M20 15.5A9 9 0 1 1 8.5 4a7 7 0 0 0 11.5 11.5Z" />
    </>,
  );

const Brush: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M17 3l4 4" />
      <path d="M19 4.5 10.5 13" />
      <path d="M10.5 13 7 20l7-3.5z" />
      <path d="m5 21 1.5-1.5" />
    </>,
  );

const HeartPulse: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M12 21s-7.5-4.5-7.5-11A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 7.5 4c0 6.5-7.5 11-7.5 11Z" />
      <path d="M6 12h2.5l1.2-2 1.8 4 1.2-2H16" />
    </>,
  );

const Brain: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M12 4a3 3 0 0 0-3 3 3 3 0 0 0-3 3.2A2.5 2.5 0 0 0 5 13a2.5 2.5 0 0 0 2 3.5A3 3 0 0 0 9 20a3 3 0 0 0 3 1" />
      <path d="M12 4a3 3 0 0 1 3 3 3 3 0 0 1 3 3.2A2.5 2.5 0 0 1 19 13a2.5 2.5 0 0 1-2 3.5A3 3 0 0 1 15 20a3 3 0 0 1-3 1" />
      <path d="M12 4v17" />
    </>,
  );

const Users: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9.5" r="2.5" />
      <path d="M3 20c0-3.4 2.7-5.5 6-5.5s6 2.1 6 5.5" />
      <path d="M15 20c0-2 1.5-3.5 4-3.5" />
    </>,
  );

const Broom: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="m14.5 3.5 6 6" />
      <path d="m18 5-8 8" />
      <path d="M10 13 6 17l-2.5 3.5L7 18l4-4z" />
      <path d="M7 17.5 5 21.5" />
      <path d="M9 15v6" />
      <path d="m11.5 15.5 1.5 5.5" />
    </>,
  );

const Community: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <circle cx="12" cy="8" r="3" />
      <circle cx="6" cy="10" r="2" />
      <circle cx="18" cy="10" r="2" />
      <path d="M4 20c0-3.2 3.5-5 8-5s8 1.8 8 5" />
    </>,
  );

/* ---------- 天气图标(带渐变) ---------- */

const Sun: FC<IconProps> = p => {
  const id = useUid('sun');
  return gradWrap(
    p,
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#FFE08A" />
      <stop offset="1" stopColor="#FF9A3D" />
    </linearGradient>,
    <>
      <g stroke="#F09A2E" strokeWidth={p.strokeWidth ?? 1.4}>
        <path d="M12 2.6v2.2" />
        <path d="M12 19.2v2.2" />
        <path d="M4.4 4.4l1.6 1.6" />
        <path d="M18 18l1.6 1.6" />
        <path d="M2.6 12h2.2" />
        <path d="M19.2 12h2.2" />
        <path d="M4.4 19.6 6 18" />
        <path d="M18 6l1.6-1.6" />
      </g>
      <circle cx="12" cy="12" r="4.6" fill={`url(#${id})`} stroke="#EE9026" strokeWidth={p.strokeWidth ?? 1.4} />
    </>,
  );
};

const PartlyCloudy: FC<IconProps> = p => {
  const idSun = useUid('psun');
  const idCloud = useUid('pcloud');
  return gradWrap(
    p,
    <>
      <linearGradient id={idSun} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FFE08A" />
        <stop offset="1" stopColor="#FF9A3D" />
      </linearGradient>
      <linearGradient id={idCloud} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#F1F5FB" />
        <stop offset="1" stopColor="#C3D2E8" />
      </linearGradient>
    </>,
    <>
      <g stroke="#EE9026" strokeWidth={1.3}>
        <path d="M15.5 2.5v1.6" />
        <path d="M20 4.5l-1.2 1.2" />
        <path d="M22.2 9h-1.6" />
        <path d="M11 4.5l1.2 1.2" />
      </g>
      <circle cx="15.5" cy="8.5" r="3.3" fill={`url(#${idSun})`} stroke="#EE9026" strokeWidth={1.3} />
      <path
        d="M7 20a4 4 0 0 1 0-8h.4A5.4 5.4 0 0 1 17.8 13h.7a3.5 3.5 0 0 1 0 7H7Z"
        fill={`url(#${idCloud})`}
        stroke="#8DA4C5"
        strokeWidth={1.3}
      />
    </>,
  );
};

const CloudBase = (idCloud: string, extra?: ReactNode) => (
  <>
    <path
      d="M6.4 19a4 4 0 0 1 0-8h.4A5.4 5.4 0 0 1 17.2 12h.7a3.5 3.5 0 0 1 0 7H6.4Z"
      fill={`url(#${idCloud})`}
      stroke="#8DA4C5"
      strokeWidth={1.3}
    />
    {extra}
  </>
);

const cloudGrad = (id: string) => (
  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stopColor="#F1F5FB" />
    <stop offset="1" stopColor="#C3D2E8" />
  </linearGradient>
);

const Cloud: FC<IconProps> = p => {
  const id = useUid('cloud');
  return gradWrap(p, cloudGrad(id), CloudBase(id));
};

const Rain: FC<IconProps> = p => {
  const id = useUid('rain');
  return gradWrap(
    p,
    cloudGrad(id),
    CloudBase(
      id,
      <g stroke="#5B8CE0" strokeWidth={1.5}>
        <path d="M9 21l1-3" />
        <path d="M13 21l1-3" />
        <path d="M17 21l1-3" />
      </g>,
    ),
  );
};

const Drizzle: FC<IconProps> = p => {
  const id = useUid('drizzle');
  return gradWrap(
    p,
    cloudGrad(id),
    CloudBase(
      id,
      <g stroke="#7BA5E6" strokeWidth={1.5}>
        <path d="M10 21v-1.5" />
        <path d="M14 21.5v-2" />
        <path d="M17.5 21v-1.5" />
      </g>,
    ),
  );
};

const Thunder: FC<IconProps> = p => {
  const id = useUid('thunder');
  return gradWrap(
    p,
    cloudGrad(id),
    CloudBase(
      id,
      <path
        d="M12.2 12.5l-2.6 5h2.4l-1.5 4 4-6h-2.2l1.4-3z"
        fill="#F5C244"
        stroke="#D89A22"
        strokeWidth={1.2}
      />,
    ),
  );
};

const Snow: FC<IconProps> = p => {
  const id = useUid('snow');
  return gradWrap(
    p,
    cloudGrad(id),
    CloudBase(
      id,
      <g stroke="#7EA6D4" strokeWidth={1.4} fill="#7EA6D4">
        <circle cx="9" cy="20" r="0.7" />
        <circle cx="13" cy="21" r="0.7" />
        <circle cx="17" cy="20" r="0.7" />
        <circle cx="11" cy="22" r="0.6" />
      </g>,
    ),
  );
};

const Fog: FC<IconProps> = p =>
  wrap(
    { ...p, strokeWidth: 1.6 },
    <g stroke="#8DA4C5">
      <path d="M4 8h13" />
      <path d="M3 12h17" />
      <path d="M5 16h14" />
      <path d="M7 20h11" />
    </g>,
  );

const Rainbow: FC<IconProps> = p => {
  const id = useUid('rb');
  return gradWrap(
    p,
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#E86B6B" />
      <stop offset=".5" stopColor="#F5C244" />
      <stop offset="1" stopColor="#5B8CE0" />
    </linearGradient>,
    <>
      <path
        d="M3 19a9 9 0 0 1 18 0"
        stroke={`url(#${id})`}
        strokeWidth={2.2}
        fill="none"
      />
      <path d="M6 19a6 6 0 0 1 12 0" stroke="#F5C244" strokeWidth={1.6} fill="none" />
      <path d="M9 19a3 3 0 0 1 6 0" stroke="#5B8CE0" strokeWidth={1.6} fill="none" />
    </>,
  );
};

/* ---------- 提醒/UI 图标 ---------- */

const Umbrella: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M12 3v17" />
      <path d="M12 20a3 3 0 0 1-3-3" />
      <path d="M2.5 12a9.5 9.5 0 0 1 19 0Z" />
    </>,
  );

const Jacket: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M7 3l5 3 5-3" />
      <path d="M4.5 7.5 7 3v18h10V3l2.5 4.5" />
      <path d="M12 6v15" />
    </>,
  );

const SunShield: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <circle cx="12" cy="8.5" r="3" />
      <path d="M12 3v1.5" />
      <path d="M6.5 6.5 7.6 7.6" />
      <path d="m17.5 6.5-1.1 1.1" />
      <path d="M3.5 12h1.5" />
      <path d="M19 12h1.5" />
      <path d="M6 21c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    </>,
  );

const Wind: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M3 8h13a3 3 0 0 0 0-6" />
      <path d="M3 14h17a3 3 0 0 1 0 6" />
      <path d="M3 20h9" />
    </>,
  );

const Droplet: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M12 3.5S6 10 6 15a6 6 0 0 0 12 0c0-5-6-11.5-6-11.5Z" />
      <path d="M10 15a2 2 0 0 0 2 2" />
    </>,
  );

const Sparkles: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M11 3l1.6 4.4L17 9l-4.4 1.6L11 15l-1.6-4.4L5 9l4.4-1.6z" />
      <path d="M18 14l.9 2.4L21.4 17l-2.5.6L18 20l-.9-2.4L14.6 17l2.5-.6z" />
    </>,
  );

const School: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M3 21h18" />
      <path d="M4 21V10l8-5 8 5v11" />
      <path d="M9 21v-6h6v6" />
      <path d="M12 5V2" />
      <circle cx="12" cy="10.5" r="0.8" />
    </>,
  );

const Backpack: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M5 8a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8Z" />
      <path d="M9 4V3a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1" />
      <path d="M8 14h8" />
      <path d="M8 18h8" />
    </>,
  );

const Clock: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>,
  );

const Refresh: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 4v4h-4" />
    </>,
  );

const Sprout: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M12 21v-9" />
      <path d="M12 12c-4 0-5.5-3.5-3-6 2.5-2.5 6 1 3 6" />
      <path d="M12 12c4 0 5.5-3.5 3-6-2.5-2.5-6 1-3 6" />
      <path d="M8 21h8" />
    </>,
  );

const Calendar: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M3.5 10h17" />
    </>,
  );

const Plus: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>,
  );

const Trash: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M4 7h16" />
      <path d="M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2" />
      <path d="M6 7l1 12.5A2 2 0 0 0 9 21.5h6a2 2 0 0 0 2-1.9L18 7" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>,
  );

const Notebook: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M9 3.5v17" />
      <path d="M12 8h4" />
      <path d="M12 12h4" />
      <path d="M12 16h4" />
    </>,
  );

const Pencil: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M4 20h4l11-11-4-4L4 16v4z" />
      <path d="M14 6l4 4" />
    </>,
  );

const Ruler: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <rect x="2.5" y="8.5" width="19" height="7" rx="1.5" transform="rotate(-45 12 12)" />
      <path d="M8 8l1.5 1.5" />
      <path d="M10 6l1.5 1.5" />
      <path d="M13 8l1.5 1.5" />
      <path d="M15 6l1.5 1.5" />
    </>,
  );

const Atom: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <circle cx="12" cy="12" r="1.2" />
      <ellipse cx="12" cy="12" rx="9" ry="3.6" />
      <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)" />
    </>,
  );

const Robot: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <rect x="5" y="8" width="14" height="12" rx="2" />
      <path d="M12 4v4" />
      <circle cx="12" cy="3.5" r="1" />
      <circle cx="9.5" cy="13" r="1" />
      <circle cx="14.5" cy="13" r="1" />
      <path d="M9.5 17h5" />
      <path d="M3 13v3" />
      <path d="M21 13v3" />
    </>,
  );

const Chess: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M8 3.5h8l-1.5 4H9.5L8 3.5z" />
      <path d="M9.5 7.5l-1 6h7l-1-6" />
      <path d="M7.5 13.5h9v3h-9z" />
      <path d="M6.5 16.5h11v4h-11z" />
    </>,
  );

const Microphone: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <rect x="9.5" y="3" width="5" height="11" rx="2.5" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v4" />
      <path d="M9.5 21h5" />
    </>,
  );

const Film: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
      <path d="M8 4v16" />
      <path d="M16 4v16" />
    </>,
  );

const Star: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M12 3.5l2.7 5.5 6 .9-4.4 4.3 1 6.1L12 17.8l-5.4 2.8 1-6.1L3.3 10l6-.9L12 3.5z" />
    </>,
  );

const Heart: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10z" />
    </>,
  );

const Medal: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M7 3l3 6" />
      <path d="M17 3l-3 6" />
      <path d="M12 3v3" />
      <circle cx="12" cy="15" r="5" />
      <path d="M10 13.5L12 17l2-3.5" />
    </>,
  );

const Chart: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M4 4v16h16" />
      <rect x="7" y="12" width="2.5" height="6" />
      <rect x="11.5" y="8" width="2.5" height="10" />
      <rect x="16" y="14" width="2.5" height="4" />
    </>,
  );

const Camera: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>,
  );

const Dna: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M6 3c0 5 12 6 12 12s-12 1-12 6" />
      <path d="M18 3c0 5-12 6-12 12s12 1 12 6" />
      <path d="M8 5h8" />
      <path d="M8 19h8" />
      <path d="M9.5 9h5" />
      <path d="M9.5 15h5" />
    </>,
  );

const Rocket: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M12 3c3 1 5 4 5 9v4l-2 3h-6l-2-3v-4c0-5 2-8 5-9z" />
      <circle cx="12" cy="10" r="1.5" />
      <path d="M9 15l-3 3v3l3-1" />
      <path d="M15 15l3 3v3l-3-1" />
    </>,
  );

const Target: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.5" />
    </>,
  );

const Clipboard: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <rect x="9" y="2.5" width="6" height="3.5" rx="1" />
      <path d="M9 11h6" />
      <path d="M9 15h6" />
      <path d="M9 19h3" />
    </>,
  );

const Bulb: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M9 17c-2-1.5-3-3.5-3-6a6 6 0 0 1 12 0c0 2.5-1 4.5-3 6" />
      <path d="M9.5 17h5" />
      <path d="M10 20h4" />
      <path d="M11 22.5h2" />
    </>,
  );

const Piano: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <rect x="3" y="6" width="18" height="12" rx="1.5" />
      <path d="M9 6v8" />
      <path d="M15 6v8" />
      <path d="M6 14v4" />
      <path d="M12 14v4" />
      <path d="M18 14v4" />
    </>,
  );

const Globe2: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c3 3 3 14 0 17" />
      <path d="M12 3.5c-3 3-3 14 0 17" />
    </>,
  );

const Feather: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M20 4c-8 1-13 6-13 13" />
      <path d="M7 17l-3 3" />
      <path d="M20 4l-4 4" />
      <path d="M11 12h5" />
      <path d="M13 8h5" />
    </>,
  );

const Thermometer: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M14 14.5V4.5a2 2 0 1 0 -4 0v10a3.5 3.5 0 1 0 4 0z" />
      <path d="M12 8v6" />
      <path d="M9 6.5h1" />
      <path d="M9 9.5h1" />
      <path d="M9 12.5h1" />
    </>,
  );

const Gauge: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M4 17a8 8 0 1 1 16 0" />
      <path d="M12 17l3.5 -5" />
      <circle cx="12" cy="17" r="1.2" fill="currentColor" stroke="none" />
    </>,
  );


/* ---------- Cartoon avatars (15 = 2 hairstyles × colors) ---------- */

type AvatarBase = 'long' | 'curly';

const makeAvatar = (
  base: AvatarBase,
  paletteKey: keyof typeof AVATAR_PALETTES,
): FC<IconProps> => {
  const palette = AVATAR_PALETTES[paletteKey];
  const Comp: FC<IconProps> = ({ size, className }) => {
    const Root = base === 'curly' ? CartoonAvatarCurly : CartoonAvatar;
    return (
      <Root
        size={size}
        className={className}
        hair={palette.hair}
        shirt={palette.shirt}
        shirtMid={palette.shirtMid}
        shirtLight={palette.shirtLight}
      />
    );
  };
  return Comp;
};

const AvatarPink = makeAvatar('long', 'avatar-pink');
const AvatarBlue = makeAvatar('long', 'avatar-blue');
const AvatarPurple = makeAvatar('long', 'avatar-purple');
const AvatarYellow = makeAvatar('long', 'avatar-yellow');
const AvatarGreen = makeAvatar('long', 'avatar-green');
const AvatarOrange = makeAvatar('long', 'avatar-orange');
const AvatarSky = makeAvatar('long', 'avatar-sky');
const AvatarCoral = makeAvatar('curly', 'avatar-coral');
const AvatarMint = makeAvatar('curly', 'avatar-mint');
const AvatarLavender = makeAvatar('curly', 'avatar-lavender');
const AvatarCoralDark = makeAvatar('curly', 'avatar-coral-dark');
const AvatarNavy = makeAvatar('curly', 'avatar-navy');
const AvatarSunshine = makeAvatar('curly', 'avatar-sunshine');
const AvatarPlum = makeAvatar('curly', 'avatar-plum');
const AvatarForest = makeAvatar('curly', 'avatar-forest');

/* ---------- 附件 / 时间(1024 viewBox 填充风格) ---------- */

/** 闹钟(用于备忘提醒时间) */
const Alarm: FC<IconProps> = ({ size = 24, className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 1024 1024"
    fill="currentColor"
    className={className}
    aria-hidden
  >
    <path d="M594.814 88.586c19.22 0 34.801 15.581 34.801 34.801s-15.581 34.801-34.801 34.801l-47.529-.021.037 36.436c187.47 17.21 335.036 170.033 340.868 358.037l.179 11.562c0 205.015-168.506 371.212-376.368 371.212S135.632 769.217 135.632 564.202c0-193.283 149.772-352.064 341.094-369.604l-.011-36.431-47.529.021c-19.22 0-34.801-15.581-34.801-34.801s15.581-34.801 34.801-34.801h165.628zM512 262.592c-168.888 0-305.799 135.036-305.799 301.61S343.112 865.812 512 865.812s305.799-135.035 305.799-301.61S680.888 262.592 512 262.592zm0 139.204c19.487 0 35.285 15.797 35.285 35.284v138.714l82.814.008c19.22 0 34.801 15.581 34.801 34.801s-15.581 34.801-34.801 34.801H511.517c-19.22 0-34.801-15.581-34.801-34.801 0-2.052.177-4.063.518-6.017a35.461 35.461 0 0 1-.518-6.066V437.081c-.001-19.487 15.797-35.285 35.284-35.285z" />
  </svg>
);

/** 图片(相框内含山与太阳) */
const Picture: FC<IconProps> = ({ size = 24, className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 1024 1024"
    fill="currentColor"
    className={className}
    aria-hidden
  >
    <path d="M864.845 88.586c51.966 0 94.092 42.127 94.092 94.092v658.644c0 51.966-42.126 94.092-94.092 94.092h-705.69c-51.966 0-94.092-42.126-94.092-94.092V182.678c0-51.966 42.126-94.092 94.092-94.092h705.69zM330.92 597.153 139.912 788.222a35.635 35.635 0 0 1-4.231 3.618l-.049 49.482c0 12.991 10.532 23.523 23.523 23.523h439.457L330.92 597.153zm329.322-126.271L482.361 648.81l208.814 208.799a35.324 35.324 0 0 1 5.579 7.242l168.091-.006c12.991 0 23.523-10.532 23.523-23.523l.034-150.325a35.124 35.124 0 0 1-17.605-9.566L660.242 470.882zm204.603-311.727h-705.69c-12.991 0-23.523 10.532-23.523 23.523v509.979L306.245 522.09c13.779-13.779 36.12-13.779 49.9 0a35.173 35.173 0 0 1 7.89 12.019c4.003 1.649 7.802 4.162 11.108 7.468l57.302 57.317 203.122-203.082c13.779-13.779 36.12-13.779 49.9 0a35.17 35.17 0 0 1 7.893 12.027c4 1.641 7.799 4.154 11.105 7.46l183.903 183.877V182.678c0-12.992-10.531-23.523-23.523-23.523zM370.862 276.77c38.974 0 70.569 31.595 70.569 70.569s-31.595 70.569-70.569 70.569c-38.974 0-70.569-31.595-70.569-70.569s31.595-70.569 70.569-70.569z" />
  </svg>
);

/** 视频(胶片相框) */
const VideoFrame: FC<IconProps> = ({ size = 24, className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 1024 1024"
    fill="currentColor"
    className={className}
    aria-hidden
  >
    <path d="M864.845 88.586c51.966 0 94.092 42.127 94.092 94.092v658.644c0 51.966-42.126 94.092-94.092 94.092h-705.69c-51.966 0-94.092-42.126-94.092-94.092V182.678c0-51.966 42.126-94.092 94.092-94.092h705.69zm23.523 288.157H135.632v464.579c0 12.991 10.532 23.523 23.523 23.523h705.69c12.991 0 23.523-10.532 23.523-23.523V376.743zM446.071 500.238c4.837 0 9.591 1.372 13.807 3.985l139.695 86.581c13.556 8.402 18.364 27.322 10.739 42.259-2.529 4.953-6.244 9.046-10.739 11.833l-139.695 86.581c-13.556 8.402-30.728 3.104-38.353-11.833-2.371-4.645-3.617-9.884-3.617-15.213V531.269c0-17.138 12.609-31.031 28.163-31.031zm418.774-341.083h-94.139l-58.807 147.019h176.47V182.678c-.001-12.992-10.532-23.523-23.524-23.523zm-585.77 0h-119.92c-12.991 0-23.523 10.532-23.523 23.523v123.496h84.636l58.807-147.019zm205.826 0H349.644l-58.807 147.019h135.257l58.807-147.019zm215.236 0H555.471l-58.807 147.019 144.985.035a24.05 24.05 0 0 1 1.071-3.392l57.417-143.662z" />
  </svg>
);

/** 文档(叠放的文稿) */
const DocFile: FC<IconProps> = ({ size = 24, className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 1024 1024"
    fill="currentColor"
    className={className}
    aria-hidden
  >
    <path d="M699.746 89.57c49.488 0 90.032 38.294 93.615 86.867l.258 7.006v657.113c0 49.488-38.294 90.032-86.867 93.616l-7.006.257H183.444c-49.488 0-90.032-38.295-93.615-86.867l-.258-7.006V183.444c0-49.488 38.294-90.032 86.867-93.616l7.006-.257h516.302zm140.81 258.152c51.845 0 93.873 42.029 93.873 93.873v375.493c0 51.845-42.029 93.873-93.873 93.873h-23.468c24.071 0 43.909-18.119 46.621-41.463l.316-5.474V394.658c0-24.071-18.12-43.91-41.463-46.621l-5.474-.316h23.468zm-140.81-187.747H183.444c-11.521 0-21.103 8.302-23.09 19.25l-.378 4.218v657.113c0 11.521 8.302 21.103 19.25 23.09l4.218.378h516.303c11.521 0 21.103-8.302 23.09-19.25l.378-4.218V183.444c0-11.521-8.302-21.103-19.25-23.09l-4.219-.379zM441.595 688.012c19.442 0 35.202 15.761 35.202 35.203 0 17.821-13.243 32.55-30.425 34.881l-4.777.321H277.317c-19.442 0-35.202-15.761-35.202-35.202 0-17.821 13.243-32.55 30.425-34.881l4.777-.321h164.278zm164.278-211.214c19.442 0 35.202 15.761 35.202 35.202 0 17.822-13.243 32.55-30.425 34.881l-4.777.321H277.317c-19.442 0-35.202-15.761-35.202-35.202 0-17.822 13.243-32.55 30.425-34.881l4.777-.321h328.556zm0-211.215c19.442 0 35.202 15.761 35.202 35.202 0 17.822-13.243 32.55-30.425 34.881l-4.777.321H277.317c-19.442 0-35.202-15.761-35.202-35.202 0-17.822 13.243-32.55 30.425-34.881l4.777-.321h328.556z" />
  </svg>
);

/** 导出 / 下载:箭头向下落入托盘 */
const Download: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M12 3.5v11" />
      <path d="M7.5 10 12 14.5 16.5 10" />
      <path d="M4 16.5V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5" />
    </>,
  );

/** 导入 / 上传:箭头自托盘向上 */
const Upload: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M12 20.5v-11" />
      <path d="M7.5 14 12 9.5 16.5 14" />
      <path d="M4 7.5V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2.5" />
    </>,
  );

/** 退出登录:箭头指出门外 */
const Logout: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M14.5 3.5H17a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-2.5" />
      <path d="M9.5 8 5.5 12l4 4" />
      <path d="M5.5 12h9" />
    </>,
  );

/** 音频波形 */
const AudioWave: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M3 11v2" />
      <path d="M7 8v8" />
      <path d="M11 4.5v15" />
      <path d="M15 7v10" />
      <path d="M19 10v4" />
    </>,
  );

/** 通用文件(回形针) */
const Paperclip: FC<IconProps> = p =>
  wrap(
    p,
    <path d="M20.4 11.6l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.6-7.6" />,
  );

/** 播放三角(实心) */
const Play: FC<IconProps> = p =>
  wrap(
    { ...p, strokeWidth: p.strokeWidth ?? 1.4 },
    <path d="M8 5.5v13a0.6 0.6 0 0 0 0.92 0.51l10.4-6.5a0.6 0.6 0 0 0 0-1.02L8.92 4.99A0.6 0.6 0 0 0 8 5.5z" fill="currentColor" />,
  );

/** 暂停 */
const Pause: FC<IconProps> = p =>
  wrap(
    { ...p, strokeWidth: p.strokeWidth ?? 1.4 },
    <>
      <rect x="6.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" />
      <rect x="14" y="5" width="3.5" height="14" rx="1" fill="currentColor" />
    </>,
  );

/** 音量(有声波) */
const Volume: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M4 10v4h3.5l4.5 3.5V6.5L7.5 10H4z" fill="currentColor" stroke="none" />
      <path d="M16 8.5a5 5 0 0 1 0 7" />
      <path d="M18.6 6a8 8 0 0 1 0 12" />
    </>,
  );

/** 静音 */
const VolumeMute: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M4 10v4h3.5l4.5 3.5V6.5L7.5 10H4z" fill="currentColor" stroke="none" />
      <path d="M16 9l5 6" />
      <path d="M21 9l-5 6" />
    </>,
  );

/** 全屏(四角箭头向外) */
const Fullscreen: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M4 9V4h5" />
      <path d="M20 9V4h-5" />
      <path d="M4 15v5h5" />
      <path d="M20 15v5h-5" />
    </>,
  );

/** 退出全屏(四角箭头向内) */
const FullscreenExit: FC<IconProps> = p =>
  wrap(
    p,
    <>
      <path d="M9 4v5H4" />
      <path d="M15 4v5h5" />
      <path d="M9 20v-5H4" />
      <path d="M15 20v-5h5" />
    </>,
  );

/* ---------- Registry ---------- */

export const ICONS = {
  // subjects
  book: BookOpen,
  calc: Calculator,
  globe: Globe,
  dumbbell: Dumbbell,
  music: MusicNote,
  palette: Palette,
  flask: Flask,
  scale: Scale,
  laptop: Laptop,
  puzzle: Puzzle,
  bookmark: BookMarked,
  moon: Moon,
  brush: Brush,
  heartpulse: HeartPulse,
  brain: Brain,
  users: Users,
  broom: Broom,
  community: Community,
  // weather
  sun: Sun,
  partlycloudy: PartlyCloudy,
  cloud: Cloud,
  rain: Rain,
  drizzle: Drizzle,
  thunder: Thunder,
  snow: Snow,
  fog: Fog,
  rainbow: Rainbow,
  // tips / ui
  umbrella: Umbrella,
  jacket: Jacket,
  sunshield: SunShield,
  wind: Wind,
  droplet: Droplet,
  sparkles: Sparkles,
  school: School,
  backpack: Backpack,
  clock: Clock,
  alarm: Alarm,
  picture: Picture,
  videoframe: VideoFrame,
  docfile: DocFile,
  download: Download,
  upload: Upload,
  logout: Logout,
  audiowave: AudioWave,
  paperclip: Paperclip,
  play: Play,
  pause: Pause,
  volume: Volume,
  'volume-mute': VolumeMute,
  fullscreen: Fullscreen,
  'fullscreen-exit': FullscreenExit,
  refresh: Refresh,
  sprout: Sprout,
  calendar: Calendar,
  plus: Plus,
  trash: Trash,
  notebook: Notebook,
  // extended subjects
  pencil: Pencil,
  ruler: Ruler,
  atom: Atom,
  robot: Robot,
  chess: Chess,
  microphone: Microphone,
  film: Film,
  star: Star,
  heart: Heart,
  medal: Medal,
  chart: Chart,
  camera: Camera,
  dna: Dna,
  rocket: Rocket,
  target: Target,
  clipboard: Clipboard,
  bulb: Bulb,
  piano: Piano,
  globe2: Globe2,
  feather: Feather,
  thermometer: Thermometer,
  gauge: Gauge,
  // cartoon avatars
  'avatar-pink': AvatarPink,
  'avatar-blue': AvatarBlue,
  'avatar-purple': AvatarPurple,
  'avatar-yellow': AvatarYellow,
  'avatar-green': AvatarGreen,
  'avatar-orange': AvatarOrange,
  'avatar-sky': AvatarSky,
  'avatar-coral': AvatarCoral,
  'avatar-mint': AvatarMint,
  'avatar-lavender': AvatarLavender,
  'avatar-coral-dark': AvatarCoralDark,
  'avatar-navy': AvatarNavy,
  'avatar-sunshine': AvatarSunshine,
  'avatar-plum': AvatarPlum,
  'avatar-forest': AvatarForest,
} as const;

export type IconName = keyof typeof ICONS;

export const SvgIcon: FC<IconProps & { name: IconName | string }> = ({ name, ...rest }) => {
  const Cmp = ICONS[name as IconName];
  return Cmp ? <Cmp {...rest} /> : null;
};
