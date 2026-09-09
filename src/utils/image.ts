/**
 * 图片压缩工具:读取文件 → 缩放 → 输出 JPEG dataURL
 * 尝试逐档降级尺寸/质量,直到落到 targetMaxBytes 以内
 */

const readFileAsDataURL = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('读取失败'));
    reader.onerror = () => reject(reader.error ?? new Error('读取失败'));
    reader.readAsDataURL(file);
  });

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解析失败'));
    img.src = src;
  });

/**
 * 让出主线程一帧,给浏览器机会绘制。canvas.toDataURL 是同步阻塞的,
 * 多档尺寸/质量连续跑会卡住 UI(尤其手机连传多张大图),在每档之间让出一次,
 * 上传中的转圈动画就能正常转、页面也不会卡死。
 */
const yieldToMain = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });

export const dataUrlBytes = (dataUrl: string): number => {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) return dataUrl.length;
  const b64 = dataUrl.slice(commaIdx + 1);
  return Math.floor((b64.length * 3) / 4);
};

export interface CompressOptions {
  /** 最长边最大 px,超过则缩放。默认 1200 */
  maxSize?: number;
  /** 目标输出字节数,默认 240KB */
  targetMaxBytes?: number;
  /** 是否 1:1 中心裁剪。默认 false(保持原比例) */
  square?: boolean;
  /** 尝试尺寸阶梯(降级用),覆盖 maxSize */
  sizes?: number[];
  /** 质量阶梯 */
  qualities?: number[];
}

/** canvas → Blob;老浏览器没有 toBlob 时用 toDataURL 兜底 */
const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> =>
  new Promise((resolve) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob((b) => resolve(b), type, quality);
      return;
    }
    try {
      const dataUrl = canvas.toDataURL(type, quality);
      const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      resolve(new Blob([bytes], { type }));
    } catch {
      resolve(null);
    }
  });

const toJpegFile = (orig: File, blob: Blob): File => {
  const base = orig.name.replace(/\.[^./\\]+$/, '') || 'image';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
};

export interface CompressAttachmentOptions {
  /** 最长边上限 px,超过则等比缩放。默认 2048(放大查看仍清晰) */
  maxSize?: number;
  /** 目标体积上限,默认 1.5MB */
  targetMaxBytes?: number;
  /** JPEG 质量阶梯 */
  qualities?: number[];
  /** 体积不超过它、且尺寸也没超标的图原样保留,避免二次编码反而变糊。默认 900KB */
  keepAsIsBytes?: number;
}

/**
 * 备忘「图片附件」的保清晰度压缩:把手机相机原图这类大图缩到可接受的体积,
 * 同时尽量不损失观感。返回可直接落盘的 File。
 *
 * 原样返回(不压缩)的情况:
 *  - GIF 动图 / SVG 矢量 / 非位图 —— 走 canvas 会毁掉动画或矢量;
 *  - 图片本就不大且尺寸也没超标 —— 再压一遍只会掉清晰度、省不了多少;
 *  - 解析失败,或压缩结果反而比原图还大。
 * 压缩过的输出统一为 image/jpeg,文件名后缀换成 .jpg(元数据/下载才对得上)。
 */
export async function compressImageAttachment(
  file: File,
  options: CompressAttachmentOptions = {},
): Promise<File> {
  const {
    maxSize = 2048,
    targetMaxBytes = 1.5 * 1024 * 1024,
    qualities = [0.86, 0.8, 0.72, 0.64],
    keepAsIsBytes = 900 * 1024,
  } = options;

  const type = file.type;
  if (
    type === 'image/gif' ||
    type === 'image/svg+xml' ||
    !type.startsWith('image/')
  ) {
    return file;
  }

  let img: HTMLImageElement;
  try {
    const src = await readFileAsDataURL(file);
    img = await loadImage(src);
  } catch {
    return file; // 解析不了就别动它,交回原文件按原逻辑落盘
  }

  const naturalW = img.naturalWidth;
  const naturalH = img.naturalHeight;
  const longest = Math.max(naturalW, naturalH);

  // 体积小、尺寸也没超标 → 保留原图,别二次压缩
  if (file.size <= keepAsIsBytes && longest <= maxSize) return file;

  const sizeSteps = [
    maxSize,
    Math.round(maxSize * 0.8),
    Math.round(maxSize * 0.65),
  ].filter((s, i, arr) => arr.indexOf(s) === i);

  let smallest: Blob | null = null;
  for (const target of sizeSteps) {
    await yieldToMain();
    const scale = Math.min(1, target / longest);
    const dw = Math.max(1, Math.round(naturalW * scale));
    const dh = Math.max(1, Math.round(naturalH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext('2d');
    if (!ctx) break;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, dw, dh);
    for (const q of qualities) {
      const blob = await canvasToBlob(canvas, 'image/jpeg', q);
      if (!blob) continue;
      if (!smallest || blob.size < smallest.size) smallest = blob;
      if (blob.size <= targetMaxBytes) return toJpegFile(file, blob);
    }
  }

  // 压不到目标就取最小的一档;若连它都比原图还大,说明原图已高度压缩,用原图
  if (smallest && smallest.size < file.size) return toJpegFile(file, smallest);
  return file;
}

export async function compressImage(
  file: File,
  options: CompressOptions = {},
): Promise<string> {
  const {
    maxSize = 1200,
    targetMaxBytes = 240 * 1024,
    square = false,
    sizes,
    qualities = [0.82, 0.7, 0.58, 0.46],
  } = options;

  const src = await readFileAsDataURL(file);
  const img = await loadImage(src);

  const naturalW = img.naturalWidth;
  const naturalH = img.naturalHeight;
  const naturalSide = Math.min(naturalW, naturalH);

  const sizeSteps =
    sizes ??
    (square
      ? [maxSize, Math.round(maxSize * 0.75), Math.round(maxSize * 0.55), Math.round(maxSize * 0.4)]
      : [maxSize, Math.round(maxSize * 0.8), Math.round(maxSize * 0.65), Math.round(maxSize * 0.5)]);

  let fallback: string | null = null;

  for (const target of sizeSteps) {
    // 每档尺寸开跑前让出一帧:第一档命中(绝大多数情况)前也先给页面一次绘制机会,
    // 连传多张时每张之间自然有喘息,转圈动画不再被 toDataURL 一口气卡死
    await yieldToMain();
    const canvas = document.createElement('canvas');
    let sw = naturalW;
    let sh = naturalH;
    let sx = 0;
    let sy = 0;
    let dw: number;
    let dh: number;
    if (square) {
      sw = naturalSide;
      sh = naturalSide;
      sx = (naturalW - naturalSide) / 2;
      sy = (naturalH - naturalSide) / 2;
      dw = target;
      dh = target;
    } else {
      const scale = Math.min(1, target / Math.max(naturalW, naturalH));
      dw = Math.max(1, Math.round(naturalW * scale));
      dh = Math.max(1, Math.round(naturalH * scale));
    }
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 不可用');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
    for (const q of qualities) {
      const out = canvas.toDataURL('image/jpeg', q);
      const bytes = dataUrlBytes(out);
      if (bytes <= targetMaxBytes) return out;
      if (!fallback || bytes < dataUrlBytes(fallback)) fallback = out;
    }
  }
  return fallback ?? src;
}
