// Real in-browser analysis of an uploaded video: per-second audio loudness and
// visual motion (frame differencing) → a "moment score" curve used to pick clips.

function once(el, ev, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { el.removeEventListener(ev, onE); reject(new Error(`timeout waiting for ${ev}`)); }, timeout);
    const onE = (e) => { clearTimeout(t); el.removeEventListener(ev, onE); resolve(e); };
    el.addEventListener(ev, onE, { once: true });
  });
}

async function analyzeAudio(file, duration, onProgress) {
  const buf = await file.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  let decoded;
  try {
    decoded = await ctx.decodeAudioData(buf);
  } finally {
    ctx.close && ctx.close();
  }
  const ch = decoded.numberOfChannels;
  const len = decoded.length;
  const sr = decoded.sampleRate;
  const mix = new Float32Array(len);
  for (let c = 0; c < ch; c++) {
    const d = decoded.getChannelData(c);
    for (let i = 0; i < len; i++) mix[i] += d[i] / ch;
  }
  const perSec = Math.max(1, Math.floor(duration));
  const out = new Float32Array(perSec);
  const chunk = Math.floor(sr);
  for (let s = 0; s < perSec; s++) {
    const start = s * chunk;
    let sum = 0, n = 0;
    const end = Math.min(len, start + chunk);
    for (let i = start; i < end; i += 4) { sum += mix[i] * mix[i]; n++; }
    out[s] = n ? Math.sqrt(sum / n) : 0;
    if (onProgress && s % 20 === 0) onProgress(0.1 + (s / perSec) * 0.35);
  }
  return out;
}

async function analyzeMotion(video, duration, onProgress) {
  const W = 96, H = 54;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const perSec = Math.max(1, Math.floor(duration));
  const out = new Float32Array(perSec);
  let prev = null;
  const step = Math.max(0.5, duration / 400);
  const times = [];
  for (let t = 0; t < duration; t += step) times.push(t);
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    video.currentTime = Math.min(t, Math.max(0, duration - 0.05));
    try { await once(video, 'seeked', 6000); } catch { continue; }
    try {
      ctx.drawImage(video, 0, 0, W, H);
      const d = ctx.getImageData(0, 0, W, H).data;
      if (prev) {
        let diff = 0;
        for (let p = 0; p < d.length; p += 16) diff += Math.abs(d[p] - prev[p]);
        const sec = Math.floor(t);
        if (sec < perSec) out[sec] = Math.max(out[sec], diff / (d.length / 16) / 255);
      }
      prev = d;
    } catch { /* cross-origin or decode issue */ }
    if (onProgress) onProgress(0.45 + (i / times.length) * 0.45);
  }
  return out;
}

export async function analyzeVideoFile(file, { onProgress, audioFile = null } = {}) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.src = url;
  video.playsInline = true;
  try {
    await once(video, 'loadedmetadata', 15000);
  } catch { /* fall through with default duration */ }
  let duration = Number(video.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    try { await once(video, 'durationchange', 5000); duration = Number(video.duration); } catch {}
  }
  if (!Number.isFinite(duration) || duration <= 0) duration = 600;

  onProgress && onProgress(0.05);
  let loud = null;
  try { loud = await analyzeAudio(audioFile || file, duration, onProgress); } catch { /* some codecs cannot be decoded by Web Audio */ }
  const motion = await analyzeMotion(video, duration, onProgress);

  // combine into a 0..1 moment-score curve
  const perSec = Math.max(1, Math.floor(duration));
  const norm = (arr) => {
    if (!arr) return null;
    let max = 0;
    for (let i = 0; i < perSec; i++) max = Math.max(max, arr[i] || 0);
    if (max <= 0) return null;
    const out = new Float32Array(perSec);
    for (let i = 0; i < perSec; i++) out[i] = (arr[i] || 0) / max;
    return out;
  };
  const L = norm(loud), M = norm(motion);
  const scores = new Float32Array(perSec);
  for (let i = 0; i < perSec; i++) {
    const l = L ? L[i] : 0.3;
    const m = M ? M[i] : 0.3;
    scores[i] = Math.min(1, 0.55 * l + 0.45 * m + (m > 0.55 && l > 0.4 ? 0.15 : 0));
  }

  onProgress && onProgress(0.95);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { duration: Math.round(duration), scores, loudness: loud, motion };
}

// Greedy segment picker: highest-scoring non-overlapping windows.
export function pickSegments(scores, duration, count, { minLen = 15, maxLen = 60 } = {}) {
  const perSec = scores.length;
  const maxL = Math.min(maxLen, Math.max(minLen + 1, Math.floor(duration / Math.max(1, count))));
  const segs = [];
  const taken = new Array(perSec).fill(false);
  const guard = 200;
  let g = 0;
  while (segs.length < count && g++ < guard) {
    let best = -1, bestAvg = 0;
    for (let len = maxL; len >= minLen; len -= 3) {
      for (let s = 0; s + len <= Math.min(perSec, duration); s++) {
        let ok = true;
        for (let k = s; k < s + len; k++) { if (taken[k]) { ok = false; break; } }
        if (!ok) continue;
        let sum = 0;
        for (let k = s; k < s + len; k++) sum += scores[k];
        const avg = sum / len;
        if (avg > bestAvg) { bestAvg = avg; best = s; }
      }
      if (best >= 0) break;
    }
    if (best < 0) break;
    const len = Math.min(maxL, Math.max(minLen, Math.floor(duration / Math.max(1, count))));
    const start = Math.max(0, best - 2);
    const end = Math.min(duration, start + len);
    segs.push({ start: Math.round(start), end: Math.round(end), score: Math.round(bestAvg * 100) });
    for (let k = Math.floor(start); k < Math.min(perSec, end); k++) taken[k] = true;
  }
  segs.sort((a, b) => a.start - b.start);
  return segs;
}
