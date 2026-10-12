import { mockCalendar, mockWeather, ROUTINES, seedStore } from '../mock.js';

const seedPhotos = [
  { id: 'garden', url: '/placeholders/garden.svg', caption: 'Garden' },
  { id: 'evening', url: '/placeholders/evening.svg', caption: 'Evening' },
  { id: 'home', url: '/placeholders/table.svg', caption: 'Home' },
];

export const state = {
  events: [],
  weather: null,
  chores: [],
  groceries: [],
  homework: [],
  photos: seedPhotos.slice(),
  routines: ROUTINES,
  calendarSource: 'mock',
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); }
function emit() { listeners.forEach((fn) => fn()); }

function applySeed() {
  const seed = seedStore();
  state.events = mockCalendar();
  state.weather = mockWeather();
  state.chores = seed.chores;
  state.groceries = seed.groceries;
  state.homework = seed.homework;
  state.photos = seedPhotos.slice();
  state.calendarSource = 'mock';
}

async function get(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export async function refreshAll() {
  const results = await Promise.allSettled([
    get('/api/calendar'),
    get('/api/weather'),
    get('/api/chores'),
    get('/api/groceries'),
    get('/api/homework'),
    get('/api/photos'),
  ]);
  if (results.every((r) => r.status === 'rejected')) {
    if (!state.events.length) applySeed();
    emit();
    return;
  }
  const [cal, wx, ch, gr, hw, ph] = results;
  if (cal.status === 'fulfilled') {
    state.events = cal.value.events || [];
    state.calendarSource = cal.value.source || 'icloud';
  } else if (!state.events.length) {
    state.events = mockCalendar();
    state.calendarSource = 'mock';
  }
  if (wx.status === 'fulfilled') state.weather = wx.value;
  else if (!state.weather) state.weather = mockWeather();
  if (ch.status === 'fulfilled') {
    state.chores = ch.value.chores || [];
    if (ch.value.routines) state.routines = ch.value.routines;
  } else if (!state.chores.length) state.chores = seedStore().chores;
  if (gr.status === 'fulfilled') state.groceries = gr.value.groceries || [];
  else if (!state.groceries.length) state.groceries = seedStore().groceries;
  if (hw.status === 'fulfilled') state.homework = hw.value.homework || [];
  else if (!state.homework.length) state.homework = seedStore().homework;
  if (ph.status === 'fulfilled' && ph.value.photos) state.photos = ph.value.photos;
  emit();
}

export async function refreshLists() {
  const [ch, gr, hw] = await Promise.allSettled([
    get('/api/chores'), get('/api/groceries'), get('/api/homework'),
  ]);
  if (ch.status === 'fulfilled') state.chores = ch.value.chores || state.chores;
  if (gr.status === 'fulfilled') state.groceries = gr.value.groceries || state.groceries;
  if (hw.status === 'fulfilled') state.homework = hw.value.homework || state.homework;
  emit();
}

export async function toggleChore(id) {
  const item = state.chores.find((c) => c.id === id);
  if (!item) return;
  const done = !item.done;
  item.done = done;
  emit();
  try {
    const data = await post('/api/chores', { id, done });
    state.chores = data.chores;
    emit();
  } catch { /* optimistic value stays */ }
}

export async function toggleHomework(id) {
  const item = state.homework.find((h) => h.id === id);
  if (!item) return;
  const done = !item.done;
  item.done = done;
  emit();
  try {
    const data = await post('/api/homework', { id, done });
    state.homework = data.homework;
    emit();
  } catch { /* keep optimistic */ }
}

export async function groceryAction(body) {
  try {
    const data = await post('/api/groceries', body);
    state.groceries = data.groceries;
    emit();
  } catch {
    emit();
  }
}
