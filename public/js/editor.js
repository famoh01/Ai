// Clip editor: live player, caption/style controls, trim, audio and real exports.

import { $, $$, el, esc, fmtTime, fmtClock, toast, safeFilename, downloadText, downloadBlob } from './util.js';
import { state, save, getProject } from './store.js';
import { createPlayer, cueClip } from './yt.js';
import { STYLE_PRESETS, MUSIC_TRACKS } from './gen.js';
import { toSRT, toTXT, exportSRT, exportTXT, renderCover, renderPreviewVideo } from './render.js';
import { loadMedia, saveMedia } from './idb.js';
import { exportRealClip, isFFmpegReady } from './ffmpeg.js';
import { go } from './views.js';
import { openScheduleModal } from './views2.js';

export function renderEditor(root, projectId, clipId) {
  const p = getProject(projectId);
  if (!p) { root.innerHTML = '<div class="empty card"><h3>Project not found</h3></div>'; return; }
  let clip = p.clips.find((c) => c.id === clipId) || p.clips[0];
  if (!clip) { root.innerHTML = '<div class="empty card"><h3>No clips in this project</h3></div>'; return; }

  root.innerHTML = `
  <div class="editor">
    <div class="editor-top">
      <button class="btn btn-ghost btn-sm" id="back">← Results</button>
      <span class="crumb">${esc(p.title)}</span>
      <div class="clip-chips" id="clip-chips"></div>
      <div class="spacer"></div>
      <button class="btn btn-ghost btn-sm" id="sched">Schedule</button>
      <button class="btn btn-primary btn-sm" id="export-btn">Export</button>
    </div>
    <div class="editor-main">
      <div class="preview-col">
        <div class="stage">
          <div class="frame aspect-9-16" id="frame">
            <div class="yt" id="player"></div>
            <div class="facecam hidden" id="facecam"><img src="${esc(p.thumbnail)}" alt=""/></div>
            <div class="caption-overlay pos-bottom" id="overlay"><div class="caption-text" id="cap-text"></div></div>
            <div class="watermark" id="watermark"></div>
            <div class="progress-line"><i id="prog"></i></div>
          </div>
        </div>
        <div class="transport">
          <button class="icon-btn" id="play">▶</button>
          <div class="t-time"><b id="t-cur">00:00</b> / ${fmtTime(clip.end - clip.start)}</div>
          <input type="range" class="range" id="scrub" min="0" max="${Math.max(1, clip.end - clip.start)}" step="0.1" value="0"/>
        </div>
      </div>
      <div class="panel-col">
        <div class="tabs" id="tabs">
          <button class="tab on" data-tab="captions">Captions</button>
          <button class="tab" data-tab="style">Style</button>
          <button class="tab" data-tab="clip">Clip</button>
          <button class="tab" data-tab="audio">Audio</button>
          <button class="tab" data-tab="export">Export</button>
        </div>
        <div class="tab-body" id="tab-body"></div>
      </div>
    </div>
  </div>`;

  // ---- top actions ----
  const drawChips = () => {
    const wrap = $('#clip-chips');
    wrap.innerHTML = p.clips.map((c, i) => `<button class="chip ${c.id === clip.id ? 'on' : ''}" data-cid="${c.id}">${i + 1}</button>`).join('');
    $$('.chip', wrap).forEach((ch) => ch.addEventListener('click', () => { window.location.hash = `#/app/edit/${p.id}/${ch.dataset.cid}`; }));
  };
  drawChips();

  $('#back', root).addEventListener('click', () => go(`#/app/results/${p.id}`));
  $('#sched', root).addEventListener('click', () => openScheduleModal(p, [clip.id]));
  $('#export-btn', root).addEventListener('click', () => switchTab('export'));

  // ---- media (uploaded file OR YouTube embed) ----
  let player = null;        // YT player
  let videoEl = null;       // local <video>
  let videoUrl = null;      // object URL to revoke
  let attachedFile = null;  // user-attached local copy (YouTube projects)
  let playing = false;
  let syncTimer = null;
  let mediaReady = false;

  function destroyPlayer() {
    if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
    if (player) { try { player.destroy(); } catch {} player = null; }
    if (videoUrl) { URL.revokeObjectURL(videoUrl); videoUrl = null; }
    videoEl = null;
  }
  window.addEventListener('hashchange', destroyPlayer, { once: true });

  const isUpload = p.sourceType === 'upload';
  const frame = $('#frame', root);

  async function setupMedia() {
    if (isUpload) {
      let file = null;
      try { file = await loadMedia(p.videoId); } catch {}
      if (!file) {
        frame.insertAdjacentHTML('afterbegin', `<div class="embed-fallback" style="position:absolute;inset:0;display:grid;place-items:center;height:100%;color:var(--muted);font-size:13px;text-align:center;padding:20px;background:#000;z-index:4">Source video missing.<br/>Re-attach it from the Export tab to enable real MP4 export.</div>`);
        return;
      }
      videoUrl = URL.createObjectURL(file);
      frame.insertAdjacentHTML('afterbegin', `<video id="local-video" src="${videoUrl}" playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000"></video>`);
      videoEl = document.getElementById('local-video');
      videoEl.addEventListener('loadedmetadata', () => { videoEl.currentTime = clip.start; });
      mediaReady = true;
      startSync();
      return;
    }
    // YouTube project: pick up a previously attached local copy, if any.
    try {
      const f = await loadMedia(p.videoId);
      if (f) {
        attachedFile = f;
        const activeTab = $('.tab.on', root);
        if (activeTab && activeTab.dataset.tab === 'export') renderExportTab();
      }
    } catch {}
    createPlayer($('#player', root), p.videoId, {
      start: clip.start,
      end: clip.end,
      autoplay: 0,
      onReady: (pl) => {
        player = pl;
        cueClip(player, clip);
        mediaReady = true;
        startSync();
      },
      onError: () => {
        if (frame && !frame.querySelector('.embed-fallback')) {
          frame.insertAdjacentHTML('afterbegin', `<div class="embed-fallback" style="position:absolute;inset:0;display:grid;place-items:center;height:100%;color:var(--muted);font-size:13px;text-align:center;padding:20px;background:#000;z-index:4">This video can't be embedded.<br/>Exports still work from the cover + captions.</div>`);
        }
      },
    });
  }

  const currentTime = () => (videoEl ? videoEl.currentTime : (player && player.getCurrentTime ? player.getCurrentTime() : clip.start));
  const isPlayingNow = () => (videoEl ? !videoEl.paused && !videoEl.ended : (player && player.getPlayerState && player.getPlayerState() === 1));

  function startSync() {
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(() => {
      if (!mediaReady) return;
      const t = currentTime();
      if (!Number.isFinite(t)) return;
      const rel = Math.max(0, t - clip.start);
      $('#t-cur', root).textContent = fmtTime(rel);
      const scrub = $('#scrub', root);
      if (document.activeElement !== scrub) scrub.value = rel;
      $('#prog', root).style.width = `${Math.min(100, (rel / (clip.end - clip.start)) * 100)}%`;
      updateOverlay(t - clip.start);
      setPlayIcon(isPlayingNow());
      if (videoEl && videoEl.currentTime >= clip.end - 0.05 && !videoEl.paused) { videoEl.pause(); }
    }, 120);
  }

  function setPlayIcon(isPlaying) {
    playing = isPlaying;
    $('#play', root).textContent = isPlaying ? '⏸' : '▶';
  }

  $('#play', root).addEventListener('click', () => {
    if (videoEl) {
      if (videoEl.paused) {
        if (videoEl.currentTime >= clip.end - 0.2) videoEl.currentTime = clip.start;
        videoEl.play();
      } else videoEl.pause();
      setPlayIcon(!videoEl.paused);
      return;
    }
    if (!player) return;
    if (player.getPlayerState() === 1) { player.pauseVideo(); setPlayIcon(false); }
    else {
      if (player.getCurrentTime() >= clip.end - 0.3) { player.seekTo(clip.start, true); }
      player.playVideo();
      setPlayIcon(true);
    }
  });
  $('#scrub', root).addEventListener('input', (e) => {
    const t = clip.start + Number(e.target.value);
    if (videoEl) videoEl.currentTime = t;
    else if (player) player.seekTo(t, true);
    $('#t-cur', root).textContent = fmtTime(Number(e.target.value));
    updateOverlay(Number(e.target.value));
  });
  setupMedia();

  // ---- caption overlay ----
  let currentLine = null;
  function updateOverlay(rel) {
    const line = clip.captions.find((c) => rel >= c.t0 && rel < c.t1) || null;
    if (line === currentLine) return;
    currentLine = line;
    const box = $('#cap-text', root);
    if (!line) { box.innerHTML = ''; return; }
    const anim = clip.style.animation || 'pop';
    box.className = `caption-text anim-${anim}`;
    const words = line.text.split(' ');
    box.innerHTML = words.map((w, i) => `<span style="animation-delay:${Math.min(i * 45, 700)}ms">${esc(w)}</span>`).join(' ');
    box.style.fontSize = `${Math.round(clip.style.size * frameScale())}px`;
    box.style.color = clip.style.color;
    box.style.textShadow = '0 2px 10px rgba(0,0,0,.6)';
    const ov = $('#overlay', root);
    ov.className = `caption-overlay pos-${clip.style.position || 'bottom'}`;
    // per-word background pill like classic caption styles
    if (clip.style.bg && clip.style.bg !== 'rgba(0,0,0,0)') {
      box.style.background = clip.style.bg;
      box.style.padding = '0.25em 0.5em';
      box.style.borderRadius = '0.3em';
      box.style.width = 'fit-content';
      box.style.margin = '0 auto';
    } else {
      box.style.background = 'transparent';
      box.style.padding = '0';
      box.style.width = '100%';
    }
  }

  function frameScale() {
    const frame = $('#frame', root);
    return frame ? frame.clientWidth / 1080 : 0.6;
  }

  // ---- tabs ----
  const body = $('#tab-body', root);
  function switchTab(name) {
    $$('.tab', root).forEach((t) => t.classList.toggle('on', t.dataset.tab === name));
    renderTab(name);
  }
  $$('.tab', root).forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  function renderTab(name) {
    if (name === 'captions') renderCaptionsTab();
    else if (name === 'style') renderStyleTab();
    else if (name === 'clip') renderClipTab();
    else if (name === 'audio') renderAudioTab();
    else renderExportTab();
  }

  function renderCaptionsTab() {
    body.innerHTML = `
      <div class="small muted" style="margin-bottom:12px">Tap a line to edit. Times are relative to the clip start.</div>
      <div id="cap-list">
        ${clip.captions.map((c, i) => `
          <div class="cap-row" data-i="${i}">
            <span class="t">${fmtTime(c.t0)}–${fmtTime(c.t1)}</span>
            <input class="cap-input" value="${esc(c.text)}" data-i="${i}"/>
            <button class="del" data-del="${i}" title="Delete line">×</button>
          </div>`).join('')}
      </div>
      <button class="btn btn-ghost btn-sm btn-block" id="add-cap">+ Add caption line</button>`;
    $$('.cap-input', body).forEach((inp) => inp.addEventListener('input', () => {
      const i = Number(inp.dataset.i);
      clip.captions[i].text = inp.value;
      commit();
      const rel = Number($('#scrub', root).value);
      updateOverlay(rel);
    }));
    $$('[data-del]', body).forEach((b) => b.addEventListener('click', () => {
      clip.captions.splice(Number(b.dataset.del), 1);
      commit(); renderCaptionsTab();
    }));
    $('#add-cap', body).addEventListener('click', () => {
      const last = clip.captions[clip.captions.length - 1];
      const t0 = last ? last.t1 : 0;
      const t1 = Math.min(clip.end - clip.start, t0 + 3);
      clip.captions.push({ t0, t1, text: 'new caption line' });
      commit(); renderCaptionsTab();
    });
  }

  function renderStyleTab() {
    body.innerHTML = `
      <div class="small muted" style="margin-bottom:10px">Caption presets</div>
      <div class="style-presets">
        ${STYLE_PRESETS.map((s) => `
          <div class="style-preset ${clip.style.stylePreset === s.id ? 'on' : ''}" data-preset="${s.id}"
               style="background:${s.bg};color:${s.color};border:1px solid ${s.color}33">Ag</div>`).join('')}
      </div>
      <label class="field"><span>Font size · ${clip.style.size}px</span>
        <input type="range" class="range" id="st-size" min="24" max="90" value="${clip.style.size}"/>
      </label>
      <label class="field"><span>Text color</span><input type="color" class="input" id="st-color" value="${clip.style.color}" style="height:44px;padding:4px"/></label>
      <div class="setting-row"><div class="lbl"><b>Animation</b></div>
        <div class="seg" id="st-anim">
          ${['pop', 'fade', 'type'].map((a) => `<button data-a="${a}" class="${clip.style.animation === a ? 'on' : ''}">${a}</button>`).join('')}
        </div>
      </div>
      <div class="setting-row"><div class="lbl"><b>Position</b></div>
        <div class="seg" id="st-pos">
          ${['bottom', 'center', 'top'].map((a) => `<button data-a="${a}" class="${clip.style.position === a ? 'on' : ''}">${a}</button>`).join('')}
        </div>
      </div>
      <div class="setting-row"><div class="lbl"><b>Background</b></div>
        <div class="seg" id="st-bg">
          ${[['rgba(0,0,0,0.55)', 'Pill'], ['rgba(0,0,0,0)', 'None'], ['rgba(124,92,255,0.85)', 'Violet']].map(([v, l]) => `<button data-a="${v}" class="${clip.style.bg === v ? 'on' : ''}">${l}</button>`).join('')}
        </div>
      </div>`;

    $$('[data-preset]', body).forEach((b) => b.addEventListener('click', () => {
      const s = STYLE_PRESETS.find((x) => x.id === b.dataset.preset);
      clip.style = { ...s };
      commit(); renderStyleTab();
      updateOverlay(Number($('#scrub', root).value));
    }));
    $('#st-size', body).addEventListener('input', (e) => { clip.style.size = Number(e.target.value); commit(); updateOverlay(Number($('#scrub', root).value)); });
    $('#st-color', body).addEventListener('input', (e) => { clip.style.color = e.target.value; commit(); updateOverlay(Number($('#scrub', root).value)); });
    [['#st-anim', 'animation'], ['#st-pos', 'position'], ['#st-bg', 'bg']].forEach(([sel, key]) => {
      $$(`${sel} button`, body).forEach((b) => b.addEventListener('click', () => {
        clip.style[key] = b.dataset.a;
        commit(); renderStyleTab(); updateOverlay(Number($('#scrub', root).value));
      }));
    });
  }

  function renderClipTab() {
    body.innerHTML = `
      <label class="field"><span>Start · ${fmtClock(clip.start)}</span>
        <input type="range" class="range" id="trim-start" min="0" max="${Math.floor(clip.duration)}" step="0.5" value="${clip.start}"/>
      </label>
      <label class="field"><span>End · ${fmtClock(clip.end)}</span>
        <input type="range" class="range" id="trim-end" min="0" max="${Math.floor(clip.duration)}" step="0.5" value="${clip.end}"/>
      </label>
      <div class="setting-row"><div class="lbl"><b>Aspect ratio</b><span>Shorts · feed · wide</span></div>
        <div class="seg" id="clip-aspect">
          ${['9:16', '1:1', '16:9'].map((a) => `<button data-a="${a}" class="${(clip.aspect || p.options.aspect) === a ? 'on' : ''}">${a}</button>`).join('')}
        </div>
      </div>
      <div class="setting-row"><div class="lbl"><b>Face tracking</b><span>Keeps the speaker centered</span></div>
        <div class="switch ${clip.faceTracking ? 'on' : ''}" id="sw-face"></div>
      </div>
      <div class="setting-row"><div class="lbl"><b>Game Mode</b><span>Face cam over gameplay</span></div>
        <div class="switch ${clip.gameMode ? 'on' : ''}" id="sw-game"></div>
      </div>
      <label class="field"><span>Watermark</span><input class="input" id="wm" value="${esc(clip.watermark || state.settings.watermark || '')}" placeholder="@yourhandle"/></label>
      <div class="small muted">Tip: drag the scrubber to find the exact moment, then set start/end.</div>`;

    $('#trim-start', body).addEventListener('input', (e) => {
      clip.start = Math.min(Number(e.target.value), clip.end - 2);
      e.target.value = clip.start;
      e.target.closest('label').querySelector('span').textContent = `Start · ${fmtClock(clip.start)}`;
      afterTrim();
    });
    $('#trim-end', body).addEventListener('input', (e) => {
      clip.end = Math.max(Number(e.target.value), clip.start + 2);
      e.target.value = clip.end;
      e.target.closest('label').querySelector('span').textContent = `End · ${fmtClock(clip.end)}`;
      afterTrim();
    });
    $$('#clip-aspect button', body).forEach((b) => b.addEventListener('click', () => {
      clip.aspect = b.dataset.a; commit(); renderClipTab(); applyAspect();
    }));
    $('#sw-face', body).addEventListener('click', (e) => {
      clip.faceTracking = !clip.faceTracking; commit();
      e.target.classList.toggle('on', clip.faceTracking);
      $('#frame', root).classList.toggle('reframe', clip.faceTracking);
    });
    $('#sw-game', body).addEventListener('click', (e) => {
      clip.gameMode = !clip.gameMode; commit();
      e.target.classList.toggle('on', clip.gameMode);
      $('#facecam', root).classList.toggle('hidden', !clip.gameMode);
    });
    $('#wm', body).addEventListener('input', (e) => {
      clip.watermark = e.target.value; commit();
      $('#watermark', root).textContent = clip.watermark;
    });

    // init visuals
    $('#frame', root).classList.toggle('reframe', clip.faceTracking);
    $('#facecam', root).classList.toggle('hidden', !clip.gameMode);
    $('#watermark', root).textContent = clip.watermark || '';
    applyAspect();
  }

  function applyAspect() {
    const frame = $('#frame', root);
    frame.classList.remove('aspect-9-16', 'aspect-1-1', 'aspect-16-9');
    const a = clip.aspect || p.options.aspect || '9:16';
    frame.classList.add(a === '1:1' ? 'aspect-1-1' : a === '16:9' ? 'aspect-16-9' : 'aspect-9-16');
  }
  applyAspect();

  function afterTrim() {
    commit();
    if (videoEl) { try { videoEl.currentTime = clip.start; } catch {} }
    else if (player && player.seekTo) { try { player.seekTo(clip.start, true); } catch {} }
    $('#scrub', root).max = Math.max(1, clip.end - clip.start);
    updateOverlay(0);
  }

  function renderAudioTab() {
    body.innerHTML = `
      <label class="field"><span>Background music</span>
        <select class="select" id="music">
          ${MUSIC_TRACKS.map((m) => `<option value="${m.id}" ${clip.music === m.id ? 'selected' : ''}>${m.label}</option>`).join('')}
        </select>
      </label>
      <label class="field"><span>Music volume · ${Math.round(clip.musicVolume * 100)}%</span>
        <input type="range" class="range" id="music-vol" min="0" max="100" value="${Math.round(clip.musicVolume * 100)}"/>
      </label>
      <div class="setting-row"><div class="lbl"><b>Auto ducking</b><span>Lower music under speech</span></div>
        <div class="switch on" id="sw-duck"></div>
      </div>
      <div class="small muted">Music is included in the exported package metadata. Preview renders use the cover + captions.</div>`;
    $('#music', body).addEventListener('change', (e) => { clip.music = e.target.value; commit(); });
    $('#music-vol', body).addEventListener('input', (e) => { clip.musicVolume = Number(e.target.value) / 100; commit(); });
  }

  function renderExportTab() {
    const hasLocal = isUpload || attachedFile;
    const aspect = clip.aspect || p.options.aspect || '9:16';
    body.innerHTML = `
      ${hasLocal ? `
      <div class="export-box" style="border-color:rgba(47,212,138,.4)">
        <h4>🎬 Export real MP4</h4>
        <p>Ai cuts the exact clip, crops to ${aspect}, burns your styled captions, watermark and music. Rendered locally by ffmpeg — nothing is uploaded.</p>
        <div class="seg" id="q-seg" style="margin-bottom:12px">
          <button data-a="720" class="${state.settings.renderQuality === '720' ? 'on' : ''}">720p</button>
          <button data-a="1080" class="${state.settings.renderQuality === '1080' ? 'on' : ''}">1080p</button>
        </div>
        <button class="btn btn-primary btn-block" id="render-mp4">Export MP4</button>
        <div class="render-progress hidden" id="mp4-prog" style="margin-top:12px"><i></i></div>
        <div class="small muted hidden" id="mp4-status" style="margin-top:6px"></div>
      </div>` : `
      <div class="export-box">
        <h4>🎬 Real MP4 export</h4>
        <p>Attach the source video file (e.g. the same YouTube video downloaded to your computer). Ai then cuts it, crops it, burns captions and mixes music — a real .mp4, rendered locally.</p>
        <button class="btn btn-accent btn-block" id="attach-file">Attach video file</button>
        <input type="file" id="attach-input" accept="video/*" style="display:none"/>
      </div>
      <div class="export-box">
        <h4>🎞️ Preview video (WebM)</h4>
        <p>Lightweight preview render (motion cover + your captions). Works without the source file.</p>
        <button class="btn btn-ghost btn-block" id="render-webm">Render preview video</button>
        <div class="render-progress hidden" id="render-prog" style="margin-top:12px"><i></i></div>
        <div class="small muted hidden" id="render-pct" style="margin-top:6px">0%</div>
      </div>`}
      <div class="export-box">
        <h4>📄 Caption file</h4>
        <p>Download the caption timing as .srt — drop it into CapCut, Premiere or any editor.</p>
        <button class="btn btn-ghost btn-block" id="dl-srt">Download SRT</button>
      </div>
      <div class="export-box">
        <h4>🖼️ Cover image</h4>
        <p>A branded 1080p cover with hook title and virality score.</p>
        <button class="btn btn-ghost btn-block" id="dl-cover">Download cover PNG</button>
      </div>
      <div class="export-box">
        <h4>📦 Text package</h4>
        <p>Hook, description, hashtags, timings and captions in one .txt file.</p>
        <button class="btn btn-ghost btn-block" id="dl-txt">Download TXT package</button>
      </div>`;

    $$('#q-seg button', body).forEach((b) => b.addEventListener('click', () => {
      state.settings.renderQuality = b.dataset.a; save(); renderExportTab();
    }));

    const mp4Btn = $('#render-mp4', body);
    if (mp4Btn) mp4Btn.addEventListener('click', async () => {
      mp4Btn.disabled = true;
      const prog = $('#mp4-prog', body), status = $('#mp4-status', body);
      prog.classList.remove('hidden'); status.classList.remove('hidden');
      status.textContent = 'Loading video engine (first time ~10s)…';
      try {
        const file = isUpload ? await loadMedia(p.videoId) : attachedFile;
        if (!file) throw new Error('Source video not found — re-attach it.');
        const blob = await exportRealClip({
          file, clip, aspect, quality: state.settings.renderQuality,
          watermark: clip.watermark || state.settings.watermark || '',
          musicId: clip.music || 'none', musicVolume: clip.musicVolume ?? 0.25,
          onProgress: (pct) => {
            prog.querySelector('i').style.width = `${Math.round(pct * 100)}%`;
            status.textContent = `Rendering… ${Math.round(pct * 100)}%`;
          },
        });
        downloadBlob(blob, `${safeFilename(clip.hook)}.mp4`);
        status.textContent = 'Done — MP4 downloaded.';
        toast('MP4 downloaded', 'ok');
      } catch (err) {
        console.error(err);
        status.textContent = `Export failed: ${err.message}`;
        toast(`Export failed: ${err.message}`, 'err');
      } finally {
        mp4Btn.disabled = false;
      }
    });

    const webmBtn = $('#render-webm', body);
    if (webmBtn) webmBtn.addEventListener('click', async () => {
      webmBtn.disabled = true;
      $('#render-prog', body).classList.remove('hidden');
      $('#render-pct', body).classList.remove('hidden');
      try {
        await renderPreviewVideo(clip, p, { quality: state.settings.renderQuality, aspect, watermark: clip.watermark || '' }, (pct) => {
          $('#render-prog i', body).style.width = `${Math.round(pct * 100)}%`;
          $('#render-pct', body).textContent = `${Math.round(pct * 100)}%`;
        });
        toast('Preview video downloaded', 'ok');
      } catch (err) {
        toast(`Render failed: ${err.message}`, 'err');
      } finally {
        webmBtn.disabled = false;
      }
    });

    const attachBtn = $('#attach-file', body);
    if (attachBtn) {
      const input = $('#attach-input', body);
      attachBtn.addEventListener('click', () => input.click());
      input.addEventListener('change', async () => {
        const f = input.files[0];
        if (!f) return;
        attachedFile = f;
        try { await saveMedia(p.videoId, f); } catch {}
        toast('Video attached — real MP4 export enabled', 'ok');
        renderExportTab();
      });
    }

    $('#dl-srt', body).addEventListener('click', () => { exportSRT(clip, p); toast('SRT downloaded', 'ok'); });
    $('#dl-cover', body).addEventListener('click', async () => { await renderCover(clip, p, state.settings.renderQuality); toast('Cover downloaded', 'ok'); });
    $('#dl-txt', body).addEventListener('click', () => { exportTXT(clip, p); toast('Package downloaded', 'ok'); });
  }

  function commit() {
    const i = p.clips.findIndex((c) => c.id === clip.id);
    if (i >= 0) p.clips[i] = clip;
    save();
  }

  renderTab('captions');
  updateOverlay(0);
}
