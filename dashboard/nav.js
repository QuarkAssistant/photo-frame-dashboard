// v2 navigation model (shared by the dashboard and the tests). Pure, no DOM.
// Nine rail items. Sub-pages light up their parent's rail item and get a Back
// button that returns to that parent. Old hashes (#jp, #photos, #weather…) keep
// working so every v1 link and tile still lands on the same page.

export const NAV_V2 = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'weather', label: 'Weather', icon: 'weatherNav' },
  { id: 'family', label: 'Family', icon: 'people' },
  { id: 'chores', label: 'Chores', icon: 'tasks' },
  { id: 'grocery', label: 'Grocery', icon: 'cart' },
  { id: 'media', label: 'Media', icon: 'media' },
  { id: 'cameras', label: 'Cameras', icon: 'camera' },
  { id: 'settings', label: 'Settings', icon: 'gear', hold: true },
];

export const PERSON_IDS = ['thiago', 'gilmara', 'jp', 'lucas'];

// view: which <section data-view> shows. section: which rail item is lit.
// parent: where Back goes (null = top-level page, no Back button).
const ROUTES = {
  home: { view: 'home', section: 'home', parent: null },
  calendar: { view: 'calendar', section: 'calendar', parent: null },
  'coming-up': { view: 'coming-up', section: 'calendar', parent: 'calendar' },
  trips: { view: 'coming-up', section: 'calendar', parent: 'calendar' },
  weather: { view: 'weather', section: 'weather', parent: null },
  family: { view: 'family', section: 'family', parent: null },
  chores: { view: 'chores', section: 'chores', parent: null },
  grocery: { view: 'grocery', section: 'grocery', parent: null },
  media: { view: 'media', section: 'media', parent: null },
  photos: { view: 'photos', section: 'media', parent: 'media' },
  'long-drift': { view: 'long-drift', section: 'media', parent: 'media' },
  cameras: { view: 'cameras', section: 'cameras', parent: null },
  settings: { view: 'settings', section: 'settings', parent: null },
};

export function routeFor(hash) {
  const key = String(hash || '').replace(/^#/, '').trim().toLowerCase();
  if (PERSON_IDS.includes(key)) return { name: key, view: 'member', section: 'family', parent: 'family', person: key };
  const r = ROUTES[key] || ROUTES.home;
  return { name: ROUTES[key] ? key : 'home', ...r, person: null };
}

// Idle rules (seconds without a touch). Detail pages fall back to Home after 3 min;
// the photo screensaver still starts after 5 min (existing setting).
export const IDLE_HOME_SECONDS = 180;
export const SETTINGS_HOLD_MS = 2000;

export function shouldIdleHome(viewName, idleSeconds, limit = IDLE_HOME_SECONDS) {
  if (!limit || viewName === 'home') return false;
  // Settings is an adult page, and dropping someone mid-change is worse than the clutter.
  if (viewName === 'settings') return false;
  return idleSeconds >= limit;
}

// One flash when a state turns on (e.g. "Leave now"), never a loop. Remembers keys
// it has already flashed; returns true only the first time it sees one.
export function flashOnce(seen, key) {
  if (!key || seen.has(key)) return false;
  seen.add(key);
  if (seen.size > 50) seen.delete(seen.values().next().value);
  return true;
}

// ?ui=v2 opts this browser into the v2 shell. Kept off by default until Thiago
// approves the screenshots, so the frame (no query string) stays on v1.
export function wantsV2(search) {
  const q = new URLSearchParams(search || '');
  return q.get('ui') === 'v2';
}
