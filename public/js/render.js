// Real file exports: cover PNG, SRT captions, text package, and a WebM "motion cover"
// preview video rendered on a canvas with MediaRecorder (works fully in the browser).

import { downloadBlob, downloadText, safeFilename, fmtClock, fmtTime } from './util.js';

const ASPECTS = {
  '9:16': { w: 1080, h: 1920 },
  '1:1': { w: 1080, h: 1080 },
  '16:9': { w: 1920, h: 1080 },
};

export function toSRT(captions) {
  return captions.map((c, i) => {
    const t0 = srtTime(c.t0), t1 = srtTime(c.t1);
    return `${i + 1}\n${t0} --> ${t1}\n${c.text}\n`;
  }).join('\n');
}

function srtTime(sec) {
  const ms = Math.round((sec % 1) * 1000);
  const s = Math.floor(sec) % 60;
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  return `${p(h)}:${p(m)}:${p(s)},${String(ms).padStart(3, '0')}`;
  function p(n) { return String(n).padStart(2, '0'); }
}

export function toTXT(clip, meta) {
  return [
    `HOOK: ${clip.hook}`,
    ``,
    `DESCRIPTION:`,
    clip.desc,
    ``,
    `HASHTAGS: ${clip.hashtags.join(' ')}`,
    ``,
    `SOURCE: ${meta.title}`,
    meta.channel ? `CHANNEL: ${meta.channel}` : '',
    `LINK: ${meta.url}`,
    `CLIP: ${fmtClock(clip.start)} - ${fmtClock(clip.end)} (${fmtTime(clip.end - clip.start)})`,
    clip.music && clip.music !== 'none' ? `MUSIC: ${clip.music}` : '',
    ``,
    `CAPTIONS:`,
    clip.captions.map((c) => `[${fmtClock(c.t0)} -> ${fmtClock(c.t1)}] ${c.text}`).join('\n'),
    ``,
    `— made with Ai`,
  ].filter((l) => l !== null).join('\n');
}

export function exportSRT(clip, meta) {
  downloadText(toSRT(clip.captions), `${safeFilename(clip.hook)}.srt`);
}

export function exportTXT(clip, meta) {
  downloadText(toTXT(clip, meta), `${safeFilename(clip.hook)}.txt`);
}

// --- canvas drawing -----------------------------------------------------

function loadImage(src, timeoutMs = 9000) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => { img.onload = img.onerror = null; resolve(null); }, timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = src;
  });
}

function coverDraw(ctx, img, W, H, zoom = 1, panX = 0, panY = 0) {
  if (!img) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#1b1b2e'); g.addColorStop(1, '#0d0d16');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    return;
  }
  const scale = Math.max(W / img.width, H / img.height) * zoom;
  const dw = img.width * scale, dh = img.height * scale;
  const dx = (W - dw) / 2 + panX * W * 0.02;
  const dy = (H - dh) / 2 + panY * H * 0.02;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawCaptions(ctx, captions, clipTime, style, W, H, aspect) {
  const line = captions.find((c) => clipTime >= c.t0 && clipTime < c.t1);
  if (!line) return;
  const size = Math.round((style.size / 1080) * W);
  ctx.font = `800 ${size}px Inter, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const maxWidth = W * 0.86;
  const words = line.text.split(' ');
  const lines = wrapText(ctx, words, maxWidth);
  const lineH = size * 1.28;
  const blockH = lines.length * lineH;

  let y;
  const pos = style.position || 'bottom';
  if (pos === 'top') y = H * 0.12;
  else if (pos === 'center') y = H / 2 - blockH / 2;
  else y = H * 0.86 - blockH / 2;

  const enter = line.t1 - line.t0;
  const elapsed = clipTime - line.t0;
  const t = Math.min(1, elapsed / Math.min(0.3, enter));
  const ease = 1 - Math.pow(1 - t, 3);

  ctx.globalAlpha = ease;
  lines.forEach((text, i) => {
    const ly = y + i * lineH;
    const metrics = ctx.measureText(text);
    const padX = size * 0.45, padY = size * 0.28;
    const bw = metrics.width + padX * 2, bh = lineH * 0.92;
    if (style.bg && style.bg !== 'rgba(0,0,0,0)') {
      ctx.fillStyle = style.bg;
      roundRect(ctx, W / 2 - bw / 2, ly - bh / 2, bw, bh, bh / 2.4);
      ctx.fill();
    }
    ctx.fillStyle = style.color || '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = size * 0.18;
    ctx.shadowOffsetY = 2;
    ctx.fillText(text, W / 2, ly);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  });
  ctx.globalAlpha = 1;
}

function wrapText(ctx, words, maxWidth) {
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// --- exports ------------------------------------------------------------

export async function renderCover(clip, meta, quality = '1080') {
  const aspect = clip.aspect || '9:16';
  const base = ASPECTS[aspect] || ASPECTS['9:16'];
  const scale = quality === '720' ? 0.66 : 1;
  const W = Math.round(base.w * scale), H = Math.round(base.h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = await loadImage(meta.thumbnail);
  coverDraw(ctx, img, W, H, 1.04);

  const g = ctx.createLinearGradient(0, H * 0.25, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.82)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  const pad = W * 0.07;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${Math.round(W * 0.085)}px Inter, Arial, sans-serif`;
  const title = clip.hook || meta.title || 'Clip';
  const lines = wrapText(ctx, title.split(' '), W - pad * 2).slice(0, 3);
  let y = H - pad - (lines.length - 1) * W * 0.105;
  lines.forEach((l) => { ctx.fillText(l, pad, y); y += W * 0.105; });

  if (meta.channel) {
    ctx.font = `700 ${Math.round(W * 0.032)}px Inter, Arial, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(meta.channel, pad, H - pad - lines.length * W * 0.105 - W * 0.03);
  }

  // badge
  const badge = `★ ${clip.score || 0} virality`;
  ctx.font = `800 ${Math.round(W * 0.03)}px Inter, Arial, sans-serif`;
  const bw = ctx.measureText(badge).width + W * 0.05;
  ctx.fillStyle = 'rgba(124,92,255,0.9)';
  roundRect(ctx, pad, pad, bw, W * 0.055, W * 0.027); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(badge, pad + W * 0.025, pad + W * 0.038);

  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  downloadBlob(blob, `${safeFilename(clip.hook)}_cover.png`);
}

// Render a WebM preview: motion cover (Ken Burns) + styled captions + watermark + progress.
export async function renderPreviewVideo(clip, meta, { quality = '1080', aspect = '9:16', watermark = '' } = {}, onProgress = () => {}) {
  const base = ASPECTS[aspect] || ASPECTS['9:16'];
  const scale = quality === '720' ? 0.66 : 1;
  const W = Math.round(base.w * scale), H = Math.round(base.h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = await loadImage(meta.thumbnail);

  const duration = Math.max(1, clip.end - clip.start);
  const stream = canvas.captureStream(30);
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('MediaRecorder is not supported in this browser');
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((res) => { rec.onstop = res; });

  rec.start(200);
  const t0 = performance.now();
  await new Promise((resolve) => {
    const frame = (now) => {
      const t = (now - t0) / 1000;
      const p = Math.min(1, t / duration);
      const zoom = 1.06 + 0.1 * p;
      const panX = Math.sin(p * Math.PI) * 0.5;
      const panY = Math.cos(p * Math.PI * 0.7) * 0.4;
      coverDraw(ctx, img, W, H, zoom, panX, panY);

      const shade = ctx.createLinearGradient(0, H * 0.3, 0, H);
      shade.addColorStop(0, 'rgba(0,0,0,0)');
      shade.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);

      drawCaptions(ctx, clip.captions, p * duration, clip.style, W, H, aspect);

      // watermark
      if (watermark) {
        ctx.font = `800 ${Math.round(W * 0.028)}px Inter, Arial, sans-serif`;
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(watermark, W - W * 0.04, H - H * 0.03);
      }
      // progress
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(0, H - 6, W, 6);
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, '#7c5cff'); grad.addColorStop(1, '#00d4ff');
      ctx.fillStyle = grad;
      ctx.fillRect(0, H - 6, W * p, 6);

      onProgress(p);
      if (t < duration) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
  rec.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  const blob = new Blob(chunks, { type: 'video/webm' });
  downloadBlob(blob, `${safeFilename(clip.hook)}_preview.webm`);
  return blob;
}
