/**
 * 静态文件与文件流响应。
 *
 * 自己实现而不是塞一个 express/nginx:整个服务只需要"发文件 + 支持 Range",
 * 保持零依赖后运行镜像里连 node_modules 都不需要。
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

export const mimeFor = (file) =>
  MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';

/**
 * 文本类资源才值得压缩:JS/CSS/HTML/JSON 能压到 1/4~1/6;而图片/视频/字体/woff2
 * 本身已是压缩格式,再压几乎不缩小还白费 CPU。gzip 与 brotli 都是 Node 内置,
 * 保持"运行镜像零依赖"。
 */
const COMPRESSIBLE = new Set([
  'text/html', 'text/css', 'text/javascript', 'application/javascript',
  'application/json', 'application/manifest+json', 'image/svg+xml',
  'text/plain', 'application/xml', 'text/xml',
]);
const isCompressible = (contentType) =>
  COMPRESSIBLE.has(String(contentType || '').split(';')[0].trim().toLowerCase());

/** 优先 brotli(压得更小),否则 gzip;客户端都不支持就返回 null 走原样发送 */
const pickEncoding = (accept) => {
  const a = String(accept || '').toLowerCase();
  if (/(^|[,\s])br($|[,\s;])/.test(a)) return 'br';
  if (/(^|[,\s])gzip($|[,\s;])/.test(a)) return 'gzip';
  return null;
};

// 实时压缩,质量取中档:家用低功耗机器上兼顾 CPU 与压缩率
const BROTLI_OPTS = { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } };

/** 解析单段 Range: "bytes=100-" / "bytes=100-200" / "bytes=-500" */
const parseRange = (header, size) => {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  if (rawStart === '' && rawEnd === '') return null;
  let start;
  let end;
  if (rawStart === '') {
    // 末尾 N 字节
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return { invalid: true };
  return { start, end: Math.min(end, size - 1) };
};

/**
 * 发送一个文件,支持条件请求与 Range。
 * Range 对备忘里的视频/音频是必需的:没有 206 支持,浏览器只能整段下载完才能播,
 * 也无法拖动进度条。
 */
export const sendFile = async (req, res, file, opts = {}) => {
  let stat;
  try {
    stat = await fsp.stat(file);
    if (!stat.isFile()) return false;
  } catch {
    return false;
  }

  const etag = `W/"${stat.size.toString(16)}-${Math.round(stat.mtimeMs).toString(16)}"`;
  const headers = {
    'Content-Type': opts.contentType || mimeFor(file),
    'Cache-Control': opts.cacheControl || 'no-cache',
    'Last-Modified': stat.mtime.toUTCString(),
    ETag: etag,
    'Accept-Ranges': 'bytes',
    // 禁止浏览器"猜"内容类型:配合附件 mime 白名单,防止把降级成 octet-stream
    // 的附件又当成 html/svg 嗅探执行
    'X-Content-Type-Options': 'nosniff',
  };
  if (opts.download) {
    // filename* 用 UTF-8 编码,中文附件名才不会变成乱码
    headers['Content-Disposition'] =
      `attachment; filename*=UTF-8''${encodeURIComponent(opts.download)}`;
  }

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    res.end();
    return true;
  }

  const range = parseRange(req.headers.range, stat.size);
  if (range?.invalid) {
    res.writeHead(416, { ...headers, 'Content-Range': `bytes */${stat.size}` });
    res.end();
    return true;
  }

  if (range) {
    const length = range.end - range.start + 1;
    res.writeHead(206, {
      ...headers,
      'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}`,
      'Content-Length': length,
    });
    if (req.method === 'HEAD') {
      res.end();
      return true;
    }
    fs.createReadStream(file, { start: range.start, end: range.end }).pipe(res);
    return true;
  }

  // 完整 200 响应且是文本类型时按 Accept-Encoding 压缩。Range/206 与 304 已在上面返回,
  // 不会走到这里;HEAD 不压(要保留准确的 Content-Length),交给下面原样分支。
  const encoding =
    req.method === 'GET' && stat.size >= 1024 && isCompressible(headers['Content-Type'])
      ? pickEncoding(req.headers['accept-encoding'])
      : null;

  if (encoding) {
    res.writeHead(200, {
      ...headers,
      'Content-Encoding': encoding,
      // 同一 URL 会因 Accept-Encoding 产出不同字节,必须让缓存/代理按此维度区分
      Vary: 'Accept-Encoding',
      // 压缩后长度未知,交给 chunked 传输,不能再声明原始 Content-Length
    });
    const compressor =
      encoding === 'br' ? zlib.createBrotliCompress(BROTLI_OPTS) : zlib.createGzip();
    fs.createReadStream(file).pipe(compressor).pipe(res);
    return true;
  }

  res.writeHead(200, { ...headers, 'Content-Length': stat.size });
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  fs.createReadStream(file).pipe(res);
  return true;
};

/**
 * 托管构建产物。带 hash 的 /assets/* 可以永久缓存,
 * 而 index.html / sw.js / manifest 必须每次校验,否则发新版后用户永远停在旧壳子上。
 */
export const createStaticHandler = (root, opts = {}) => {
  const rootDir = path.resolve(root);
  const transformIndex =
    typeof opts.transformIndexHtml === 'function' ? opts.transformIndexHtml : null;

  /**
   * index.html 需要按请求 URL 改写(注入 manifest 链接与页面标题),内容因此随 URL 变化,
   * 不能再走 sendFile 的 ETag/条件请求那套(那是按文件 size+mtime 算的,所有 URL 都一样,
   * 会让浏览器拿 304 复用上一个地址的 HTML)。这里单独发,带 no-store。
   * HTML 只有几 KB,同步压缩的开销可以忽略。
   */
  const sendIndexHtml = async (req, res, urlPath, search) => {
    const file = path.join(rootDir, 'index.html');
    let raw;
    try {
      raw = await fsp.readFile(file, 'utf8');
    } catch {
      return false;
    }
    // 改写可能要读配置(按 ?id= 解析学生标题),允许返回 Promise。
    // 传入 req:注入 og:url / og:image 时要按请求头拼出对外绝对地址(微信抓卡片要求绝对 URL)
    const html = await transformIndex(raw, { urlPath, search, req });
    const body = Buffer.from(html, 'utf8');
    const headers = {
      'Content-Type': 'text/html; charset=utf-8',
      // 每个地址的 HTML 都不同(manifest 链接不同),任何一层缓存复用都会串味
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    const encoding = req.method === 'GET' ? pickEncoding(req.headers['accept-encoding']) : null;
    if (!encoding) {
      res.writeHead(200, { ...headers, 'Content-Length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
      return true;
    }
    const packed =
      encoding === 'br' ? zlib.brotliCompressSync(body, BROTLI_OPTS) : zlib.gzipSync(body);
    res.writeHead(200, {
      ...headers,
      'Content-Encoding': encoding,
      Vary: 'Accept-Encoding',
      'Content-Length': packed.length,
    });
    res.end(packed);
    return true;
  };

  const resolveSafe = (urlPath) => {
    const decoded = decodeURIComponent(urlPath);
    const target = path.join(rootDir, path.normalize(decoded));
    // 归一化后必须仍在 root 内,拦住 ../ 穿越
    if (target !== rootDir && !target.startsWith(rootDir + path.sep)) return null;
    return target;
  };

  return async (req, res, url) => {
    const urlPath = url.pathname;
    const search = url.search || '';
    const isIndex = urlPath === '/' || urlPath === '/index.html';

    if (isIndex && transformIndex) {
      const ok = await sendIndexHtml(req, res, urlPath, search);
      if (ok) return true;
    }

    const file = resolveSafe(isIndex ? '/index.html' : urlPath);
    if (!file) {
      res.writeHead(403).end('Forbidden');
      return true;
    }
    const immutable = urlPath.startsWith('/assets/');
    const ok = await sendFile(req, res, file, {
      cacheControl: immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (ok) return true;

    // 看起来是静态文件(带扩展名)却没找到,就老老实实 404 —— 不能回落成 index.html。
    // 否则浏览器请求一个失效的 /assets/xxx.js 会拿到 200 + text/html,报的是
    // "MIME 类型不匹配"这种离题错误;<img src> 也会静默拿到一坨 HTML 无从排查。
    // SPA 路由(/board、/superadmin/basic)都不带扩展名,不受影响。
    if (path.extname(urlPath)) return false;

    // SPA 回落:path 路由(/board、/superadmin)在磁盘上没有对应文件,必须拿到
    // index.html 而不是 404。回落也要走改写,否则深链页的 manifest 又丢参数
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (transformIndex) return sendIndexHtml(req, res, urlPath, search);
      return sendFile(req, res, path.join(rootDir, 'index.html'), {
        cacheControl: 'no-cache',
      });
    }
    return false;
  };
};
