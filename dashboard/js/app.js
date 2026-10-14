import { BRAND, FAMILY } from '../family.js';
import { routineForHour } from '../mock.js';
import {
  DEFAULT_NIGHT_END, DEFAULT_NIGHT_START, inNightWindow, NIGHT_DRIFT_MINUTES, NIGHT_WAKE_MS,
  nightAnchor, parseClockMinutes,
} from '../night.js';
import { parts, ymd } from '../time.js';
import { refreshAll, refreshLists, state, subscribe } from './data.js';
import { icon } from './icons.js';
import { createSlides } from './slides.js';
import {
  avatar, clockBits, dayParts, esc, eventTitle, formatRange, formatTime, nextUp, onDay, owner, pstyle, relDay,
} from './ui.js';

const views = {};
let current = 'home';
let memberId = null;
let lastMin = -1;
let idle = 0;
// ?saver= wins (screenshots); else the Settings choice (0 = off); else 5 min.
function saverIdle() {
  const q = Number(pageParams0().get('saver'));
  if (q) return q;
  const v = localStorage.getItem('coelho.saverSeconds');
  return v == null ? 300 : (Number(v) || Infinity);
}
function pageParams0() { return new URLSearchParams(location.search); }
// New layout is default; ?layout=v1 restores the original Home.
if (pageParams0().get('layout') !== 'v1') document.documentElement.className += ' layout-v2';
let saverOpen = false;
let themeFn = null;
let nightOpen = false;
let nightSlot = null;
let wakeUntil = 0;
let nightStartMin = parseClockMinutes(DEFAULT_NIGHT_START, 23 * 60);
let nightEndMin = parseClockMinutes(DEFAULT_NIGHT_END, 6 * 60);
const pageParams = new URLSearchParams(location.search);
const nightOff = pageParams.get('night') === 'off';
const nowParam = pageParams.get('now');
const nowOverride = nowParam && !Number.isNaN(new Date(nowParam).getTime()) ? new Date(nowParam).getTime() : null;

export function register(name, view) { views[name] = view; }
export function now() { return nowOverride == null ? new Date() : new Date(nowOverride); }
export function member() { return memberId ? FAMILY.find((p) => p.id === memberId) : null; }
export { icon, state };

export function go(name) {
  const person = FAMILY.find((p) => p.id === name);
  const viewName = person ? 'member' : (views[name] ? name : 'home');
  memberId = person ? person.id : null;
  current = viewName;
  document.querySelectorAll('.view').forEach((v) => {
    v.classList.toggle('is-active', v.dataset.view === viewName);
  });
  document.querySelectorAll('.rail-item').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.go === (person ? person.id : viewName));
  });
  const el = document.getElementById(`view-${viewName}`);
  if (views[viewName] && el) views[viewName].show(el);
  const hash = person ? person.id : viewName;
  if (location.hash !== `#${hash}`) {
    history.replaceState(null, '', `${location.pathname}${location.search}#${hash}`);
  }
}

export function rerender() {
  const el = document.getElementById(`view-${current}`);
  if (el && views[current]) views[current].show(el);
  if (saverOpen) paintSaver();
}

function clockHtml(date) {
  const c = clockBits(date);
  const dp = dayParts(ymd(date));
  return `<div class="h-time num">${c.h}:${c.m}<span class="h-ampm">${c.ap}</span></div>` +
    `<div class="h-date"><b>${esc(dp.weekday)}</b> <i>${esc(dp.month)} ${esc(dp.day)}</i></div>`;
}

function rail() {
  const item = (goTo, ic, label) =>
    `<button class="rail-item" type="button" data-go="${goTo}">${icon(ic, 22)}<span>${label}</span></button>`;
  const people = FAMILY.map((p) =>
    `<button class="rail-item rail-person" type="button" data-go="${p.id}" style="${pstyle(p)}">${avatar(p)}<span>${esc(p.name)}</span></button>`
  ).join('');
  document.getElementById('rail').innerHTML =
    `<div class="rail-brand"><img src="/emblem.png" alt=""><span>${esc(BRAND)}</span></div>` +
    item('home', 'home', 'Today') +
    item('calendar', 'calendar', 'Calendar') +
    item('chores', 'tasks', 'Chores') +
    item('grocery', 'cart', 'Grocery') +
    people +
    item('settings', 'gear', 'Settings') +
    `<div class="rail-clock" data-railclock></div>`;
}

export function openEvent(id) {
  const ev = state.events.find((e) => e.id === id);
  if (!ev) return;
  const p = owner(ev);
  const when = ev.allDay
    ? `${relDay(ev.start)} · All day`
    : `${relDay(ymd(new Date(ev.start)))} · ${formatRange(ev.start, ev.end)}`;
  const who = ev.everyone ? 'Everyone' : ev.people.map((pid) => FAMILY.find((m) => m.id === pid)?.name || pid).join(' + ');
  const layer = document.getElementById('sheetLayer');
  layer.innerHTML =
    `<div class="sheet-scrim" data-close></div>` +
    `<div class="sheet" style="${pstyle(p)}">` +
    `<button class="sheet-x" type="button" data-close aria-label="Close">${icon('x', 26)}</button>` +
    `<div class="sheet-pad"><div class="sheet-who">${esc(who)}</div>` +
    `<h2 class="serif sheet-h">${esc(eventTitle(ev))}</h2>` +
    `<p class="sheet-p">${esc(when)}</p>` +
    (ev.location ? `<p class="sheet-loc">${esc(ev.location)}</p>` : '') +
    `</div></div>`;
  layer.classList.add('is-open');
  layer.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', closeSheet);
  });
}

function closeSheet() {
  const layer = document.getElementById('sheetLayer');
  layer.classList.remove('is-open');
  layer.innerHTML = '';
}

let saverSlides = null;

function saverHasPhotos() {
  return state.photoSource === 'folder' && state.photos.length > 0;
}

function saverWx() {
  const w = state.weather;
  if (!w) return '';
  const c = w.tempC != null ? Math.round(w.tempC) : Math.round((w.temp - 32) * 5 / 9);
  return `<div class="saver-wx num">${Math.round(w.temp)} °F <i>/</i> ${c} °C · ${esc(w.label || '')}</div>`;
}

function paintSaver() {
  const n = now();
  const c = clockBits(n);
  const dp = dayParts(ymd(n));
  const el = document.getElementById('saver');
  if (saverHasPhotos()) {
    if (!el.classList.contains('is-photos')) {
      el.classList.add('is-photos');
      el.innerHTML = '<div class="saver-photos"></div><div class="saver-hud"></div>';
      saverSlides = createSlides(el.querySelector('.saver-photos'), { interval: 15000 });
    }
    saverSlides.setPhotos(state.photos);
    el.querySelector('.saver-hud').innerHTML =
      `<div class="saver-time num">${c.h}:${c.m}<span>${c.ap}</span></div>` +
      `<div class="saver-date">${esc(dp.weekday)} ${esc(dp.month)} ${esc(dp.day)}</div>` + saverWx();
    return;
  }
  if (saverSlides) { saverSlides.stop(); saverSlides = null; }
  el.classList.remove('is-photos');
  const up = nextUp(state.events, n);
  const next = up
    ? `<div class="saver-next">${esc(eventTitle(up.event))}</div>`
    : '';
  el.innerHTML =
    `<img src="/emblem.png" alt="">` +
    `<div class="saver-name serif">${esc(BRAND)}</div>` +
    `<div class="saver-time num">${c.h}:${c.m}<span>${c.ap}</span></div>` +
    `<div class="saver-date">${esc(dp.weekday)} ${esc(dp.month)} ${esc(dp.day)}</div>` +
    next;
}

function openSaver() {
  saverOpen = true;
  paintSaver();
  if (saverSlides) saverSlides.start();
  document.getElementById('saver').classList.add('is-open');
}

function closeSaver() {
  saverOpen = false;
  if (saverSlides) saverSlides.stop();
  document.getElementById('saver').classList.remove('is-open');
  if (current !== 'home') go('home');
}

function inNight(date) {
  const p = parts(date);
  return inNightWindow(p.hour, p.minute, nightStartMin, nightEndMin);
}

function nightClockHtml(date) {
  const label = formatTime(date);
  const space = label.lastIndexOf(' ');
  return `${esc(label.slice(0, space))}<span>${esc(label.slice(space + 1))}</span>`;
}

function paintNight(date, animate) {
  const clock = document.querySelector('[data-nightclock]');
  if (!clock) return;
  clock.innerHTML = nightClockHtml(date);
  const slot = Math.floor(date.getTime() / 60000 / NIGHT_DRIFT_MINUTES);
  if (slot === nightSlot) return;
  const first = nightSlot == null;
  nightSlot = slot;
  const spot = nightAnchor(slot);
  clock.style.transition = first || !animate ? 'none' : '';
  clock.style.left = `${spot.x}%`;
  clock.style.top = `${spot.y}%`;
  if (first || !animate) {
    clock.getBoundingClientRect();
    clock.style.transition = '';
  }
}

function syncNight(date) {
  const show = !nightOff && inNight(date) && Date.now() >= wakeUntil;
  const el = document.getElementById('night');
  if (!el) return;
  if (show) {
    if (saverOpen) closeSaver();
    if (!nightOpen) {
      nightOpen = true;
      el.classList.add('is-open');
      el.setAttribute('aria-hidden', 'false');
      document.documentElement.classList.add('is-night');
      paintNight(date, false);
    } else paintNight(date, true);
    return;
  }
  if (!nightOpen && !document.documentElement.classList.contains('is-night')) return;
  nightOpen = false;
  nightSlot = null;
  el.classList.remove('is-open');
  el.setAttribute('aria-hidden', 'true');
  document.documentElement.classList.remove('is-night');
}

async function loadNightConfig() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return;
    const cfg = await res.json();
    nightStartMin = parseClockMinutes(cfg.nightStart, nightStartMin);
    nightEndMin = parseClockMinutes(cfg.nightEnd, nightEndMin);
  } catch { /* defaults already match the usual window */ }
}

function tick() {
  const n = now();
  syncNight(n);
  const c = clockBits(n);
  document.querySelectorAll('[data-railclock]').forEach((el) => {
    el.innerHTML = `<b>${c.h}:${c.m}</b><span>${c.ap}</span>`;
  });
  document.querySelectorAll('[data-clock]').forEach((el) => { el.innerHTML = clockHtml(n); });
  if (saverOpen && inNight(n) && !nightOff) closeSaver();
  if (saverOpen) {
    const time = document.querySelector('.saver-time');
    if (time) time.innerHTML = `${c.h}:${c.m}<span>${c.ap}</span>`;
  }
  if (n.getMinutes() !== lastMin) {
    lastMin = n.getMinutes();
    if (themeFn) themeFn();
    const view = views[current];
    const el = document.getElementById(`view-${current}`);
    if (view && view.tick && el) view.tick(el);
    if (saverOpen) paintSaver();
  }
  idle += 1;
  if (!nightOpen && !inNight(n) && !saverOpen && idle >= saverIdle()) openSaver();
}

function bind() {
  const stage = document.getElementById('stage');
  stage.addEventListener('click', (e) => {
    const chore = e.target.closest('[data-chore]');
    if (chore) { views.chores.toggle(chore.dataset.chore); return; }
    const hw = e.target.closest('[data-homework]');
    if (hw) { views.member.toggleHomework(hw.dataset.homework); return; }
    const groc = e.target.closest('[data-grocery]');
    if (groc) { views.grocery.act(groc.dataset.grocery, groc.dataset.name, groc.dataset.cat); return; }
    const ev = e.target.closest('[data-ev]');
    if (ev) { openEvent(ev.dataset.ev); return; }
    const mode = e.target.closest('[data-cal]');
    if (mode) { views.calendar.setMode(mode.dataset.cal); return; }
    const routine = e.target.closest('[data-routine]');
    if (routine) { views.chores.setRoutine(routine.dataset.routine); return; }
    const goBtn = e.target.closest('[data-go]');
    if (goBtn) go(goBtn.dataset.go);
  });
  stage.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-add-grocery]');
    if (!form) return;
    e.preventDefault();
    const name = form.elements.name.value.trim();
    if (!name) return;
    views.grocery.act('add', name, 'Other');
    form.reset();
  });
  document.getElementById('saver').addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    idle = 0;
    closeSaver();
  });
  document.addEventListener('pointerdown', (e) => {
    idle = 0;
    const sleeping = nightOpen || document.documentElement.classList.contains('is-night');
    if (inNight(now())) wakeUntil = Date.now() + NIGHT_WAKE_MS;
    if (sleeping) {
      e.preventDefault();
      e.stopPropagation();
      syncNight(now());
    }
  }, true);
  window.addEventListener('hashchange', () => go(location.hash.slice(1) || 'home'));
}

export function routineNow() {
  return routineForHour(parts(now()).hour);
}

export function eventsToday(pid) {
  const today = ymd(now());
  return state.events
    .filter((e) => onDay(e, today) && (!pid || e.people.includes(pid)))
    .filter((e) => e.allDay || new Date(e.end) > now())
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

export { clockHtml, formatTime, owner };

export async function start() {
  rail();
  import('./views/settings.js').then((m) => { m.applyBrightness(); m.applyTheme(); themeFn = m.applyTheme; }).catch(() => {});
  bind();
  syncNight(now());
  await loadNightConfig();
  syncNight(now());
  subscribe(() => {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    rerender();
  });
  await refreshAll();
  document.documentElement.dataset.ready = '1';
  go(location.hash.slice(1) || 'home');
  tick();
  setInterval(tick, 1000);
  setInterval(() => { refreshLists(); }, 20000);
  setInterval(() => { refreshAll(); }, 5 * 60 * 1000);
}
