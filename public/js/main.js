// App bootstrap, router and shell.

import { $, el, esc } from './util.js';
import { state, save } from './store.js';
import { renderLanding, renderLogin, renderDashboard, renderResults, go } from './views.js';
import { renderEditor } from './editor.js';
import { renderAutomation, renderRewards, renderAnalytics, renderPricing, openSettingsModal } from './views2.js';

const NAV = [
  { hash: '#/app', label: 'Dashboard', ico: '▤', match: (h) => h === '#/app' || h.startsWith('#/app?') },
  { hash: '#/app/automation', label: 'Automation', ico: '↻', match: (h) => h.startsWith('#/app/automation') },
  { hash: '#/app/rewards', label: 'Rewards', ico: '★', match: (h) => h.startsWith('#/app/rewards') },
  { hash: '#/app/analytics', label: 'Analytics', ico: '◔', match: (h) => h.startsWith('#/app/analytics') },
  { hash: '#/app/pricing', label: 'Pricing', ico: '◈', match: (h) => h.startsWith('#/app/pricing') },
];

const TITLES = [
  { match: (h) => h.startsWith('#/app/edit/'), title: 'Clip editor' },
  { match: (h) => h.startsWith('#/app/results/'), title: 'Your clips' },
  { match: (h) => h.startsWith('#/app/automation'), title: 'Automation' },
  { match: (h) => h.startsWith('#/app/rewards'), title: 'Rewards' },
  { match: (h) => h.startsWith('#/app/analytics'), title: 'Analytics' },
  { match: (h) => h.startsWith('#/app/pricing'), title: 'Pricing' },
  { match: () => true, title: 'Dashboard' },
];

function buildShell(activeHash) {
  const shell = el(`
  <div class="app-shell">
    <aside class="sidebar" id="sidebar">
      <div class="side-logo"><span class="logo-mark">Ai</span> Ai</div>
      <div class="credits-pill">∞ <b>Unlimited</b> <span class="muted small">owner access</span></div>
      <nav id="side-nav"></nav>
      <div class="side-bottom">
        <button class="side-item" data-nav="#/login" id="side-user"><span class="ico">◎</span> <span id="side-user-name">${esc(state.user?.name || 'Guest')}</span></button>
        <button class="side-item" id="side-settings"><span class="ico">⚙</span> Settings</button>
      </div>
    </aside>
    <div class="main-col">
      <div class="topbar">
        <button class="icon-btn" id="menu-btn" style="display:none">☰</button>
        <div class="crumb" id="crumb">Dashboard</div>
        <div class="spacer"></div>
        <button class="btn btn-ghost btn-sm" id="top-credits">∞ Owner · Unlimited</button>
        <div class="avatar" id="avatar" title="Account">${esc((state.user?.name || 'G').slice(0, 1).toUpperCase())}</div>
      </div>
      <div class="content" id="view"></div>
    </div>
  </div>`);

  const nav = $('#side-nav', shell);
  NAV.forEach((n) => {
    const b = el(`<button class="side-item ${n.match(activeHash) ? 'on' : ''}" data-nav="${n.hash}"><span class="ico">${n.ico}</span> ${n.label}</button>`);
    b.addEventListener('click', () => { go(n.hash); closeSidebar(); });
    nav.appendChild(b);
  });
  $$('[data-nav]', shell).forEach((b) => b.addEventListener('click', () => { if (b.id === 'side-user') go('#/login'); }));
  $('#side-settings', shell).addEventListener('click', () => openSettingsModal());
  $('#avatar', shell).addEventListener('click', () => openSettingsModal());
  $('#top-credits', shell).addEventListener('click', () => go('#/app/pricing'));
  $('#menu-btn', shell).addEventListener('click', () => $('#sidebar', shell).classList.toggle('open'));
  $('#crumb', shell).textContent = (TITLES.find((t) => t.match(activeHash)) || {}).title || 'Dashboard';
  return shell;
}

function closeSidebar() {
  const s = document.getElementById('sidebar');
  if (s) s.classList.remove('open');
}

function $$ (sel, root = document) { return [...root.querySelectorAll(sel)]; }

async function render() {
  const hash = window.location.hash || '#/';
  const app = document.getElementById('app');
  document.title = 'Ai — AI Clip Maker';

  // destroy any leftover editor player
  window.dispatchEvent(new Event('ai:route-change'));

  if (hash.startsWith('#/app')) {
    if (!state.user) { renderLogin(app, hash); return; }
    const shell = buildShell(hash);
    app.innerHTML = '';
    app.appendChild(shell);
    const view = $('#view', shell);
    const menuBtn = $('#menu-btn', shell);

    if (hash === '#/app' || hash.startsWith('#/app?')) renderDashboard(view);
    else if (hash.startsWith('#/app/results/')) renderResults(view, hash.split('/')[3]);
    else if (hash.startsWith('#/app/edit/')) {
      view.classList.add('flush');
      view.style.padding = '0';
      view.style.maxWidth = 'none';
      await renderEditor(view, hash.split('/')[3], hash.split('/')[4]);
    }
    else if (hash.startsWith('#/app/automation')) renderAutomation(view);
    else if (hash.startsWith('#/app/rewards')) renderRewards(view);
    else if (hash.startsWith('#/app/analytics')) renderAnalytics(view);
    else if (hash.startsWith('#/app/pricing')) renderPricing(view);
    else renderDashboard(view);

    // mobile menu visibility
    const mq = window.matchMedia('(max-width: 860px)');
    const applyMq = () => { menuBtn.style.display = mq.matches ? '' : 'none'; };
    applyMq();
    mq.addEventListener?.('change', applyMq);
    return;
  }

  app.innerHTML = '';
  if (hash === '#/login' || hash === '#/signup') renderLogin(app, '#/app');
  else renderLanding(app);
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);
if (document.readyState !== 'loading') render();
