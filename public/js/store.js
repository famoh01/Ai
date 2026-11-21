// Local persistence layer (localStorage). Everything the app needs survives reloads.

const KEY = 'ai_app_v1';

const DEFAULTS = {
  user: null,          // { name, email, guest }
  credits: 12,
  plan: 'Free',
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
    return { ...structuredClone(DEFAULTS), ...data, settings: { ...DEFAULTS.settings, ...(data.settings || {}) } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function save() {
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

export function addCredits(n) {
  state.credits = Math.max(0, (state.credits || 0) + n);
  save();
}

export function spendCredit() {
  if (state.credits <= 0) return false;
  state.credits -= 1;
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
