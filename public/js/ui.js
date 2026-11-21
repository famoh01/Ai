// Shared UI primitives: modals, score rings, platform chips.

import { $ } from './util.js';

export function openModal(html, { wide = false } = {}) {
  const wrap = $('#modal-wrap');
  wrap.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal" style="${wide ? 'width:min(760px,calc(100vw - 32px))' : ''}">
      <button class="modal-x" aria-label="Close">×</button>
      ${html}
    </div>`;
  wrap.classList.add('open');
  const close = () => { wrap.classList.remove('open'); wrap.innerHTML = ''; };
  wrap.querySelector('.modal-backdrop').addEventListener('click', close);
  wrap.querySelector('.modal-x').addEventListener('click', close);
  wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
  });
  return { close, modal: wrap.querySelector('.modal') };
}

export function confirmDialog(title, body, okLabel = 'Delete', danger = true) {
  return new Promise((resolve) => {
    const { close, modal } = openModal(`
      <div class="modal-head"><h3>${title}</h3></div>
      <div class="modal-body">
        <p class="muted small">${body}</p>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
          <button class="btn btn-ghost" data-a="no">Cancel</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-a="yes">${okLabel}</button>
        </div>
      </div>`);
    modal.querySelector('[data-a="no"]').addEventListener('click', () => { close(); resolve(false); });
    modal.querySelector('[data-a="yes"]').addEventListener('click', () => { close(); resolve(true); });
  });
}

export function scoreRing(score, size = 44) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(100, Math.max(0, score)) / 100);
  const color = score >= 85 ? '#2fd48a' : score >= 70 ? '#7c5cff' : '#ffb86b';
  return `
    <div class="score-ring" style="width:${size}px;height:${size}px" title="Virality score ${score}">
      <svg width="${size}" height="${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="#2a2a40" stroke-width="4" fill="none"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-width="4" fill="none"
          stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/>
      </svg>
      <div class="sr-num">${score}</div>
    </div>`;
}

export const PLATFORMS = [
  { id: 'youtube', label: 'YouTube Shorts', ico: '▶' },
  { id: 'tiktok', label: 'TikTok', ico: '♪' },
  { id: 'instagram', label: 'Instagram Reels', ico: '◎' },
  { id: 'x', label: 'X', ico: '✕' },
];

export function platformChip(id) {
  const p = PLATFORMS.find((x) => x.id === id);
  return p ? `<span class="platform-chip">${p.ico} ${p.label}</span>` : '';
}
