import type { SubjectItem } from '../config/types';
import { SvgIcon } from '../icons';

interface Props {
  subject: Pick<SubjectItem, 'icon' | 'iconImage' | 'hideIcon'>;
  size: number;
  imgRadius?: number;
}

/** 统一渲染课程图标:优先 hideIcon(不渲染) → iconImage(自定义图片) → icon(内置 SVG) */
export default function SubjectIcon({ subject, size, imgRadius = 6 }: Props) {
  if (subject.hideIcon) return null;
  if (subject.iconImage) {
    return (
      <img
        src={subject.iconImage}
        alt=""
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          objectFit: 'cover',
          display: 'block',
          borderRadius: imgRadius,
        }}
      />
    );
  }
  return <SvgIcon name={subject.icon} size={size} />;
}
