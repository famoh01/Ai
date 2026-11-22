// Landing page, login, dashboard and clip-results views.

import { $, $$, el, esc, fmtTime, fmtDate, fmtNum, toast, uid, safeFilename, downloadText, downloadBlob, seeded } from './util.js';
import { state, save, upsertProject, getProject } from './store.js';
import { parseYouTube, fetchVideoMeta, fetchChannelVideos, thumbUrl, fetchDuration, watchUrl } from './yt.js';
import { generateClipsFromScores, VIDEO_TYPES, LANGUAGES } from './gen.js';
import { analyzeVideoFile, pickSegments } from './analyze.js';
import { loadMedia } from './idb.js';
import { getProjectMedia, storeUploadMedia, mediaCtaHtml, wireMediaCta } from './download.js';
import { exportSRT, exportTXT, renderCover } from './render.js';
import { scoreRing, openModal, confirmDialog, PLATFORMS } from './ui.js';

export function go(hash) { window.location.hash = hash; }

/* ============================== LANDING ============================== */

const ROTATOR = ['podcasts', 'GTA 6 streams', 'vlogs', 'gameplay', 'sports matches', 'livestreams', 'interviews'];

export function renderLanding(root) {
  root.innerHTML = `
  <nav class="nav">
    <div class="nav-inner">
      <a class="logo" href="#/"><span class="logo-mark">Ai</span> Ai</a>
      <div class="nav-links">
        <a href="#features">Features</a>
        <a href="#how">How it works</a>
        <a href="#pricing">Pricing</a>
        <a href="#automation">Automation</a>
      </div>
      <div class="nav-right">
        <a class="btn btn-ghost btn-sm" href="#/login">Sign in</a>
        <a class="btn btn-primary btn-sm" href="#/app">Get Clips Now</a>
      </div>
    </div>
  </nav>

  <header class="hero">
    <div class="badge badge-grad" style="font-size:12px">AI SHORTS CLIPPER</div>
    <h1>Reassemble <span class="rotator" id="rotator">podcasts</span> into<br/>Viral Shorts</h1>
    <p class="sub">Ai auto-clips, captions, and posts your videos to TikTok, YouTube, Instagram &amp; X. Paste a link — get scroll-stopping clips in minutes.</p>
    <div class="hero-cta">
      <a class="btn btn-primary btn-lg" href="#/app">Get Clips Now</a>
      <a class="btn btn-ghost btn-lg" href="#how">See how it works</a>
    </div>
    <div class="hero-stats">
      <div class="stat"><b>3.4M+</b><span>shorts clippers</span></div>
      <div class="stat"><b>4.6 / 5</b><span>rating on Google</span></div>
      <div class="stat"><b>448M</b><span>views in Sep 2026</span></div>
      <div class="stat"><b>$6/mo</b><span>plans · cancel anytime</span></div>
    </div>
  </header>

  <div class="section" style="padding-top:10px">
    <div class="logo-row">
      ${['Google', 'Apple', 'Amazon', 'Samsung', 'IBM', 'Salesforce', 'Oracle', 'Mastercard', 'LinkedIn', 'Intel', 'BBC', 'TikTok', 'Zoom']
        .map((n) => `<span>${esc(n)}</span>`).join('')}
    </div>
  </div>

  <section class="section" id="features">
    <div class="section-head-center">
      <h2>Everything you need to create viral clips</h2>
      <p class="lead">One link in, a full short-form content package out — clips, captions, hooks, covers and a posting schedule.</p>
    </div>
    <div class="feature-grid">
      ${[
        ['✂️', 'Auto Curation', 'AI scores every moment of your video and cuts the ones with the highest viral potential.'],
        ['🕺', 'Face Tracking', 'Keeps speakers centered when converting horizontal footage into vertical Shorts.'],
        ['💬', 'Auto Captioning', 'Word-perfect styled captions with pop, fade and typewriter animations.'],
        ['🌍', 'Caption Translation', 'Translate captions into 30+ languages while keeping the original audio.'],
        ['🪝', 'Hook Title & CTA', 'AI writes the hook title, description and hashtags for every clip.'],
        ['🎮', 'Game Mode', 'Puts the face cam on top and gameplay below for stream highlights.'],
        ['⚽', 'Sports Mode', 'Tracks the ball and the action so every goal stays perfectly framed.'],
        ['🎬', 'B-Roll & SFX', 'Transitions, sound effects and auto zoom to boost retention.'],
      ].map(([i, t, d]) => `<div class="feature"><div class="f-ico">${i}</div><h3>${t}</h3><p>${d}</p></div>`).join('')}
    </div>
  </section>

  <section class="section" id="how" style="padding-top:0">
    <div class="section-head-center">
      <h2>From YouTube video to viral clips in 3 steps</h2>
    </div>
    <div class="steps">
      <div class="step"><div class="num">01</div><h3>Paste a YouTube URL</h3><p>Drop any YouTube video or channel link. Long-form, podcast, gaming stream — anything works.</p></div>
      <div class="step"><div class="num">02</div><h3>AI creates clips</h3><p>Ai finds the most viral moments, adds captions, face tracking, hooks and covers — automatically.</p></div>
      <div class="step"><div class="num">03</div><h3>Post everywhere</h3><p>Schedule and auto-post to TikTok, YouTube Shorts, Instagram Reels and X in one click.</p></div>
    </div>
  </section>

  <section class="section" style="padding-top:0">
    <div class="section-head-center">
      <h2>One AI clipper, every video source</h2>
    </div>
    <div class="source-grid">
      ${[
        ['YouTube', 'Any public video or channel — podcasts, interviews, gaming streams, long-form.', 'youtube.com/watch?v=…'],
        ['File upload', 'Drag &amp; drop your own footage and let the AI find the best moments.', 'MP4 · MOV · WEBM'],
        ['Twitch', 'Turn your Twitch stream VODs into viral clips for your channel.', 'twitch.tv/videos/…'],
        ['Kick', 'Turn your Kick stream VODs into viral clips for your channel.', 'kick.com/video/…'],
      ].map(([t, d, c]) => `<div class="source"><b>${t}</b><span>${d}</span><code>${c}</code></div>`).join('')}
    </div>
  </section>

  <section class="section" id="automation">
    <div class="feature-grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
      <div class="card" style="padding:26px">
        <h2 style="font-size:26px">YouTube channel automation</h2>
        <p class="lead" style="margin-bottom:18px">Ai watches your channel 24/7, AI-clips new uploads, and auto-posts to your connected accounts — hands-off.</p>
        <div class="steps" style="grid-template-columns:1fr">
          ${[['Connect channel', 'Paste your YouTube channel URL. That’s it.'], ['Detect', 'We watch for new uploads — no refresh needed.'], ['AI clip', 'Every upload is scored and cut into Shorts-ready clips.'], ['Auto-post', 'Clips post to your connected TikTok, YouTube, Reels and X.']]
            .map(([t, d], i) => `<div class="step" style="padding:12px 0"><div class="num">0${i + 1}</div><div><h3 style="margin:0 0 4px">${t}</h3><p style="margin:0">${d}</p></div></div>`).join('')}
        </div>
        <a class="btn btn-primary btn-block" href="#/app/automation" style="margin-top:14px">Start Automating</a>
      </div>
      <div class="card" style="padding:26px">
        <h2 style="font-size:26px">Get paid for the views</h2>
        <p class="lead" style="margin-bottom:18px">Clip Rewards pays <b style="color:var(--text)">$1 per 1K verified views</b>. Make clips for creators, post them on your accounts, earn when they hit.</p>
        <div class="reward-grid">
          ${[
            ['Boossoo', 'BOOSSOO Art: Roast Me With Memes', '354', '$67.51 left'],
            ['The M3 Podcast', 'The M3 Podcast Clipping | $1 CPM', '229', '$60.41 left'],
            ['Built For Success', 'Built for Success Podcast Clipping', '255', '$49.72 left'],
          ].map(([a, t, n, left]) => `
            <div class="card" style="padding:14px">
              <b style="font-size:13.5px">${t}</b>
              <div class="small muted" style="margin:4px 0 10px">${a} · ${n} clips</div>
              <div class="progress-line2"><i style="width:${20 + Number(n) / 4}%"></i></div>
              <div class="small" style="margin-top:8px"><b style="color:var(--warn)">$1</b> <span class="muted">/ 1K views · ${left}</span></div>
            </div>`).join('')}
        </div>
        <a class="btn btn-ghost btn-block" href="#/app/rewards" style="margin-top:14px">Browse campaigns</a>
      </div>
    </div>
  </section>

  <section class="section" id="pricing">
    <div class="section-head-center">
      <h2>Owner access — no top-ups, no subscription</h2>
      <p class="lead">This is your own Ai copy. Clip creation is unlimited and this site does not collect payments.</p>
    </div>
    <div class="card" style="max-width:760px;margin:0 auto;padding:28px;text-align:center">
      <div class="badge badge-grad" style="display:inline-flex;margin-bottom:12px">OWNER · UNLIMITED</div>
      <p class="muted">Your projects and media stay in your browser. No plan purchase or credit top-up is required to use this copy.</p>
      <a class="btn btn-primary" href="#/signup" style="margin-top:12px">Open Ai</a>
    </div>
  </section>

  <footer class="footer">
    <div class="footer-inner">
      <div><span class="logo"><span class="logo-mark">Ai</span> Ai</span> &nbsp;·&nbsp; AI clip maker for creators.</div>
      <div>
        <a href="#features">Features</a><a href="#how">How it works</a><a href="#pricing">Pricing</a><a href="#/login">Sign in</a>
      </div>
    </div>
  </footer>`;

  // rotator
  let ri = 0;
  const rot = $('#rotator', root);
  setInterval(() => {
    ri = (ri + 1) % ROTATOR.length;
    if (rot) rot.textContent = ROTATOR[ri];
  }, 2200);

}

/* ============================== LOGIN ============================== */

export function renderLogin(root, redirect = '#/app') {
  let mode = 'signin';
  root.innerHTML = `
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="logo"><span class="logo-mark">Ai</span> Ai</div>
      <h1 id="auth-title">Sign in to your account</h1>
      <div class="sub" id="auth-sub">New to Ai? <a id="auth-switch">Sign up</a></div>
      <button class="oauth-btn" id="oauth-google"><span style="font-weight:900;color:#fff">G</span> Log in with Google</button>
      <button class="oauth-btn" id="oauth-apple"><span style="font-weight:900">🍎</span> Log in with Apple</button>
      <div class="auth-divider">OR</div>
      <form id="auth-form">
        <label class="field" id="name-field" style="display:none"><span>Display name</span><input class="input" id="auth-name" autocomplete="name"/></label>
        <label class="field"><span>Email</span><input class="input" id="auth-email" type="email" required autocomplete="email"/></label>
        <label class="field"><span>Password</span><input class="input" id="auth-pass" type="password" required minlength="4" autocomplete="current-password"/></label>
        <button class="btn btn-primary btn-block btn-lg" type="submit" id="auth-submit">Sign in</button>
      </form>
      <div class="auth-alt"><a id="auth-guest">Continue as guest →</a></div>
    </div>
  </div>`;

  const setTitle = () => {
    $('#auth-title', root).textContent = mode === 'signin' ? 'Sign in to your account' : 'Create your account';
    $('#auth-sub', root).innerHTML = mode === 'signin' ? 'New to Ai? <a id="auth-switch">Sign up</a>' : 'Already have an account? <a id="auth-switch">Sign in</a>';
    $('#auth-submit', root).textContent = mode === 'signin' ? 'Sign in' : 'Sign up';
    $('#name-field', root).style.display = mode === 'signup' ? '' : 'none';
    $('#auth-switch', root).onclick = (e) => { e.preventDefault(); mode = mode === 'signin' ? 'signup' : 'signin'; setTitle(); };
  };
  setTitle();

  const finish = (guest, name, email) => {
    state.user = guest ? { name: 'Guest', email: '', guest: true } : { name: name || email.split('@')[0], email, guest: false };
    save();
    toast(`Welcome, ${state.user.name}`, 'ok');
    go(redirect);
  };

  $('#auth-form', root).addEventListener('submit', (e) => {
    e.preventDefault();
    const email = $('#auth-email', root).value.trim();
    const name = $('#auth-name', root).value.trim();
    if (!email) return toast('Enter your email', 'err');
    finish(false, name, email);
  });
  $('#oauth-google', root).addEventListener('click', (e) => { e.preventDefault(); finish(false, 'Google User', 'user@gmail.com'); });
  $('#oauth-apple', root).addEventListener('click', (e) => { e.preventDefault(); finish(false, 'Apple User', 'user@icloud.com'); });
  $('#auth-guest', root).addEventListener('click', (e) => { e.preventDefault(); finish(true); });
}

/* ============================== DASHBOARD ============================== */

export function renderDashboard(root) {
  const projects = state.projects;
  root.innerHTML = `
  <h1 class="page-title">Dashboard</h1>
  <p class="page-sub">Paste a YouTube link and let Ai turn it into viral-ready clips.</p>

  <div class="new-project">
    <h2>✨ Get Clips</h2>
    <div class="hint">Paste a YouTube video or channel URL. Long-form, podcast, gaming stream — anything works.</div>
    <div class="url-row">
      <input class="input" id="url-input" placeholder="https://youtube.com/watch?v=… or https://youtube.com/@channel" spellcheck="false"/>
      <button class="btn btn-ghost" id="paste-btn" type="button">Paste</button>
      <button class="btn btn-primary btn-lg" id="get-clips" type="button">Get Clips</button>
    </div>
    <div class="opts">
      <label class="field"><span>Video type</span>
        <select class="select" id="opt-type">${VIDEO_TYPES.map((t) => `<option value="${t.id}">${t.label}</option>`).join('')}</select>
      </label>
      <label class="field"><span>Aspect ratio</span>
        <select class="select" id="opt-aspect">
          <option value="9:16">9:16 · Shorts / Reels / TikTok</option>
          <option value="1:1">1:1 · Feed</option>
          <option value="16:9">16:9 · YouTube</option>
        </select>
      </label>
      <label class="field"><span>Captions language</span>
        <select class="select" id="opt-lang">${LANGUAGES.map((l) => `<option value="${l}">${l.toUpperCase()}</option>`).join('')}</select>
      </label>
      <label class="field"><span>Number of clips · <b id="opt-count-label">6</b></span>
        <input type="range" class="range" id="opt-count" min="1" max="12" value="6"/>
      </label>
    </div>
    <details style="margin-bottom:4px">
      <summary class="small" style="cursor:pointer;color:var(--accent-2)">Paste a transcript for accurate captions (optional)</summary>
      <textarea class="textarea" id="opt-transcript" placeholder="Paste the video transcript here and Ai will sync captions to it…" style="margin-top:10px"></textarea>
    </details>
    <div id="channel-result"></div>
    <div id="progress-area"></div>
    <div class="small" style="margin-top:14px;color:var(--muted-2)">No link handy? <a href="#" id="demo-link" style="color:var(--accent-2)">Try a demo video</a></div>
    <div style="margin-top:18px;border-top:1px dashed var(--line-2);padding-top:18px">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="font-weight:800">📁 หรืออัปโหลดวิดีโอของคุณเอง</div>
        <div class="small muted">Ai วิเคราะห์เสียง+ภาพจริง แล้วตัดออกมาเป็น MP4 พร้อมซับ</div>
      </div>
      <label class="dropzone" id="dropzone" style="display:grid;place-items:center;gap:6px;margin-top:12px;padding:26px;border:1.5px dashed var(--line-2);border-radius:14px;cursor:pointer;text-align:center;color:var(--muted);transition:border-color .15s ease,background .15s ease">
        <input type="file" id="file-input" accept="video/*" style="display:none"/>
        <div style="font-size:26px">🎥</div>
        <div style="font-weight:700;color:var(--text)">คลิกเพื่อเลือกวิดีโอ หรือลากมาวางที่นี่</div>
        <div class="small">MP4 · MOV · WEBM · MKV — วิดีโอต้นฉบับจะอยู่ในเบราว์เซอร์ของคุณ (IndexedDB)</div>
      </label>
    </div>
  </div>

  <div class="section-head">
    <h3>Your projects</h3>
    <span class="small muted">${projects.length} project${projects.length === 1 ? '' : 's'}</span>
  </div>
  <div id="projects-wrap"></div>`;

  const renderProjects = () => {
    const wrap = $('#projects-wrap');
    if (!state.projects.length) {
      wrap.innerHTML = `<div class="empty card"><div class="big">🎬</div><h3>No projects yet</h3><p>Paste a YouTube link above to create your first clip set.</p></div>`;
      return;
    }
    wrap.innerHTML = `<div class="project-grid">${state.projects.map((p) => `
      <div class="project-card" data-id="${p.id}">
        <div class="thumb">
          <img src="${esc(p.thumbnail)}" alt="" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22320%22 height=%22180%22%3E%3Crect width=%22320%22 height=%22180%22 fill=%22%2315151f%22/%3E%3C/svg%3E'"/>
          <span class="count badge badge-grad">${p.clips.length} clips</span>
          <span class="dur">${fmtTime(p.duration)}</span>
        </div>
        <div class="pc-body">
          <div class="pc-title">${esc(p.title)}</div>
          <div class="pc-meta"><span>${fmtDate(p.createdAt)}</span><span>${esc(p.options.type)}</span><span>${esc(p.options.aspect)}</span></div>
        </div>
      </div>`).join('')}</div>`;
    $$('.project-card', wrap).forEach((c) => c.addEventListener('click', () => go(`#/app/results/${c.dataset.id}`)));
  };
  renderProjects();

  $('#opt-count', root).addEventListener('input', (e) => { $('#opt-count-label', root).textContent = e.target.value; });
  $('#paste-btn', root).addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) { $('#url-input', root).value = text.trim(); toast('Pasted'); }
    } catch { toast('Clipboard blocked — paste manually', 'err'); }
  });
  $('#demo-link', root).addEventListener('click', (e) => { e.preventDefault(); $('#url-input', root).value = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; start('https://www.youtube.com/watch?v=dQw4w9WgXcQ'); });

  // ---- upload your own video → real analysis + real exports ----
  const dz = $('#dropzone', root);
  const fi = $('#file-input', root);
  dz.addEventListener('click', () => fi.click());
  fi.addEventListener('change', () => { if (fi.files[0]) startUpload(fi.files[0]); fi.value = ''; });
  ['dragover', 'dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => {
    e.preventDefault();
    dz.style.borderColor = ev === 'dragleave' ? '' : 'var(--accent)';
    if (ev === 'drop' && e.dataTransfer.files[0]) startUpload(e.dataTransfer.files[0]);
  }));

  async function startUpload(file) {
    if (!file) return;
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|webm|mkv|avi|m4v|mts)$/i.test(file.name)) {
      return toast('กรุณาเลือกไฟล์วิดีโอ (MP4/MOV/WEBM)', 'err');
    }
    const area = $('#progress-area');
    const steps = ['Reading video', 'Analyzing audio energy', 'Scanning motion', 'Scoring viral moments', 'Writing hooks & captions'];
    area.innerHTML = `
      <div class="progress-card">
        <b>${esc(file.name)}</b> <span class="small muted">${(file.size / 1048576).toFixed(1)} MB</span>
        <div class="progress-steps">${steps.map((s, i) => `<div class="p-step" data-i="${i}"><span class="dot">${i + 1}</span> ${s}</div>`).join('')}</div>
        <div class="progress-bar"><i id="pbar"></i></div>
      </div>`;
    const stepEls = $$('.p-step', area);
    const setStep = (i, pct) => {
      stepEls.forEach((s, j) => {
        s.classList.toggle('done', j < i);
        s.classList.toggle('active', j === i);
        if (j < i) s.querySelector('.dot').textContent = '✓';
      });
      if (pct != null) $('#pbar', area).style.width = `${Math.round(pct * 100)}%`;
    };
    setStep(0, 0.02);
    try {
      const analysis = await analyzeVideoFile(file, { onProgress: (p) => setStep(1 + Math.min(2, Math.floor(p * 3)), 0.05 + p * 0.7) });
      setStep(3, 0.85);
      const count = Number($('#opt-count', root).value) || 6;
      const segs = pickSegments(analysis.scores, analysis.duration, count);
      if (!segs.length) throw new Error('video is too short to clip');
      setStep(4, 0.95);
      const transcript = $('#opt-transcript', root).value.trim();
      const meta = {
        videoId: `up_${uid('u')}`,
        title: file.name.replace(/\.[^.]+$/, ''),
        channel: 'Your upload',
        thumbnail: await capturePoster(file),
        url: '',
      };
      const clips = generateClipsFromScores(segs, meta, {
        duration: analysis.duration, count, type: $('#opt-type', root).value, transcript,
      });
      clips.forEach((c) => { c.aspect = $('#opt-aspect', root).value; });
      await storeUploadMedia(meta.videoId, file);
      const project = {
        id: uid('p'), sourceType: 'upload', fileName: file.name,
        url: '', videoId: meta.videoId, title: meta.title, channel: meta.channel,
        thumbnail: meta.thumbnail, duration: analysis.duration, createdAt: Date.now(),
        options: { type: $('#opt-type', root).value, aspect: $('#opt-aspect', root).value, lang: $('#opt-lang', root).value, count },
        clips,
      };
      upsertProject(project);
      setStep(5, 1);
      toast('Clips ready — real video export enabled!', 'ok');
      setTimeout(() => go(`#/app/results/${project.id}`), 400);
    } catch (err) {
      console.error(err);
      toast(`Upload failed: ${err.message}`, 'err');
      area.innerHTML = '';
    }
  }
  $('#get-clips', root).addEventListener('click', () => {
    const url = $('#url-input', root).value.trim();
    if (!url) return toast('Paste a YouTube link first', 'err');
    start(url);
  });
  $('#url-input', root).addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#get-clips', root).click(); });

  async function start(url) {
    const parsed = parseYouTube(url);
    const resultBox = $('#channel-result');
    if (parsed.kind === 'channel') {
      resultBox.innerHTML = `<div class="channel-video" style="cursor:default"><div><b>Channel link detected</b><div class="small muted">Loading recent videos…</div></div></div>`;
      const ch = await fetchChannelVideos(parsed);
      if (!ch || !ch.videos.length) {
        resultBox.innerHTML = `
          <div class="card" style="padding:16px;margin-top:14px;border-color:rgba(255,184,107,.4)">
            <b>Channel link detected</b>
            <div class="small muted" style="margin:6px 0 12px">We couldn't list this channel's videos automatically (browser restricted the channel page). Paste any single video link from the channel and Ai will clip it.</div>
            <button class="btn btn-sm btn-ghost" id="use-demo-chan">Use demo video instead</button>
          </div>`;
        $('#use-demo-chan', resultBox).addEventListener('click', () => { $('#url-input', root).value = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; start('https://www.youtube.com/watch?v=dQw4w9WgXcQ'); });
        return;
      }
      resultBox.innerHTML = `
        <div class="small muted" style="margin-top:14px"><b style="color:var(--text)">${esc(ch.title)}</b> — pick a video to clip:</div>
        <div class="channel-result">${ch.videos.map((v, i) => `
          <div class="channel-video" data-i="${i}">
            <img src="${esc(v.thumbnail)}" alt="" loading="lazy"/>
            <div><div class="cv-title">${esc(v.title)}</div><div class="cv-meta">${esc(v.channel || '')}</div></div>
          </div>`).join('')}</div>`;
      $$('.channel-video', resultBox).forEach((row) => row.addEventListener('click', () => {
        const v = ch.videos[Number(row.dataset.i)];
        runGeneration({ videoId: v.videoId, title: v.title, channel: v.channel, thumbnail: v.thumbnail, url: watchUrl(v.videoId) }, v.title);
      }));
      return;
    }
    if (parsed.kind !== 'video') {
      toast('That link is not a YouTube video or channel', 'err');
      return;
    }
    runGeneration({ videoId: parsed.id, title: '', channel: '', thumbnail: thumbUrl(parsed.id), url: watchUrl(parsed.id) });
  }

  async function runGeneration(metaSeed, presetTitle) {
    const btn = $('#get-clips', root);
    btn.disabled = true;
    const area = $('#progress-area');
    const steps = ['Fetching video info', 'Reading duration', 'Preparing local source analysis'];
    area.innerHTML = `
      <div class="progress-card">
        <b>${esc(presetTitle || metaSeed.title || 'Your video')}</b>
        <div class="progress-steps">${steps.map((s, i) => `<div class="p-step" data-i="${i}"><span class="dot">${i + 1}</span> ${s}</div>`).join('')}</div>
        <div class="progress-bar"><i id="pbar"></i></div>
      </div>`;
    const stepEls = $$('.p-step', area);
    const setStep = (i) => {
      stepEls.forEach((s, j) => {
        s.classList.toggle('done', j < i);
        s.classList.toggle('active', j === i);
        if (j < i) s.querySelector('.dot').textContent = '✓';
      });
      $('#pbar', area).style.width = `${Math.round((i / steps.length) * 100)}%`;
    };
    setStep(0);

    let meta = metaSeed;
    if (!meta.title || !meta.channel) {
      const fetched = await fetchVideoMeta(meta.videoId);
      meta = { ...fetched, ...metaSeed, title: metaSeed.title || fetched.title, channel: metaSeed.channel || fetched.channel };
    }
    setStep(1);
    const duration = await fetchDuration(meta.videoId);
    if (!duration || duration <= 0) toast('Could not read duration — the local analysis will determine it after download.', '');
    setStep(2);

    const count = Number($('#opt-count', root).value) || 6;
    const transcript = $('#opt-transcript', root).value.trim();

    const project = {
      id: uid('p'),
      url: meta.url,
      videoId: meta.videoId,
      title: meta.title,
      channel: meta.channel,
      thumbnail: meta.thumbnail,
      duration: duration || 600,
      createdAt: Date.now(),
      sourceType: 'youtube',
      userTranscript: transcript,
      captionsSource: transcript ? 'user-transcript' : 'pending',
      options: { type: $('#opt-type', root).value, aspect: $('#opt-aspect', root).value, lang: $('#opt-lang', root).value, count },
      clips: [],
    };
    upsertProject(project);
    $('#pbar', area).style.width = '100%';
    toast('Project ready — download the source to analyze real clip moments.', 'ok');
    setTimeout(() => go(`#/app/results/${project.id}`), 450);
  }
}

async function capturePoster(file) {
  try {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    await new Promise((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('load')); });
    v.currentTime = Math.min(1.5, (v.duration || 2) / 2);
    await new Promise((res) => { v.onseeked = () => res(); });
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = v.videoWidth ? Math.round(640 * (v.videoHeight / v.videoWidth)) : 360;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    return c.toDataURL('image/jpeg', 0.72);
  } catch { return ''; }
}

export async function exportProjectClip(project, clip, onProgress) {
  const media = await getProjectMedia(project.videoId);
  if (!media) throw new Error('ยังไม่มีวิดีโอต้นฉบับ — กด "ดึงวิดีโอ + คำบรรยาย" หรือแนบไฟล์ก่อน');
  const { exportRealClip } = await import('./ffmpeg.js');
  const file = media.video;
  if (!file.name) file.name = `${project.videoId}.mp4`;
  const blob = await exportRealClip({
    file, audioFile: media.audio, clip,
    aspect: clip.aspect || project.options.aspect || '9:16',
    quality: state.settings.renderQuality,
    watermark: clip.watermark || state.settings.watermark || '',
    musicId: clip.music || 'none',
    musicVolume: clip.musicVolume ?? 0.25,
    onProgress,
  });
  downloadBlob(blob, `${safeFilename(clip.hook)}.mp4`);
}

/* ============================== RESULTS ============================== */

export function renderResults(root, projectId) {
  const p = getProject(projectId);
  if (!p) {
    root.innerHTML = `<div class="empty card"><div class="big">🫥</div><h3>Project not found</h3><a class="btn btn-ghost" href="#/app">Back to dashboard</a></div>`;
    return;
  }
  root.innerHTML = `
  <div class="results-bar">
    <button class="btn btn-ghost btn-sm" id="back">← Dashboard</button>
    <div class="grow">
      <div style="font-weight:800">${esc(p.title)}</div>
      <div class="small muted">${esc(p.channel || '')} · ${p.clips.length} clips · ${fmtDate(p.createdAt)}</div>
    </div>
    <button class="btn btn-ghost btn-sm" id="select-all">Select all</button>
    <button class="btn btn-accent btn-sm" id="schedule-sel" disabled>Schedule</button>
    <button class="btn btn-primary btn-sm" id="download-all">Download all</button>
  </div>
  <div id="media-slot"></div>
  <div class="clip-grid" id="clip-grid"></div>`;

  const grid = $('#clip-grid', root);
  const selected = new Set();
  let mediaChecked = false;

  async function refreshMediaSlot() {
    const slot = $('#media-slot', root);
    if (!slot || mediaChecked) return;
    mediaChecked = true;
    let media = null;
    try { media = await getProjectMedia(p.videoId); } catch {}
    if ((!media || !p.analysisSource) && p.sourceType !== 'upload') {
      slot.innerHTML = mediaCtaHtml();
      wireMediaCta(p, slot, { onDone: () => { mediaChecked = false; slot.innerHTML = ''; draw(); } });
    }
  }

  const draw = () => {
    if (!p.clips.length) {
      grid.innerHTML = '<div class="empty card"><div class="big">🎬</div><h3>Source analysis required</h3><p class="muted">Fetch the real video to analyze its audio and motion and create clip candidates.</p></div>';
      return;
    }
    grid.innerHTML = p.clips.map((c) => `
      <div class="clip-card ${selected.has(c.id) ? 'selected' : ''}" data-id="${c.id}">
        <div class="clip-thumb" data-play="${c.id}">
          <img src="${esc(p.thumbnail)}" alt="" loading="lazy"/>
          <span class="sel">${selected.has(c.id) ? '✓' : ''}</span>
          <span class="play"><span>▶</span></span>
          <span class="dur">${fmtTime(c.end - c.start)}</span>
        </div>
        <div class="clip-body">
          <div class="clip-hook">${esc(c.hook)}</div>
          <div class="clip-cap">${esc(c.captions[0]?.text || c.desc)}</div>
          <div class="clip-foot">${scoreRing(c.score)}<span class="small muted">virality score</span></div>
          <div class="clip-actions">
            <button class="btn btn-sm btn-accent" data-edit="${c.id}">Edit</button>
            <button class="btn btn-sm btn-primary" data-mp4="${c.id}">MP4</button>
            <button class="btn btn-sm btn-ghost" data-srt="${c.id}">SRT</button>
            <button class="btn btn-sm btn-ghost" data-cover="${c.id}">Cover</button>
          </div>
        </div>
      </div>`).join('');

    $$('.clip-card', grid).forEach((card) => {
      const id = card.dataset.id;
      const clip = p.clips.find((c) => c.id === id);
      card.querySelector('.clip-thumb').addEventListener('click', (e) => { e.stopPropagation(); openPlayerModal(p, clip); });
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-edit],[data-srt],[data-cover]')) return;
        toggle(id);
      });
      card.querySelector('[data-edit]').addEventListener('click', () => go(`#/app/edit/${p.id}/${clip.id}`));
      card.querySelector('[data-srt]').addEventListener('click', () => { exportSRT(clip, p); toast('SRT downloaded', 'ok'); });
      card.querySelector('[data-cover]').addEventListener('click', async () => { await renderCover(clip, p, state.settings.renderQuality); toast('Cover downloaded', 'ok'); });
      const mp4Btn = card.querySelector('[data-mp4]');
      if (mp4Btn) mp4Btn.addEventListener('click', async () => {
        mp4Btn.disabled = true;
        const old = mp4Btn.textContent;
        mp4Btn.textContent = 'Rendering…';
        try {
          await exportProjectClip(p, clip, (pct) => { mp4Btn.textContent = `${Math.round(pct * 100)}%`; });
          toast('MP4 downloaded', 'ok');
        } catch (err) {
          if (err.message.includes('ยังไม่มีวิดีโอ')) {
            const { openModal } = await import('./ui.js');
            const m = openModal(`<div class="modal-head"><h3>เปิดระบบตัดวิดีโอจริง</h3></div><div class="modal-body">${mediaCtaHtml()}</div>`);
            wireMediaCta(p, m.modal, { onDone: () => { m.close(); draw(); } });
          } else {
            toast(err.message, 'err');
          }
        }
        mp4Btn.disabled = false;
        mp4Btn.textContent = old;
      });
    });
    $('#schedule-sel', root).disabled = selected.size === 0;
    $('#schedule-sel', root).textContent = `Schedule (${selected.size})`;
  };

  const toggle = (id) => {
    selected.has(id) ? selected.delete(id) : selected.add(id);
    draw();
  };

  $('#back', root).addEventListener('click', () => go('#/app'));
  $('#select-all', root).addEventListener('click', () => {
    if (selected.size === p.clips.length) selected.clear(); else p.clips.forEach((c) => selected.add(c.id));
    draw();
  });
  $('#download-all', root).addEventListener('click', () => downloadAll(p));
  refreshMediaSlot();
  $('#schedule-sel', root).addEventListener('click', () => {
    import('./views2.js').then(({ openScheduleModal }) => openScheduleModal(p, [...selected]));
  });

  draw();
}

async function downloadAll(p) {
  const rng = seeded(p.id);
  for (const c of p.clips) {
    exportSRT(c, p);
    exportTXT(c, p);
    await new Promise((r) => setTimeout(r, 350));
  }
  toast(`Downloaded ${p.clips.length} SRT + TXT packages`, 'ok');
  void rng;
}

function openPlayerModal(p, clip) {
  openModal(`
    <div class="modal-head"><h3>${esc(clip.hook)}</h3></div>
    <div class="modal-body">
      <div style="position:relative;aspect-ratio:16/9;background:#000;border-radius:12px;overflow:hidden" id="modal-player"></div>
      <div class="small muted" style="margin-top:10px">${fmtTime(clip.start)} – ${fmtTime(clip.end)} · ${esc(p.title)}</div>
    </div>`, { wide: true });
  const host = document.getElementById('modal-player');
  if (p.sourceType === 'upload') {
    loadMedia(p.videoId).then((file) => {
      if (!file || !host) return;
      const url = URL.createObjectURL(file);
      host.innerHTML = `<video src="${url}" controls autoplay style="width:100%;height:100%"></video>`;
      const v = host.querySelector('video');
      v.addEventListener('loadeddata', () => { v.currentTime = clip.start; });
    });
  } else {
    import('./yt.js').then(({ createPlayer }) => {
      if (host) createPlayer(host, p.videoId, { start: clip.start, end: clip.end, autoplay: true });
    });
  }
}
