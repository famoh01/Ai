// The "AI" clip generator. Produces viral-moment candidates with hooks, captions,
// hashtags and engagement scores from a video's metadata (+ optional transcript).

import { rand, randInt, choice, clamp, seeded } from './util.js';

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are', 'was', 'were', 'this', 'that', 'it', 'its', 'as', 'at', 'by', 'from', 'be', 'been', 'how', 'what', 'why', 'you', 'your', 'we', 'our', 'they', 'their', 'i', 'he', 'she', 'his', 'her', 'episode', 'video']);

export function keywordsFrom(title) {
  const words = String(title || '')
    .replace(/[\[\](){}|]/g, ' ')
    .split(/[\s,;:!?."'’\-–—/]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOP.has(w.toLowerCase()) && !/^\d+$/.test(w));
  const seen = new Set();
  const out = [];
  for (const w of words) {
    const k = w.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(w); }
    if (out.length >= 6) break;
  }
  return out.length ? out : ['this', 'moment', 'story'];
}

const HOOKS = [
  (k) => `The ${k[0]} moment nobody saw coming`,
  (k) => `Nobody talks about this ${k[0]} detail`,
  (k) => `Watch what happens when ${k[0]} meets ${k[1] || 'reality'}`,
  (k) => `${cap(k[0])} explained in 45 seconds`,
  (k) => `This ${k[0]} trick is blowing up right now`,
  (k) => `Why everyone is obsessed with ${k[0]}`,
  (k) => `${cap(k[0])}: the part everyone missed`,
  (k) => `I can't believe this ${k[0]} moment is real`,
  (k) => `The truth about ${k[0]} they don't tell you`,
  (k) => `${cap(k[0])} vs ${k[1] || 'expectations'} — instant classic`,
  (k) => `30 seconds of pure ${k[0]} gold`,
  (k) => `When ${k[0]} goes completely off the rails`,
  (k) => `This ${k[0]} clip has 10M people watching`,
  (k) => `${cap(k[0])} done perfectly — sound on`,
];

const DESCS = [
  (k) => `The most unhinged ${k[0]} moment from the full video — clip made with Ai.`,
  (k) => `If you only watch one ${k[0]} clip today, make it this one.`,
  (k) => `${cap(k[0])} at its absolute best. Full video on the channel.`,
  (k) => `This is your sign to watch the full ${k[0]} episode.`,
  (k) => `POV: you found the best ${k[0]} moment on the internet.`,
];

const CAP_TEMPLATES = [
  (k) => `okay so nobody expected this ${k[0]} moment`,
  (k) => `the ${k[0]} part starts right here`,
  (k) => `wait for it…`,
  (k) => `this is the ${k[0]} detail everyone missed`,
  (k) => `honestly? the ${k[0]} says it all`,
  (k) => `you need to hear this next part`,
  (k) => `the way ${k[0]} just changed everything`,
  (k) => `I've watched this ${k[0]} clip like ten times`,
  (k) => `and that's when ${k[0]} went viral`,
  (k) => `press play, the ${k[0]} payoff is worth it`,
  (k) => `sound on for this one`,
  (k) => `the ${k[0]} reaction is priceless`,
  (k) => `this ${k[0]} moment broke the internet`,
  (k) => `nobody believed the ${k[0]} could do this`,
];

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

export function splitTranscript(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200);
}

function captionLines(keywords, clipLen, transcriptLines) {
  const lines = [];
  let t = 0;
  const push = (text, dur) => {
    if (t >= clipLen - 0.5) return;
    const d = Math.min(dur, clipLen - t);
    lines.push({ t0: round1(t), t1: round1(t + d), text });
    t += d;
  };
  if (transcriptLines.length) {
    for (const sentence of transcriptLines) {
      if (t >= clipLen) break;
      const dur = clamp(1.2 + sentence.split(' ').length * 0.42, 1.6, 6);
      push(sentence, dur);
    }
    return lines;
  }
  while (t < clipLen - 0.4) {
    const text = choice(CAP_TEMPLATES)(keywords);
    const dur = rand(2.2, 4.6);
    push(text, dur);
  }
  return lines;
}

function round1(n) { return Math.round(n * 10) / 10; }

function pickSegments(duration, count) {
  const segs = [];
  const minLen = 15, maxLen = Math.min(60, Math.max(20, Math.floor(duration / Math.max(1, count))));
  let guard = 0;
  while (segs.length < count && guard++ < 400) {
    const len = rand(minLen, maxLen);
    const start = rand(0, Math.max(1, duration - len));
    const end = start + len;
    const overlaps = segs.some((s) => start < s.end + 2 && end > s.start + 2);
    if (overlaps) continue;
    segs.push({ start: round1(start), end: round1(end) });
  }
  segs.sort((a, b) => a.start - b.start);
  return segs;
}

export function defaultStyle() {
  return {
    font: 'Inter',
    size: 46,
    color: '#ffffff',
    bg: 'rgba(0,0,0,0.55)',
    animation: 'pop',       // pop | fade | type
    position: 'bottom',     // bottom | center | top
    highlight: '#ffe14d',
    stylePreset: 'classic',
  };
}

export const STYLE_PRESETS = [
  { id: 'classic', name: 'Classic', font: 'Inter', size: 46, color: '#ffffff', bg: 'rgba(0,0,0,0.55)', animation: 'pop', position: 'bottom', highlight: '#ffe14d' },
  { id: 'bold', name: 'Bold Pop', font: 'Inter', size: 54, color: '#ffe14d', bg: 'rgba(124,92,255,0.85)', animation: 'pop', position: 'bottom', highlight: '#ffffff' },
  { id: 'minimal', name: 'Minimal', font: 'Inter', size: 40, color: '#ffffff', bg: 'rgba(0,0,0,0)', animation: 'fade', position: 'bottom', highlight: '#00d4ff' },
  { id: 'neon', name: 'Neon', font: 'Inter', size: 50, color: '#00d4ff', bg: 'rgba(0,0,0,0.35)', animation: 'type', position: 'bottom', highlight: '#ff5ca8' },
  { id: 'sunset', name: 'Sunset', font: 'Inter', size: 48, color: '#ffb86b', bg: 'rgba(80,20,0,0.5)', animation: 'fade', position: 'bottom', highlight: '#ff5ca8' },
  { id: 'clean', name: 'Clean Top', font: 'Inter', size: 42, color: '#ffffff', bg: 'rgba(0,0,0,0.45)', animation: 'fade', position: 'top', highlight: '#7c5cff' },
];

export function generateClips(meta, options) {
  const duration = clamp(Number(options.duration) || 600, 30, 12 * 3600);
  const count = clamp(Number(options.count) || 6, 1, 12);
  const keywords = keywordsFrom(meta.title);
  const segs = pickSegments(duration, count);
  const transcriptLines = options.transcript ? splitTranscript(options.transcript) : [];

  return segs.map((seg, i) => {
    const seed = seeded(`${meta.videoId}:${seg.start}:${seg.end}`);
    const hook = choice(HOOKS)(keywords);
    const desc = choice(DESCS)(keywords);
    const tags = [
      '#shorts', '#viral', '#fyp', '#trending',
      ...keywords.slice(0, 3).map((k) => `#${k.toLowerCase().replace(/[^\w]/g, '')}`),
    ];
    const score = Math.round(58 + seed() * 41);
    const clipLen = seg.end - seg.start;
    return {
      id: `c${Date.now().toString(36)}${i}${Math.floor(seed() * 1e4)}`,
      videoId: meta.videoId,
      start: seg.start,
      end: seg.end,
      duration,
      hook,
      desc,
      hashtags: [...new Set(tags)].slice(0, 8),
      score,
      captions: captionLines(keywords, clipLen, transcriptLines),
      style: defaultStyle(),
      faceTracking: options.type !== 'sports',
      gameMode: options.type === 'game',
      music: 'none',
      musicVolume: 0.3,
      watermark: '',
      views: 0,
    };
  });
}

// Build clips from analysis segments (uploaded videos): same hook/caption pipeline,
// but the moments come from real loudness+motion scores.
export function generateClipsFromScores(segments, meta, options) {
  const duration = clamp(Number(options.duration) || 600, 30, 12 * 3600);
  const keywords = keywordsFrom(meta.title);
  const transcriptLines = options.transcript ? splitTranscript(options.transcript) : [];
  return segments.map((seg, i) => {
    const seed = seeded(`${meta.videoId}:${seg.start}:${seg.end}`);
    const hook = choice(HOOKS)(keywords);
    const desc = choice(DESCS)(keywords);
    const tags = [
      '#shorts', '#viral', '#fyp', '#trending',
      ...keywords.slice(0, 3).map((k) => `#${k.toLowerCase().replace(/[^\w]/g, '')}`),
    ];
    const clipLen = Math.max(3, seg.end - seg.start);
    return {
      id: `c${Date.now().toString(36)}${i}${Math.floor(seed() * 1e4)}`,
      videoId: meta.videoId,
      start: seg.start,
      end: seg.end,
      duration,
      hook,
      desc,
      hashtags: [...new Set(tags)].slice(0, 8),
      score: clamp(Math.round((seg.score || 60) * 0.7 + seed() * 30), 40, 99),
      captions: captionLines(keywords, clipLen, transcriptLines),
      style: defaultStyle(),
      faceTracking: options.type !== 'sports',
      gameMode: options.type === 'game',
      music: 'none',
      musicVolume: 0.3,
      watermark: '',
      views: 0,
    };
  });
}

// Rewrite hooks/descriptions using keywords mined from a REAL transcript.
export function refreshHooksFromTranscript(clips, cues) {
  if (!cues || !cues.length) return;
  const keywords = keywordsFrom(cues.map((c) => c.text).join(' '));
  clips.forEach((clip) => {
    clip.hook = choice(HOOKS)(keywords);
    clip.desc = choice(DESCS)(keywords);
  });
}

export const VIDEO_TYPES = [
  { id: 'general', label: 'General' },
  { id: 'sports', label: 'Sports Mode' },
  { id: 'game', label: 'Game Mode' },
];

export const LANGUAGES = [
  'en', 'th', 'es', 'pt', 'fr', 'de', 'id', 'ja', 'ko', 'vi', 'hi',
];

export const MUSIC_TRACKS = [
  { id: 'none', label: 'No music' },
  { id: 'lofi', label: 'Lo-fi chill' },
  { id: 'trap', label: 'Trap energy' },
  { id: 'cinematic', label: 'Cinematic rise' },
  { id: 'phonk', label: 'Phonk drive' },
  { id: 'upbeat', label: 'Upbeat pop' },
  { id: 'ambient', label: 'Ambient pads' },
  { id: 'funk', label: 'Funk groove' },
];
