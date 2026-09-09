import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  exportSquareAvatar,
  loadImage,
  readFileAsDataURL,
} from './sections/BasicSection';

interface Props {
  file: File;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
}

const VIEW_SIZE = 320;
const MIN_SCALE = 1;
const MAX_SCALE = 4;

interface Offset {
  x: number;
  y: number;
}

export default function AvatarCropModal({ file, onCancel, onConfirm }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    pointerId: number;
  }>({ active: false, startX: 0, startY: 0, baseX: 0, baseY: 0, pointerId: -1 });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const src = await readFileAsDataURL(file);
        const image = await loadImage(src);
        if (!alive) return;
        setImg(image);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : '图片加载失败');
      }
    })();
    return () => {
      alive = false;
    };
  }, [file]);

  // baseScale: 让图片最短边刚好等于裁剪框(cover 语义,保证裁剪框内不留白)
  const baseScale = useMemo(() => {
    if (!img) return 1;
    return VIEW_SIZE / Math.min(img.naturalWidth, img.naturalHeight);
  }, [img]);

  const displaySize = useMemo(() => {
    if (!img) return { w: VIEW_SIZE, h: VIEW_SIZE };
    return {
      w: img.naturalWidth * baseScale * scale,
      h: img.naturalHeight * baseScale * scale,
    };
  }, [img, baseScale, scale]);

  // 约束偏移,保证图片始终覆盖裁剪框
  const clampOffset = (
    next: Offset,
    dw: number = displaySize.w,
    dh: number = displaySize.h,
  ): Offset => {
    const maxX = Math.max(0, (dw - VIEW_SIZE) / 2);
    const maxY = Math.max(0, (dh - VIEW_SIZE) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  };

  // 缩放变化时同步矫正偏移,避免出现白边
  useEffect(() => {
    setOffset(prev => clampOffset(prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, img]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!img) return;
    e.preventDefault();
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      baseX: offset.x,
      baseY: offset.y,
      pointerId: e.pointerId,
    };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.active || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    setOffset(clampOffset({ x: d.baseX + dx, y: d.baseY + dy }));
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (d.pointerId === e.pointerId) {
      d.active = false;
      d.pointerId = -1;
      try {
        (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!img) return;
    e.preventDefault();
    const delta = -e.deltaY / 400;
    setScale(prev => Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta)));
  };

  const handleConfirm = async () => {
    if (!img || exporting) return;
    setExporting(true);
    try {
      const totalScale = baseScale * scale;
      // 裁剪框在显示画布(300×300)左上角是 (0,0),显示画布中心是 VIEW_SIZE/2
      // 图片在显示画布中的左上坐标: (VIEW_SIZE/2 - dispW/2 + offset.x, ...)
      // 裁剪框相对图片显示坐标的左上: (-imgTopLeft.x, -imgTopLeft.y)
      const cropX_disp =
        displaySize.w / 2 - VIEW_SIZE / 2 - offset.x;
      const cropY_disp =
        displaySize.h / 2 - VIEW_SIZE / 2 - offset.y;
      const sx = cropX_disp / totalScale;
      const sy = cropY_disp / totalScale;
      const side = VIEW_SIZE / totalScale;
      // 修正浮点误差,防止越界
      const cx = Math.max(0, Math.min(img.naturalWidth - side, sx));
      const cy = Math.max(0, Math.min(img.naturalHeight - side, sy));
      const dataUrl = exportSquareAvatar(img, cx, cy, side);
      onConfirm(dataUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败');
      setExporting(false);
    }
  };

  const node = (
    <div
      className="admin-modal-backdrop admin-crop-backdrop"
      onClick={onCancel}
    >
      <div
        className="admin-modal-panel admin-crop-panel"
        role="dialog"
        onClick={e => e.stopPropagation()}
      >
        <header className="admin-modal-header">
          <h3>裁剪头像</h3>
          <button
            type="button"
            className="admin-modal-close"
            onClick={onCancel}
            aria-label="关闭"
          >
            ×
          </button>
        </header>
        <div className="admin-modal-body admin-crop-body">
          {error ? (
            <div className="admin-crop-error">{error}</div>
          ) : !img ? (
            <div className="admin-crop-loading">图片加载中…</div>
          ) : (
            <>
              <div
                ref={viewportRef}
                className="admin-crop-viewport"
                style={{ width: VIEW_SIZE, height: VIEW_SIZE }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
                onWheel={handleWheel}
              >
                <img
                  src={img.src}
                  alt=""
                  draggable={false}
                  className="admin-crop-image"
                  style={{
                    width: displaySize.w,
                    height: displaySize.h,
                    transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
                  }}
                />
                <div className="admin-crop-mask" aria-hidden />
                <div className="admin-crop-grid" aria-hidden />
              </div>
              <div className="admin-crop-controls">
                <span className="admin-crop-controls-label">缩放</span>
                <input
                  type="range"
                  min={MIN_SCALE}
                  max={MAX_SCALE}
                  step={0.01}
                  value={scale}
                  onChange={e => setScale(Number(e.target.value))}
                  className="admin-crop-slider"
                />
                <button
                  type="button"
                  className="admin-crop-reset"
                  onClick={() => {
                    setScale(1);
                    setOffset({ x: 0, y: 0 });
                  }}
                >
                  重置
                </button>
              </div>
              <p className="admin-crop-hint">
                拖动图片调整位置,滚轮或滑块缩放,裁剪框内即为最终 1:1 头像
              </p>
            </>
          )}
        </div>
        <footer className="admin-modal-footer admin-crop-footer">
          <button
            type="button"
            className="admin-btn"
            onClick={onCancel}
            disabled={exporting}
          >
            取消
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-grape"
            onClick={handleConfirm}
            disabled={!img || !!error || exporting}
          >
            {exporting ? '处理中…' : '确认使用'}
          </button>
        </footer>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
