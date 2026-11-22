// Local persistence layer (localStorage). Everything the app needs survives reloads.

const KEY = 'ai_app_v1';

const DEFAULTS = {
  user: { name: 'Guest', email: '', guest: true }, // anonymous local workspace; no login required
  credits: -1,         // -1 means unlimited owner access
  plan: 'Owner',
  billing: 'monthly',
  projects: [],        // see gen.js for project/clip shape
  queue: [],           // scheduled posts
  accounts: { tiktok: false, youtube: false, instagram: false, x: false },
  rewardsJoined: [],
  automation: null,    // { channelUrl, channelTitle, autoPost, createdAt }
  settings: { renderQuality: '1080', language: 'en', watermark: '@' },
  seq: 1,
};

export const state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const data = JSON.parse(raw);
    // This deployed copy belongs to its owner: migrate old demo-plan state and
    // never expose simulated credit limits or paid subscription gates.
    return { ...structuredClone(DEFAULTS), ...data, user: data.user || structuredClone(DEFAULTS.user), plan: 'Owner', credits: -1, settings: { ...DEFAULTS.settings, ...(data.settings || {}) } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function save() {
  state.plan = 'Owner';
  state.credits = -1;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full/blocked */ }
}

export function resetAll() {
  localStorage.removeItem(KEY);
  Object.assign(state, structuredClone(DEFAULTS));
  save();
}

export function nextId(prefix) {
  const n = state.seq++;
  save();
  return `${prefix}${n.toString(36)}`;
}

export function addCredits(_n) {
  // Retained for compatibility with older UI code; owner access is unlimited.
  state.credits = -1;
  save();
}

export function spendCredit() {
  // No billing or credit gate in this owner-operated copy.
  state.credits = -1;
  save();
  return true;
}

export function getProject(id) {
  return state.projects.find((p) => p.id === id);
}

export function getClip(projectId, clipId) {
  const p = getProject(projectId);
  return p ? p.clips.find((c) => c.id === clipId) : null;
}

export function upsertProject(project) {
  const i = state.projects.findIndex((p) => p.id === project.id);
  if (i >= 0) state.projects[i] = project; else state.projects.unshift(project);
  save();
}

export function deleteProject(id) {
  state.projects = state.projects.filter((p) => p.id !== id);
  save();
}
