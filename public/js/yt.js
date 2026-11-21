// YouTube helpers: URL parsing, metadata lookup, channel resolution and the IFrame player.
// All network calls run in the *user's browser* (the sandbox itself has no YouTube access).

import { clamp } from './util.js';

const VIDEO_RE = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{6,15})/i;

export function parseYouTube(input) {
  const url = String(input || '').trim();
  if (!url) return { kind: 'unknown' };
  let u;
  try { u = new URL(url.includes('://') ? url : `https://${url}`); } catch { return { kind: 'unknown' }; }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
  const path = u.pathname;

  if (host.includes('youtube.com') || host === 'youtu.be') {
    const v = url.match(VIDEO_RE);
    if (v) return { kind: 'video', id: v[1] };
    let m = path.match(/^\/(@[\w.-]+)/);
    if (m) return { kind: 'channel', handle: m[1], id: null };
    m = path.match(/^\/channel\/(UC[\w-]{6,})/);
    if (m) return { kind: 'channel', handle: null, id: m[1] };
    m = path.match(/^\/(c|user)\/([\w.-]+)/);
    if (m) return { kind: 'channel', handle: m[2], id: null, legacy: true };
    if (u.searchParams.get('list')) return { kind: 'playlist', id: u.searchParams.get('list') };
    return { kind: 'unknown' };
  }
  if (host.includes('vimeo.com')) return { kind: 'vimeo', id: path.split('/').filter(Boolean)[0] || null };
  return { kind: 'other' };
}

export function thumbUrl(videoId, quality = 'hqdefault') {
  return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
}

export function watchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

// --- metadata -----------------------------------------------------------

export async function fetchVideoMeta(videoId) {
  const watch = watchUrl(videoId);
  // 1) noembed (CORS-friendly)
  try {
    const r = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(watch)}`);
    const j = await r.json();
    if (j && j.title) {
      return {
        videoId,
        title: j.title,
        channel: j.author_name || 'Unknown channel',
        thumbnail: j.thumbnail_url || thumbUrl(videoId),
        url: watch,
      };
    }
  } catch { /* fall through */ }
  // 2) YouTube oEmbed (works in many browsers)
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`);
    const j = await r.json();
    if (j && j.title) {
      return {
        videoId,
        title: j.title,
        channel: j.author_name || 'Unknown channel',
        thumbnail: j.thumbnail_url || thumbUrl(videoId),
        url: watch,
      };
    }
  } catch { /* fall through */ }
  // 3) offline fallback — thumbnail is always constructible from the id
  return {
    videoId,
    title: `YouTube video ${videoId}`,
    channel: '',
    thumbnail: thumbUrl(videoId),
    url: watch,
  };
}

// --- channel resolution -------------------------------------------------

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.yt',
  'https://pipedapi.reallyaweso.me',
];

async function pipedChannelFrom(base, handle) {
  const h = handle.startsWith('@') ? handle : `@${handle}`;
  let channelId = null;
  let name = h;
  try {
    const r0 = await fetch(`${base}/channel/${encodeURIComponent(h)}`, { signal: AbortSignal.timeout(6000) });
    if (r0.ok) {
      const j = await r0.json();
      const videos = parsePipedVideos(j, name);
      if (videos.length) return { title: j.name || name, handle: h, videos };
    }
    const r1 = await fetch(`${base}/search?q=${encodeURIComponent(h)}&filter=channels`, { signal: AbortSignal.timeout(6000) });
    if (r1.ok) {
      const s = await r1.json();
      const first = (s.items || [])[0];
      if (first && first.url) channelId = (first.url.match(/channel\/(UC[\w-]+)/) || [])[1];
      if (first && first.name) name = first.name;
    }
    if (channelId) {
      const r2 = await fetch(`${base}/channel/${channelId}`, { signal: AbortSignal.timeout(6000) });
      if (r2.ok) {
        const j = await r2.json();
        const videos = parsePipedVideos(j, name);
        if (videos.length) return { title: j.name || name, handle: h, videos };
      }
    }
  } catch { /* instance unavailable */ }
  return null;
}

function parsePipedVideos(j, fallbackName) {
  return (j.relatedStreams || j.videos || [])
    .map((v) => {
      const id = (v.url || v.videoId || '').match(/([A-Za-z0-9_-]{11})/);
      return id ? {
        videoId: id[1],
        title: v.title || `Video ${id[1]}`,
        channel: v.uploaderName || fallbackName,
        thumbnail: v.thumbnail || thumbUrl(id[1]),
      } : null;
    })
    .filter(Boolean)
    .slice(0, 12);
}

// Last-resort channel resolution through a public CORS proxy: read the channel page
// and pull the canonical channel id / recent video ids out of the HTML.
async function proxyChannel(url) {
  const proxies = [
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  ];
  for (const wrap of proxies) {
    try {
      const r = await fetch(wrap(url), { signal: AbortSignal.timeout(10000) });
      if (!r.ok) continue;
      const html = await r.text();
      const chanId = (html.match(/channel\/(UC[\w-]{10,})/) || [])[1]
        || (html.match(/"channelId":"(UC[\w-]{10,})"/) || [])[1];
      const title = (html.match(/<meta name="title" content="([^"]+)"/) || [])[1]
        || (html.match(/<title>([^<]+)<\/title>/) || [])[1] || '';
      if (chanId) {
        const feed = await rssChannel(chanId);
        if (feed) return feed;
      }
      const ids = [...new Set([...html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map((m) => m[1]))].slice(0, 12);
      if (ids.length) {
        return {
          title: decodeEntities(title.replace(/\s*-\s*YouTube\s*$/, '')),
          videos: ids.map((id) => ({ videoId: id, title: '', channel: '', thumbnail: thumbUrl(id) })),
        };
      }
    } catch { /* next proxy */ }
  }
  return null;
}

async function rssChannel(channelId) {
  try {
    const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const xml = await r.text();
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
    const videos = entries.map((e) => {
      const block = e[1];
      const id = (block.match(/\/videos\/([\w-]+)/) || [])[1] || (block.match(/<yt:videoId>([\w-]+)<\/yt:videoId>/) || [])[1];
      const title = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
      const author = (block.match(/<name>([\s\S]*?)<\/name>/) || [])[1] || '';
      return id ? { videoId: id, title: decodeEntities(title), channel: decodeEntities(author), thumbnail: thumbUrl(id) } : null;
    }).filter(Boolean);
    const title = (xml.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || channelId;
    if (videos.length) return { title: decodeEntities(title), videos: videos.slice(0, 12) };
  } catch { /* ignore */ }
  return null;
}

function decodeEntities(s) {
  return String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export async function fetchChannelVideos(parsed) {
  if (parsed.id) return rssChannel(parsed.id);
  if (parsed.handle) {
    const h = parsed.handle.replace(/^@/, '');
    const pageUrl = parsed.legacy
      ? `https://www.youtube.com/${parsed.legacy}/${h}`
      : `https://www.youtube.com/@${h}`;
    // Race every resolution strategy in parallel; first success wins (max ~10s).
    const attempts = [
      ...PIPED_INSTANCES.map((base) => () => pipedChannelFrom(base, parsed.handle)),
      () => proxyChannel(pageUrl),
    ];
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000));
    try {
      return await Promise.race([
        Promise.any(attempts.map((fn) => fn())),
        timeout,
      ]);
    } catch { return null; }
  }
  return null;
}

// --- Piped: real stream + real subtitle access (browser can fetch these) ---

export async function fetchPipedStreams(videoId) {
  for (const base of PIPED_INSTANCES) {
    try {
      const r = await fetch(`${base}/streams/${encodeURIComponent(videoId)}`, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) continue;
      const j = await r.json();
      if (!j || (!j.videoStreams?.length && !j.audioStreams?.length)) continue;
      const abs = (u) => (u && u.startsWith('/') ? base + u : u);
      const all = (j.videoStreams || []).filter((s) => s.url).map((s) => ({
        url: abs(s.url),
        quality: s.quality || '',
        format: s.format || s.mimeType || '',
        mimeType: s.mimeType || '',
        hasVideo: s.hasVideo !== false,
        // Piped uses `videoOnly: false` for muxed video/audio streams in some APIs.
        hasAudio: s.hasAudio === true || s.videoOnly === false,
      }));
      const progressive = all.filter((s) => s.hasVideo && s.hasAudio).sort((a, b) => qualityScore(b.quality) - qualityScore(a.quality));
      const videos = all.filter((s) => s.hasVideo && !s.hasAudio).sort((a, b) => qualityScore(b.quality) - qualityScore(a.quality));
      const audios = (j.audioStreams || [])
        .filter((s) => s.url)
        .map((s) => ({ url: abs(s.url), bitrate: s.bitrate || 0, mimeType: s.mimeType || '', quality: s.quality || '' }))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      const subtitles = (j.subtitles || [])
        .filter((s) => s.url)
        .map((s) => ({ url: abs(s.url), label: s.label || s.language || 'caption', mimeType: s.mimeType || 'text/vtt', auto: /auto/i.test(s.label || '') ? true : !!s.autoGenerated }));
      return {
        title: j.title || '',
        channel: j.uploader || '',
        duration: Number(j.duration) || 0,
        thumbnail: j.thumbnailUrl || thumbUrl(videoId),
        progressive,
        videos,
        audios,
        subtitles,
      };
    } catch { /* next instance */ }
  }
  return null;
}

function qualityScore(q) {
  const m = String(q || '').match(/(\d{3,4})/);
  return m ? Number(m[1]) : 0;
}

export async function fetchSubtitleText(url, base = '') {
  const full = url.startsWith('http') ? url : base + url;
  const r = await fetch(full, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error('subtitle fetch failed');
  return await r.text();
}

export function parseVTT(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const cues = [];
  let cur = null;
  const ts = (s) => {
    const m = String(s).trim().match(/(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/);
    if (!m) return null;
    const h = Number(m[1] || 0), mm = Number(m[2]), ss = Number(m[3]), ms = Number(m[4].padEnd(3, '0'));
    return h * 3600 + mm * 60 + ss + ms / 1000;
  };
  const push = () => { if (cur && cur.text) cues.push(cur); cur = null; };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { push(); continue; }
    if (/^(WEBVTT|NOTE|STYLE|REGION)/.test(line)) { if (!cur) continue; push(); continue; }
    const m = line.match(/^(\S+)\s*-->\s*(\S+)/);
    if (m) {
      push();
      const start = ts(m[1]), end = ts(m[2]);
      if (start != null && end != null) cur = { start, end, text: '' };
      continue;
    }
    if (cur) {
      const cleaned = line.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (cleaned) cur.text = cur.text ? `${cur.text} ${cleaned}` : cleaned;
    }
  }
  push();
  return cues;
}

// Shift real transcript cues into a clip's local timeline.
export function captionsFromCues(cues, clipStart, clipEnd) {
  const out = [];
  for (const c of cues) {
    if (c.end <= clipStart || c.start >= clipEnd) continue;
    const t0 = Math.max(0, round1(c.start - clipStart));
    const t1 = Math.min(clipEnd - clipStart, round1(c.end - clipStart));
    if (t1 - t0 < 0.3) continue;
    out.push({ t0, t1, text: c.text });
  }
  return out;
}

function round1(n) { return Math.round(n * 10) / 10; }

// --- IFrame player ------------------------------------------------------

let apiPromise = null;
export function ensureYTAPI() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev && prev(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => reject(new Error('YouTube API failed to load'));
    document.head.appendChild(s);
    setTimeout(() => { if (!window.YT) reject(new Error('YouTube API timeout')); }, 12000);
  });
  return apiPromise;
}

// Read the real duration of a video with a tiny hidden player (best-effort).
export async function fetchDuration(videoId, timeoutMs = 10000) {
  try {
    const YT = await ensureYTAPI();
    return await new Promise((resolve) => {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;overflow:hidden;';
      document.body.appendChild(host);
      const timer = setTimeout(() => { try { player && player.destroy(); } catch {} host.remove(); resolve(null); }, timeoutMs);
      const player = new YT.Player(host, {
        height: '2', width: '2', videoId,
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0 },
        events: {
          onReady: () => {
            const d = player.getDuration();
            clearTimeout(timer);
            try { player.destroy(); } catch {}
            host.remove();
            resolve(Number.isFinite(d) && d > 0 ? Math.round(d) : null);
          },
          onError: () => { clearTimeout(timer); try { player.destroy(); } catch {} host.remove(); resolve(null); },
        },
      });
    });
  } catch { return null; }
}

export async function createPlayer(container, videoId, opts = {}) {
  const YT = await ensureYTAPI();
  container.innerHTML = '';
  const player = new YT.Player(container, {
    width: '100%', height: '100%', videoId,
    playerVars: {
      autoplay: opts.autoplay ? 1 : 0,
      controls: 0,
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
      start: Math.round(opts.start || 0),
      end: opts.end ? Math.round(opts.end) : undefined,
      iv_load_policy: 3,
    },
    events: {
      onReady: (e) => { opts.onReady && opts.onReady(e.target); },
      onStateChange: (e) => { opts.onStateChange && opts.onStateChange(e.data, e.target); },
      onError: (e) => { opts.onError && opts.onError(e.data); },
    },
  });
  return player;
}

export function cueClip(player, clip) {
  if (!player || !player.cueVideoById) return;
  try {
    player.cueVideoById({ videoId: clip.videoId, startSeconds: Math.round(clip.start), endSeconds: Math.round(clip.end) });
  } catch { /* ignore */ }
}

export function sanitizeClipBounds(clip, duration) {
  const dur = clamp(duration || clip.duration || 600, 5, 12 * 3600);
  let start = clamp(Number(clip.start) || 0, 0, dur - 5);
  let end = clamp(Number(clip.end) || start + 30, start + 3, dur);
  return { ...clip, start, end, duration: dur };
}
