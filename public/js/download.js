// Fetch a real YouTube stream (via Piped's media proxy) into the browser,
// analyze its actual audio/motion, and import source subtitles when available.

import { saveMedia, loadMedia } from './idb.js';
import { fetchPipedStreams, fetchSubtitleText, parseVTT, captionsFromCues } from './yt.js';
import { analyzeVideoFile, pickSegments } from './analyze.js';
import { generateClipsFromScores, refreshHooksFromTranscript } from './gen.js';
import { save } from './store.js';
import { toast } from './util.js';

export async function downloadUrl(url, { onProgress, signal } = {}) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`ดาวน์โหลดไม่สำเร็จ (HTTP ${r.status})`);
  const total = Number(r.headers.get('content-length')) || 0;
  if (!r.body) return new Blob([await r.arrayBuffer()]);
  const reader = r.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    if (onProgress) onProgress(total ? got / total : -1);
  }
  return new Blob(chunks, { type: total ? 'video/mp4' : 'application/octet-stream' });
}

export async function getProjectMedia(videoId) {
  try {
    let video = await loadMedia(`${videoId}::video`);
    // Migrate videos saved by the earlier upload-only build, which used videoId
    // directly as the IndexedDB key.
    if (!video) video = await loadMedia(videoId);
    if (!video) return null;
    let audio = null;
    try { audio = await loadMedia(`${videoId}::audio`); } catch {}
    return { video, audio };
  } catch { return null; }
}

async function storeProjectMedia(videoId, video, audio) {
  await saveMedia(`${videoId}::video`, video);
  if (audio) await saveMedia(`${videoId}::audio`, audio);
}

export async function storeUploadMedia(videoId, file) {
  await saveMedia(`${videoId}::video`, file);
}

// Download real YouTube media, analyze the source in-browser, and replace
// heuristic placeholder segments/captions with source-derived results.
export async function ensureRealMedia(project, { onProgress, withSubtitles = true } = {}) {
  let media = await getProjectMedia(project.videoId);
  let streams = null;

  if (!media) {
    onProgress && onProgress(0.02, 'กำลังค้นหาแหล่งวิดีโอ…');
    streams = await fetchPipedStreams(project.videoId);
    if (!streams) throw new Error('ไม่พบแหล่งวิดีโอ (Piped) — ลองใหม่ หรือแนบไฟล์ในเครื่อง');

    // Prefer a combined progressive stream; otherwise download best video + audio.
    const progressive = streams.progressive?.[0];
    let video = null, audio = null;
    if (progressive) {
      onProgress && onProgress(0.05, `กำลังดาวน์โหลดวิดีโอ (${progressive.quality || 'mp4'})…`);
      video = await downloadUrl(progressive.url, {
        onProgress: (p) => onProgress && onProgress(0.05 + Math.max(0, p) * 0.7, 'กำลังดาวน์โหลดวิดีโอ…'),
      });
    } else {
      const v = streams.videos?.[0];
      const a = streams.audios?.[0];
      if (!v) throw new Error('ไม่พบสตรีมวิดีโอ');
      onProgress && onProgress(0.05, 'กำลังดาวน์โหลดวิดีโอ…');
      video = await downloadUrl(v.url, {
        onProgress: (p) => onProgress && onProgress(0.05 + Math.max(0, p) * 0.45, 'กำลังดาวน์โหลดวิดีโอ…'),
      });
      if (a) {
        onProgress && onProgress(0.52, 'กำลังดาวน์โหลดเสียง…');
        audio = await downloadUrl(a.url, {
          onProgress: (p) => onProgress && onProgress(0.52 + Math.max(0, p) * 0.25, 'กำลังดาวน์โหลดเสียง…'),
        });
      }
    }
    media = { video, audio };
    // Save early so a failed analysis can be retried without downloading again.
    onProgress && onProgress(0.8, 'กำลังบันทึกวิดีโอลงเครื่อง…');
    await storeProjectMedia(project.videoId, video, audio);
  }

  // Existing media may be from a prior download attempt, so query Piped again
  // only when we still need to look for a source subtitle track.
  const needsSourceSubtitles = withSubtitles && !['youtube-subtitles', 'unavailable'].includes(project.captionsSource);
  if (!streams && needsSourceSubtitles) streams = await fetchPipedStreams(project.videoId);

  if (!project.analysisSource) {
    onProgress && onProgress(0.82, 'กำลังวิเคราะห์เสียงและภาพจากวิดีโอจริง…');
    let analysis;
    try {
      analysis = await analyzeVideoFile(media.video, {
        audioFile: media.audio || null,
        onProgress: (p) => onProgress && onProgress(0.82 + Math.max(0, p) * 0.08, 'กำลังวิเคราะห์เสียงและภาพจากวิดีโอจริง…'),
      });
    } catch (e) {
      throw new Error(`ดาวน์โหลดวิดีโอแล้ว แต่เบราว์เซอร์วิเคราะห์ไฟล์นี้ไม่ได้: ${e.message}`);
    }
    const hasAudioSignal = analysis.loudness && Array.from(analysis.loudness).some((v) => v > 0.001);
    const hasMotionSignal = analysis.motion && Array.from(analysis.motion).some((v) => v > 0.001);
    if (!hasAudioSignal && !hasMotionSignal) {
      throw new Error('วิเคราะห์เสียง/ภาพจากวิดีโอไม่สำเร็จ — ลองแนบไฟล์ MP4 ที่รองรับในเครื่อง');
    }
    const opts = project.options || {};
    const count = Number(opts.count) || project.clips?.length || 6;
    const segments = pickSegments(analysis.scores, analysis.duration, count);
    if (!segments.length) throw new Error('วิดีโอสั้นเกินไปสำหรับการเลือกคลิปอย่างน้อย 15 วินาที');
    const meta = {
      videoId: project.videoId,
      title: project.title || '',
      channel: project.channel || '',
    };
    project.clips = generateClipsFromScores(segments, meta, {
      duration: analysis.duration,
      count,
      type: opts.type || 'general',
      lang: opts.lang || 'en',
      transcript: '',
    });
    project.clips.forEach((clip, i) => {
      clip.aspect = opts.aspect || '9:16';
      clip.score = segments[i].score;
    });
    project.duration = analysis.duration;
    project.analysisSource = 'audio-motion';
    save();
  }

  let cues = project.cues || [];
  if (withSubtitles && project.captionsSource !== 'youtube-subtitles' && streams?.subtitles?.length) {
    try {
      onProgress && onProgress(0.91, 'กำลังดึงคำบรรยายจริง…');
      cues = parseVTT(await fetchSubtitleText(streams.subtitles[0].url));
    } catch { cues = []; }
  }
  // Never leave template/demo captions on a real-source project. Use actual
  // YouTube subtitles when available, otherwise preserve only user-provided text.
  if (cues.length) {
    project.cues = cues;
    project.captionsSource = 'youtube-subtitles';
    for (const clip of project.clips) clip.captions = captionsFromCues(cues, clip.start, clip.end);
    refreshHooksFromTranscript(project.clips, cues);
  } else if (project.userTranscript) {
    project.cues = [];
    project.captionsSource = 'user-transcript';
  } else {
    project.cues = [];
    project.captionsSource = 'unavailable';
    for (const clip of project.clips) clip.captions = [];
  }
  save();

  onProgress && onProgress(1, 'เสร็จแล้ว');
  return {
    ...media,
    captionsAvailable: cues.length > 0 || !!project.userTranscript,
    captionsSource: project.captionsSource,
    analysisSource: project.analysisSource,
  };
}

// --- UI --------------------------------------------------------------

export function mediaCtaHtml(title) {
  return `
  <div class="export-box" id="media-cta-box" style="border-color:rgba(124,92,255,.5)">
    <h4>🎬 ${title || 'เปิดระบบตัดวิดีโอจริง'}</h4>
    <p>ดึงวิดีโอต้นฉบับจาก YouTube มาวิเคราะห์เสียงและภาพจริง เลือกช่วงคลิป แล้วนำเข้าคำบรรยายจากแหล่งวิดีโอ (ถ้ามี) — ทำงานในเบราว์เซอร์ ไม่อัปโหลดไปเซิร์ฟเวอร์</p>
    <button class="btn btn-primary btn-block" id="media-fetch">ดึงวิดีโอ + วิเคราะห์จริง</button>
    <div class="render-progress hidden" id="media-prog" style="margin-top:12px"><i></i></div>
    <div class="small muted hidden" id="media-status" style="margin-top:6px"></div>
  </div>`;
}

export function wireMediaCta(project, root, hooks) {
  const btn = root.querySelector('#media-fetch');
  if (!btn) return;
  const done = hooks && hooks.onDone;
  const fail = hooks && hooks.onFail;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const prog = root.querySelector('#media-prog');
    const status = root.querySelector('#media-status');
    prog.classList.remove('hidden');
    status.classList.remove('hidden');
    try {
      const media = await ensureRealMedia(project, {
        onProgress: (p, label) => {
          prog.querySelector('i').style.width = `${Math.round(Math.max(0, p) * 100)}%`;
          status.textContent = label || '';
        },
      });
      prog.querySelector('i').style.width = '100%';
      const hasSourceSubs = media.captionsSource === 'youtube-subtitles';
      const hasUserText = media.captionsSource === 'user-transcript';
      status.innerHTML = hasSourceSubs
        ? '✓ วิดีโอและคำบรรยายจริงจาก YouTube พร้อมแล้ว — กด <b style="color:var(--text)">Export MP4</b> ได้เลย'
        : hasUserText
          ? '✓ วิดีโอพร้อมแล้ว — ใช้คำบรรยายจาก transcript ที่คุณให้ไว้ กด <b style="color:var(--text)">Export MP4</b> ได้เลย'
          : '✓ วิดีโอต้นฉบับพร้อมแล้ว — แหล่งนี้ไม่มีคำบรรยาย จึงไม่ได้ใส่ซับจำลอง กด <b style="color:var(--text)">Export MP4</b> ได้เลย';
      toast(hasSourceSubs ? 'วิดีโอและคำบรรยายจริงพร้อมแล้ว' : hasUserText ? 'วิดีโอพร้อม — ใช้ transcript ของคุณ' : 'วิดีโอจริงพร้อมแล้ว — ไม่พบคำบรรยายจากแหล่งนี้', hasSourceSubs || hasUserText ? 'ok' : 'err');
      done && done(media);
    } catch (e) {
      console.error(e);
      status.textContent = 'ผิดพลาด: ' + e.message;
      toast(e.message, 'err');
      btn.disabled = false;
      fail && fail(e);
    }
  });
}
