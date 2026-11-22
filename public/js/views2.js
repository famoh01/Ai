// Automation, rewards, analytics, pricing and settings + the schedule modal.

import { $, $$, el, esc, fmtDate, fmtNum, fmtTime, toast, uid, seeded, safeFilename } from './util.js';
import { state, save, getProject } from './store.js';
import { openModal, PLATFORMS, platformChip } from './ui.js';
import { go } from './views.js';

/* ============================== SCHEDULE MODAL ============================== */

export function openScheduleModal(project, clipIds) {
  const clips = project.clips.filter((c) => clipIds.includes(c.id));
  if (!clips.length) return toast('No clips selected', 'err');
  const when = new Date(Date.now() + 60 * 60 * 1000);
  const dateStr = when.toISOString().slice(0, 10);
  const timeStr = when.toTimeString().slice(0, 5);

  const { close, modal } = openModal(`
    <div class="modal-head"><h3>Schedule ${clips.length} clip${clips.length === 1 ? '' : 's'}</h3></div>
    <div class="modal-body">
      <div class="small muted" style="margin-bottom:14px">${esc(project.title)}</div>
      <label class="field"><span>Platforms</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap" id="sch-plats">
          ${PLATFORMS.map((p) => `<span class="chip" data-p="${p.id}">${p.ico} ${p.label}</span>`).join('')}
        </div>
      </label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <label class="field"><span>Date</span><input type="date" class="input" id="sch-date" value="${dateStr}"/></label>
        <label class="field"><span>Time</span><input type="time" class="input" id="sch-time" value="${timeStr}"/></label>
      </div>
      <label class="field"><span>Default caption</span><input class="input" id="sch-cap" value="${esc(clips[0].hook)}"/></label>
      <button class="btn btn-primary btn-block btn-lg" id="sch-save">Add to schedule</button>
    </div>`, { wide: false });

  const plats = new Set(['youtube']);
  $$('#sch-plats .chip', modal).forEach((chip) => chip.addEventListener('click', () => {
    const id = chip.dataset.p;
    plats.has(id) ? plats.delete(id) : plats.add(id);
    chip.classList.toggle('on', plats.has(id));
  }));
  $$('#sch-plats .chip', modal).forEach((c) => { if (plats.has(c.dataset.p)) c.classList.add('on'); });

  $('#sch-save', modal).addEventListener('click', () => {
    const ts = new Date(`${$('#sch-date', modal).value}T${$('#sch-time', modal).value}`).getTime();
    if (!Number.isFinite(ts)) return toast('Pick a valid date and time', 'err');
    for (const clip of clips) {
      state.queue.push({
        id: uid('q'),
        projectId: project.id,
        clipId: clip.id,
        platforms: [...plats],
        ts,
        caption: $('#sch-cap', modal).value,
        status: 'scheduled',
        createdAt: Date.now(),
      });
    }
    save();
    close();
    toast(`Scheduled ${clips.length} clip${clips.length === 1 ? '' : 's'}`, 'ok');
    if (window.location.hash.includes('/edit/')) go('#/app/automation');
  });
}

/* ============================== AUTOMATION ============================== */

export function renderAutomation(root) {
  const auto = state.automation;
  root.innerHTML = `
  <h1 class="page-title">Channel Automation</h1>
  <p class="page-sub">Ai watches your YouTube channel 24/7, AI-clips new uploads and auto-posts to your accounts.</p>

  <div class="auto-card">
    <h3 style="margin:0 0 4px">Connect your channel</h3>
    <p class="muted small" style="margin:0 0 14px">Paste your YouTube channel URL. That's it.</p>
    <div class="url-row" style="display:flex;gap:10px">
      <input class="input" id="auto-url" placeholder="https://youtube.com/@yourchannel" value="${esc(auto?.channelUrl || '')}" spellcheck="false"/>
      <button class="btn btn-primary" id="auto-save">Watch channel</button>
    </div>
    ${auto ? `<div class="small" style="margin-top:12px"><span class="badge badge-good">● watching ${esc(auto.channelTitle || auto.channelUrl)}</span> <span class="muted">connected ${fmtDate(auto.createdAt)}</span></div>` : ''}
  </div>

  <div class="auto-card">
    <h3 style="margin:0 0 6px">How it works</h3>
    ${[
      ['Connect channel', 'Paste your YouTube channel URL. Ai resolves it and starts watching.'],
      ['Detect', 'New uploads are detected around the clock — no refresh needed.'],
      ['AI clip', 'Every upload is scored for viral moments and cut into Shorts-ready clips.'],
      ['Auto-post', 'Qualifying clips post to your connected TikTok, YouTube, Reels and X.'],
      ['Earn', 'Monetize with Clip Rewards — $1 per 1K verified views.'],
    ].map(([t, d], i) => `
      <div class="auto-step"><div class="n">${i + 1}</div><div><b>${t}</b><p>${d}</p></div></div>`).join('')}
  </div>

  <div class="auto-card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div><h3 style="margin:0 0 4px">Connected accounts</h3><p class="muted small" style="margin:0">Auto-post destinations.</p></div>
    </div>
    <div style="display:grid;gap:10px;margin-top:14px">
      ${PLATFORMS.map((p) => `
        <div class="setting-row">
          <div class="lbl"><b>${p.ico} ${p.label}</b><span>${state.accounts[p.id] ? 'Connected as @yourhandle' : 'Not connected'}</span></div>
          <button class="btn btn-sm ${state.accounts[p.id] ? 'btn-ghost' : 'btn-accent'}" data-acc="${p.id}">${state.accounts[p.id] ? 'Disconnect' : 'Connect'}</button>
        </div>`).join('')}
    </div>
  </div>

  <div class="section-head"><h3>Schedule queue</h3><span class="small muted">${state.queue.length} post${state.queue.length === 1 ? '' : 's'}</span></div>
  <div id="queue-wrap"></div>`;

  $('#auto-save', root).addEventListener('click', () => {
    const url = $('#auto-url', root).value.trim();
    if (!url.includes('youtube.com') && !url.includes('youtu.be')) return toast('Paste a YouTube channel URL', 'err');
    const m = url.match(/@([\w.-]+)|channel\/(UC[\w-]+)/);
    state.automation = { channelUrl: url, channelTitle: m ? (m[1] ? `@${m[1]}` : m[2]) : url, createdAt: Date.now(), autoPost: true };
    save();
    toast('Channel connected — Ai is watching', 'ok');
    renderAutomation(root);
  });

  $$('[data-acc]', root).forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.acc;
    state.accounts[id] = !state.accounts[id];
    save();
    toast(state.accounts[id] ? `Connected ${id}` : `Disconnected ${id}`, state.accounts[id] ? 'ok' : '');
    renderAutomation(root);
  }));

  const wrap = $('#queue-wrap', root);
  if (!state.queue.length) {
    wrap.innerHTML = `<div class="empty card"><div class="big">🗓️</div><h3>Nothing scheduled</h3><p>Select clips in your project and hit Schedule.</p></div>`;
    return;
  }
  const sorted = [...state.queue].sort((a, b) => a.ts - b.ts);
  wrap.innerHTML = sorted.map((q) => {
    const p = getProject(q.projectId);
    const clip = p?.clips.find((c) => c.id === q.clipId);
    if (!p || !clip) return '';
    return `
    <div class="sched-item">
      <img src="${esc(p.thumbnail)}" alt=""/>
      <div class="si-body">
        <div class="si-title">${esc(clip.hook)}</div>
        <div class="si-meta">${new Date(q.ts).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${fmtTime(clip.end - clip.start)} · ${esc(p.channel || '')}</div>
        <div style="margin-top:7px;display:flex;gap:6px;flex-wrap:wrap">${q.platforms.map(platformChip).join('')}</div>
      </div>
      <span class="badge badge-good">${esc(q.status)}</span>
      <button class="btn btn-sm btn-danger" data-cancel="${q.id}">Cancel</button>
    </div>`;
  }).join('');
  $$('[data-cancel]', wrap).forEach((b) => b.addEventListener('click', () => {
    state.queue = state.queue.filter((q) => q.id !== b.dataset.cancel);
    save();
    renderAutomation(root);
  }));
}

/* ============================== REWARDS ============================== */

const CAMPAIGNS = [
  { id: 'boossoo', title: 'BOOSSOO Art: Roast Me With Memes', creator: 'Boossoo', cpm: 1, clips: 354, left: '$67.51', thumb: 'https://picsum.photos/seed/boossoo/640/360' },
  { id: 'm3', title: 'The M3 Podcast Clipping | $1 CPM', creator: 'The M3 Podcast', cpm: 1, clips: 229, left: '$60.41', thumb: 'https://picsum.photos/seed/m3/640/360' },
  { id: 'wine', title: 'The Best 5 Minute Wine Podcast: Victoria Pelletier | $1 CPM', creator: 'The Best 5 Minute Wine Podcast', cpm: 1, clips: 313, left: '$69.80', thumb: 'https://picsum.photos/seed/wine/640/360' },
  { id: 'bfs', title: 'Built for Success Podcast Clipping', creator: 'Built For Success', cpm: 1, clips: 255, left: '$49.72', thumb: 'https://picsum.photos/seed/bfs/640/360' },
  { id: 'tech', title: 'TechDaily: AI News in 60 Seconds', creator: 'TechDaily', cpm: 1, clips: 187, left: '$82.10', thumb: 'https://picsum.photos/seed/techdaily/640/360' },
  { id: 'fit', title: 'FitTalk: 15-Minute Home Workouts', creator: 'FitTalk', cpm: 1, clips: 402, left: '$38.44', thumb: 'https://picsum.photos/seed/fittalk/640/360' },
];

export function renderRewards(root) {
  root.innerHTML = `
  <h1 class="page-title">Clip Rewards</h1>
  <p class="page-sub">Creators pay clippers to spread their videos. Earn <b style="color:var(--text)">$1 per 1K verified views</b> — no copyright risk.</p>
  <div class="stat-cards">
    <div class="stat-card"><b>$${(state.rewardsJoined.length * 1.37).toFixed(2)}</b><span>estimated earnings</span></div>
    <div class="stat-card"><b>${state.rewardsJoined.length}</b><span>campaigns joined</span></div>
    <div class="stat-card"><b>$1</b><span>per 1K verified views</span></div>
  </div>
  <div class="reward-grid">
    ${CAMPAIGNS.map((c) => {
      const joined = state.rewardsJoined.includes(c.id);
      return `
      <div class="reward-card">
        <div class="r-thumb">
          <img src="${c.thumb}" alt="" loading="lazy" onerror="this.style.display='none'"/>
          <span class="cpm badge badge-grad">$${c.cpm}/1K views</span>
        </div>
        <div class="r-body">
          <div class="r-title">${esc(c.title)}</div>
          <div class="r-meta">${esc(c.creator)} · ${c.clips} clips made</div>
          <div class="progress-line2"><i style="width:${Math.min(90, c.clips / 4.5)}%"></i></div>
          <div class="small" style="margin:10px 0 12px"><span class="muted">${c.left} left</span></div>
          <button class="btn btn-sm ${joined ? 'btn-ghost' : 'btn-accent'} btn-block" data-join="${c.id}">${joined ? '✓ Joined — make clips' : 'Join campaign'}</button>
        </div>
      </div>`;
    }).join('')}
  </div>`;

  $$('[data-join]', root).forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.join;
    if (state.rewardsJoined.includes(id)) { go('#/app'); return; }
    state.rewardsJoined.push(id);
    save();
    toast('Campaign joined! Paste the channel link to start clipping.', 'ok');
    renderRewards(root);
  }));
}

/* ============================== ANALYTICS ============================== */

export function renderAnalytics(root) {
  const allClips = state.projects.flatMap((p) => p.clips.map((c) => ({ ...c, project: p })));
  const withViews = allClips.map((c) => {
    const r = seeded(`views:${c.id}`)();
    const views = c.views || Math.round(r * (c.score || 70) * 180);
    return { ...c, views };
  });
  const totalViews = withViews.reduce((s, c) => s + c.views, 0);
  const scheduled = state.queue.length;

  root.innerHTML = `
  <h1 class="page-title">Analytics</h1>
  <p class="page-sub">Performance across your clips and scheduled posts.</p>
  <div class="stat-cards">
    <div class="stat-card"><b>${fmtNum(totalViews)}</b><span>total views</span></div>
    <div class="stat-card"><b>${allClips.length}</b><span>clips created</span></div>
    <div class="stat-card"><b>${scheduled}</b><span>scheduled posts</span></div>
    <div class="stat-card"><b>${state.projects.length}</b><span>projects</span></div>
  </div>
  <div class="chart-card"><h4>Views per clip</h4><canvas id="chart-views" width="900" height="220"></canvas></div>
  <div class="chart-card"><h4>Views — last 14 days</h4><canvas id="chart-days" width="900" height="220"></canvas></div>`;

  drawBars($('#chart-views', root), withViews.slice(0, 10).map((c) => ({ label: `${c.hook.slice(0, 18)}…`, value: c.views })));
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const r = seeded(`day:${d.toISOString().slice(0, 10)}`)();
    days.push({ label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), value: Math.round(r * totalViews * 0.18 + 40) });
  }
  drawLine($('#chart-days', root), days);
}

function drawBars(canvas, data) {
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!data.length) return emptyChart(ctx, W, H);
  const max = Math.max(...data.map((d) => d.value), 1);
  const bw = W / data.length;
  data.forEach((d, i) => {
    const h = (d.value / max) * (H - 40);
    const x = i * bw + bw * 0.18;
    const y = H - 24 - h;
    const g = ctx.createLinearGradient(0, y, 0, H - 24);
    g.addColorStop(0, '#7c5cff'); g.addColorStop(1, '#00d4ff');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, y, bw * 0.64, h, 6);
    ctx.fill();
    ctx.fillStyle = '#9a97b8';
    ctx.font = '11px Inter, Arial';
    ctx.textAlign = 'center';
    ctx.fillText(d.label, i * bw + bw / 2, H - 8);
    ctx.fillText(fmtNum(d.value), i * bw + bw / 2, y - 6);
  });
}

function drawLine(canvas, data) {
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!data.length) return emptyChart(ctx, W, H);
  const max = Math.max(...data.map((d) => d.value), 1);
  const pts = data.map((d, i) => ({ x: (i / (data.length - 1)) * (W - 30) + 15, y: H - 30 - (d.value / max) * (H - 60) }));
  ctx.strokeStyle = 'rgba(124,92,255,.25)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.stroke();
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, '#7c5cff'); grad.addColorStop(1, '#00d4ff');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 3;
  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.stroke();
  ctx.fillStyle = '#eceaf6';
  pts.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = '#9a97b8';
  ctx.font = '11px Inter, Arial';
  ctx.textAlign = 'center';
  data.forEach((d, i) => { if (i % 2 === 0) ctx.fillText(d.label, pts[i].x, H - 10); });
}

function emptyChart(ctx, W, H) {
  ctx.fillStyle = '#6d6b8c';
  ctx.font = '14px Inter, Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Create clips to see analytics', W / 2, H / 2);
}

/* ============================== PRICING (app) ============================== */

export function renderPricing(root) {
  root.innerHTML = `
  <h1 class="page-title">Owner access</h1>
  <p class="page-sub">You own this Ai copy. No subscription, payment, or credit top-up is required.</p>
  <div class="card" style="max-width:720px;padding:28px">
    <div class="badge badge-grad" style="display:inline-flex;margin-bottom:12px">OWNER · UNLIMITED</div>
    <h2 style="margin:0 0 8px">All local clip tools are unlocked</h2>
    <p class="muted">Create and export clips without credit limits. Your projects and source files are stored in this browser.</p>
    <p class="small muted">No payment processor is connected to this site. Social publishing still requires separate platform API/OAuth setup.</p>
    <button class="btn btn-primary" id="owner-back">Back to dashboard</button>
  </div>`;
  $('#owner-back', root).addEventListener('click', () => go('#/app'));
}

/* ============================== SETTINGS MODAL ============================== */

export function openSettingsModal() {
  const { close, modal } = openModal(`
    <div class="modal-head"><h3>Settings</h3></div>
    <div class="modal-body">
      <label class="field"><span>Display name</span><input class="input" id="set-name" value="${esc(state.user?.name || '')}"/></label>
      <label class="field"><span>Email</span><input class="input" id="set-email" value="${esc(state.user?.email || '')}"/></label>
      <label class="field"><span>Default watermark</span><input class="input" id="set-wm" value="${esc(state.settings.watermark || '')}" placeholder="@yourhandle"/></label>
      <div class="setting-row">
        <div class="lbl"><b>Render quality</b><span>Preview videos &amp; covers</span></div>
        <div class="seg" id="set-q">
          <button data-a="720" class="${state.settings.renderQuality === '720' ? 'on' : ''}">720p</button>
          <button data-a="1080" class="${state.settings.renderQuality === '1080' ? 'on' : ''}">1080p</button>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap">
        <button class="btn btn-primary" id="set-save">Save</button>
        <button class="btn btn-ghost" id="set-signout">Sign out</button>
        <button class="btn btn-danger" id="set-reset">Reset all data</button>
      </div>
    </div>`);

  $$('#set-q button', modal).forEach((b) => b.addEventListener('click', () => {
    state.settings.renderQuality = b.dataset.a; save();
    $$('#set-q button', modal).forEach((x) => x.classList.toggle('on', x === b));
  }));
  $('#set-save', modal).addEventListener('click', () => {
    state.user = { ...(state.user || {}), name: $('#set-name', modal).value.trim() || 'Guest', email: $('#set-email', modal).value.trim() };
    state.settings.watermark = $('#set-wm', modal).value.trim();
    save();
    close();
    toast('Settings saved', 'ok');
    window.location.reload();
  });
  $('#set-signout', modal).addEventListener('click', () => {
    state.user = null; save(); close(); go('#/login');
  });
  $('#set-reset', modal).addEventListener('click', async () => {
    const { confirmDialog } = await import('./ui.js');
    const ok = await confirmDialog('Reset all data?', 'This deletes every project, clip, schedule and setting stored in this browser.', 'Reset everything');
    if (ok) { const m = await import('./store.js'); m.resetAll(); close(); window.location.reload(); }
  });
}
