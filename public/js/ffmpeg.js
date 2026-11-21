// Real clip export: ffmpeg.wasm running in the browser.
// Cuts the source video, center-crops to the target aspect, burns styled captions
// (drawtext), adds a watermark and mixes procedural music → real .mp4 file.

import { renderMusicWav } from './music.js';

let ffmpeg = null;
let loadingPromise = null;
let vendorPromise = null;

const ASPECT_DIMS = {
  '9:16': { hd: [1080, 1920], sd: [720, 1280] },
  '1:1': { hd: [1080, 1080], sd: [720, 720] },
  '16:9': { hd: [1920, 1080], sd: [1280, 720] },
};

function ensureVendorScript() {
  if (window.FFmpegWASM) return Promise.resolve();
  if (vendorPromise) return vendorPromise;
  vendorPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/ffmpeg/ffmpeg.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the video engine (vendor/ffmpeg/ffmpeg.js)'));
    document.head.appendChild(s);
  });
  return vendorPromise;
}

export async function loadFFmpeg() {
  if (ffmpeg) return ffmpeg;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    await ensureVendorScript();
    const mod = window.FFmpegWASM;
    const FFmpeg = mod.FFmpeg || mod.default?.FFmpeg;
    if (!FFmpeg) throw new Error('Video engine failed to initialise');
    const inst = new FFmpeg();
    inst.on('log', () => {});
    await inst.load({
      coreURL: '/vendor/ffmpeg/ffmpeg-core.esm.js',
      wasmURL: '/vendor/ffmpeg/ffmpeg-core.wasm',
      classWorkerURL: '/vendor/ffmpeg/814.ffmpeg.js',
    });
    ffmpeg = { inst };
    return ffmpeg;
  })();
  loadingPromise.catch(() => { loadingPromise = null; });
  return loadingPromise;
}

export async function isFFmpegReady() {
  try { await loadFFmpeg(); return true; } catch { return false; }
}

async function toU8(src) {
  if (src instanceof Uint8Array) return src;
  if (src instanceof ArrayBuffer) return new Uint8Array(src);
  if (typeof src === 'string') {
    const r = await fetch(src);
    if (!r.ok) throw new Error(`Failed to fetch ${src}`);
    return new Uint8Array(await r.arrayBuffer());
  }
  if (src instanceof Blob) return new Uint8Array(await src.arrayBuffer());
  throw new Error('Unsupported input for ffmpeg');
}

// --- text / colour helpers ------------------------------------------

function parseColor(str) {
  if (!str) return null;
  const m = String(str).match(/rgba?\(([^)]+)\)/);
  if (!m) {
    if (/^#[0-9a-f]{6}$/i.test(str)) {
      return { hex: `0x${str.slice(1).toUpperCase()}`, a: 1 };
    }
    return null;
  }
  const parts = m[1].split(',').map((s) => parseFloat(s));
  const [r, g, b] = parts;
  const a = parts.length > 3 ? parts[3] : 1;
  const hex = '0x' + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('').toUpperCase();
  return { hex, a };
}

let measureCtx = null;
function textWidth(text, px) {
  if (typeof document !== 'undefined') {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    if (measureCtx) {
      measureCtx.font = `800 ${px}px "Noto Sans Thai", Arial, sans-serif`;
      return measureCtx.measureText(text).width;
    }
  }
  // fallback estimator (used in tests / non-DOM)
  return text.length * px * 0.52;
}

function wrapCaption(text, px, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (textWidth(test, px) > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

const escNum = (n) => (Math.round(n * 100) / 100).toString();

// Build the ffmpeg plan (pure — also unit-tested in Node against real ffmpeg).
export function buildExportPlan({ clip, aspect = '9:16', quality = '1080', watermark = '', musicId = 'none', musicVolume = 0.25, fileName = 'clip.mp4', audio = true }) {
  const dims = (ASPECT_DIMS[aspect] || ASPECT_DIMS['9:16'])[quality === '720' ? 'sd' : 'hd'];
  const [W, H] = dims;
  const a = aspect.split(':').map(Number);
  const clipLen = Math.max(1, clip.end - clip.start);
  const fontPx = Math.max(18, Math.round(46 * (W / 1080)));
  const maxW = W * 0.84;
  const margin = Math.round(H * 0.1);
  const style = clip.style || {};
  const color = parseColor(style.color) || { hex: '0xFFFFFF', a: 1 };
  const bg = parseColor(style.bg);
  const hasBox = !!bg && bg.a > 0.02;

  const vfilters = [];
  // center-crop to target aspect
  vfilters.push(`crop=min(iw\\,ih*${a[0]}/${a[1]}):min(ih\\,iw*${a[1]}/${a[0]}):(iw-ow)/2:(ih-oh)/2`);
  vfilters.push(`scale=${W}:${H}:flags=lanczos`);

  const files = [{ name: 'font.ttf', url: '/vendor/fonts/NotoSansThai-Bold.ttf' }];
  const pos = style.position || 'bottom';

  clip.captions.forEach((cap, i) => {
    const lines = wrapCaption(cap.text, fontPx, maxW);
    if (!lines.length) return;
    files.push({ name: `cap_${i}.txt`, text: lines.join('\n') });
    const yExpr = pos === 'top' ? `${margin}` : pos === 'center' ? `(h-th)/2` : `h-th-${margin}`;
    const opts = [
      'fontfile=font.ttf',
      `textfile=cap_${i}.txt`,
      `fontsize=${fontPx}`,
      `fontcolor=${color.hex}`,
      `borderw=${Math.max(2, Math.round(fontPx / 14))}`,
      'bordercolor=black@0.85',
      `x=(w-text_w)/2`,
      `y=${yExpr}`,
      `line_spacing=${Math.round(fontPx * 0.18)}`,
      `enable='between(t\\,${escNum(cap.t0)}\\,${escNum(cap.t1)})'`,
    ];
    if (style.animation !== 'fade') {
      opts.push(`alpha='if(lt(t-${escNum(cap.t0)}\\,0.22)\\,(t-${escNum(cap.t0)})/0.22\\,1)'`);
    }
    if (hasBox) {
      opts.push('box=1');
      opts.push(`boxcolor=${bg.hex}@${bg.a.toFixed(2)}`);
      opts.push(`boxborderw=${Math.round(fontPx * 0.45)}`);
    }
    vfilters.push(`drawtext=${opts.join(':')}`);
  });

  if (watermark) {
    files.push({ name: 'wm.txt', text: String(watermark) });
    vfilters.push([
      'drawtext=fontfile=font.ttf',
      'textfile=wm.txt',
      `fontsize=${Math.max(16, Math.round(34 * (W / 1080)))}`,
      'fontcolor=white@0.92',
      'box=1',
      'boxcolor=black@0.35',
      `boxborderw=${Math.round(10 * (W / 1080))}`,
      'x=w-tw-24',
      'y=h-th-24',
    ].join(':'));
  }

  const filterComplex = [];
  filterComplex.push(`[0:v]${vfilters.join(',')}[v]`);

  const args = ['-y', '-ss', escNum(clip.start), '-t', escNum(clipLen), '-i', 'INPUT'];
  if (audio && musicId && musicId !== 'none') {
    args.push('-i', 'music.wav');
    filterComplex.push(
      `[0:a]volume=1.0[a0];[1:a]aloop=loop=-1:size=44100,volume=${musicVolume}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[a]`
    );
  }

  args.push('-filter_complex', filterComplex.join(';'));
  args.push('-map', '[v]');
  if (audio) {
    args.push('-map', filterComplex.length > 1 ? '[a]' : '0:a?', '-c:a', 'aac', '-b:a', '128k');
  } else {
    args.push('-an');
  }
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
  args.push('out.mp4');

  return { args, files, aspect, quality, W, H, clipLen, fileName };
}

// --- run -------------------------------------------------------------

export async function exportRealClip({ file, clip, aspect, quality, watermark, musicId, musicVolume, onProgress }) {
  const { inst } = await loadFFmpeg();
  const ext = (file.name?.split('.').pop() || 'mp4').toLowerCase();
  const inputName = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', 'mts', 'm2ts'].includes(ext) ? `in.${ext}` : 'in.mp4';

  inst.on('progress', ({ progress }) => {
    if (onProgress && Number.isFinite(progress)) onProgress(Math.max(0, Math.min(1, progress)));
  });

  const run = async (plan, withMusic) => {
    const uploads = [{ name: inputName, data: await toU8(file) }];
    for (const f of plan.files) {
      uploads.push(f.url ? { name: f.name, data: await toU8(f.url) } : { name: f.name, data: new TextEncoder().encode(f.text) });
    }
    if (withMusic) uploads.push({ name: 'music.wav', data: new Uint8Array(renderMusicWav(plan.musicId, Math.ceil(plan.clipLen) + 1)) });
    for (const u of uploads) await inst.writeFile(u.name, u.data);
    const args = plan.args.map((a) => (a === 'INPUT' ? inputName : a));
    await inst.exec(args);
    const data = await inst.readFile('out.mp4');
    for (const u of uploads) { try { await inst.deleteFile(u.name); } catch {} }
    for (const f of plan.files) { try { await inst.deleteFile(f.name); } catch {} }
    try { await inst.deleteFile('out.mp4'); } catch {}
    return new Blob([data.slice().buffer], { type: 'video/mp4' });
  };

  const plan = buildExportPlan({ clip, aspect, quality, watermark, musicId, musicVolume, audio: true });
  plan.musicId = musicId;
  try {
    return await run(plan, !!(musicId && musicId !== 'none'));
  } catch (err) {
    // Retry without audio (source may have no audio track / unsupported codec).
    const silent = buildExportPlan({ clip, aspect, quality, watermark, musicId: 'none', audio: false });
    return await run(silent, false);
  }
}
