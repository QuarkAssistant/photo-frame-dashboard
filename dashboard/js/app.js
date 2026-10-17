import { BRAND, FAMILY } from '../family.js';
import { routineForHour } from '../mock.js';
import {
  DEFAULT_NIGHT_END, DEFAULT_NIGHT_START, inNightWindow, NIGHT_DRIFT_MINUTES, NIGHT_WAKE_MS,
  nightAnchor, parseClockMinutes,
} from '../night.js';
import { parts, ymd } from '../time.js';
import { NAV_V2, routeFor, SETTINGS_HOLD_MS, shouldIdleHome, wantsV2 } from '../nav.js';
import { reportFrame } from './frameinfo.js';
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
// v2 shell (9-item rail, new routes, design tokens): opt-in with ?ui=v2 for now.
export const UI_V2 = wantsV2(location.search);
if (UI_V2) document.documentElement.className += ' ui-v2';
let saverOpen = false;
let lastPerson = null;
export function lastPersonViewed() { return lastPerson; }
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

let route = routeFor('home');
export function currentRoute() { return route; }

export function go(name) {
  const r = routeFor(name);
  const person = r.person ? FAMILY.find((p) => p.id === r.person) : null;
  const viewName = person ? 'member' : (views[r.view] ? r.view : 'home');
  route = viewName === r.view ? r : routeFor('home');
  memberId = person ? person.id : null;
  current = viewName;
  if (person) lastPerson = person.id;
  document.querySelectorAll('.view').forEach((v) => {
    v.classList.toggle('is-active', v.dataset.view === viewName);
  });
  document.querySelectorAll('.rail-item').forEach((b) => {
    const on = UI_V2 ? b.dataset.nav === route.section : b.dataset.go === (person ? person.id : viewName);
    b.classList.toggle('is-active', on);
  });
  const el = document.getElementById(`view-${viewName}`);
  if (views[viewName] && el) views[viewName].show(el);
  paintClocks();
  const hash = person ? person.id : route.name;
  if (location.hash !== `#${hash}`) {
    history.replaceState(null, '', `${location.pathname}${location.search}#${hash}`);
  }
}

export function rerender() {
  const el = document.getElementById(`view-${current}`);
  if (el && views[current]) views[current].show(el);
  if (saverOpen) paintSaver();
  paintClocks();
}

function clockHtml(date) {
  const c = clockBits(date);
  const dp = dayParts(ymd(date));
  return `<div class="h-time num">${c.h}:${c.m}<span class="h-ampm">${c.ap}</span></div>` +
    `<div class="h-date"><b>${esc(dp.weekday)}</b> <i>${esc(dp.month)} ${esc(dp.day)}</i></div>`;
}

// v2 rail: nine items, 84 px each, 18 px labels. Settings needs a 2 s hold.
function railV2() {
  document.getElementById('rail').className = 'rail rail--v2';
  document.getElementById('rail').innerHTML = '<div class="r2-top"></div>' + NAV_V2.map((n) => {
    const act = n.hold ? `data-hold="${n.id}"` : `data-go="${n.id}"`;
    return `<button class="rail-item r2-item" type="button" data-nav="${n.id}" ${act}>` +
      `<i class="r2-pip"></i>${icon(n.icon, 30, 2.4)}<span>${esc(n.label)}</span></button>`;
  }).join('');
}

let toastTimer = null;
export function toast(text) {
  let el = document.getElementById('v2Toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'v2Toast';
    el.className = 'v2-toast';
    document.getElementById('stage').appendChild(el);
  }
  el.textContent = text;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 2200);
}

function bindHold() {
  let timer = null;
  let btn = null;
  const cancel = (tap) => {
    if (!btn) return;
    clearTimeout(timer);
    btn.classList.remove('is-holding');
    if (tap) toast('Hold for 2 seconds to open Settings');
    btn = null;
  };
  const railEl = document.getElementById('rail');
  railEl.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-hold]');
    if (!b) return;
    btn = b;
    b.classList.add('is-holding');
    timer = setTimeout(() => { const id = b.dataset.hold; cancel(false); go(id); }, SETTINGS_HOLD_MS);
  });
  railEl.addEventListener('pointerup', () => cancel(true));
  railEl.addEventListener('pointercancel', () => cancel(false));
  railEl.addEventListener('pointerleave', () => cancel(false));
  railEl.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-hold]')) e.preventDefault(); });
}

function rail() {
  if (UI_V2) { railV2(); bindHold(); return; }
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
    uniformLine(ev) +
    `</div></div>`;
  layer.classList.add('is-open');
  layer.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', closeSheet);
  });
}

function uniformLine(ev) {
  const u = ev.uniform;
  if (!u || !u.text) return '';
  const sw = (u.colors || []).filter((c) => /^#[0-9a-f]{6}$/i.test(c.hex))
    .map((c) => `<span class="uni-sw" style="background:${c.hex}" title="${esc(c.name)}"></span>`).join('');
  return `<p class="sheet-uni"><span class="uni-k">Uniform</span>${sw ? `<span class="uni-sws">${sw}</span>` : ''}<span class="uni-t">${esc(u.text)}</span></p>`;
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

// Per-second work: night window, screensaver idle count. No DOM writes unless
// one of those states actually changes.
function tick() {
  const n = now();
  syncNight(n);
  if (saverOpen && inNight(n) && !nightOff) closeSaver();
  if (n.getMinutes() !== lastMin) minuteTick(n);
  idle += 1;
  if (UI_V2 && !nightOpen && !saverOpen && shouldIdleHome(current, idle)) { closeSheet(); go('home'); }
  if (!nightOpen && !inNight(n) && !saverOpen && idle >= saverIdle()) openSaver();
}

// Clock text changes once a minute, so only touch the clock elements then, and
// only when the text is different (rewriting them every second forced a layout).
function setHtml(el, html) {
  if (el.__html !== html) { el.innerHTML = html; el.__html = html; }
}

export function paintClocks(n = now()) {
  const c = clockBits(n);
  document.querySelectorAll('[data-railclock]').forEach((el) => setHtml(el, `<b>${c.h}:${c.m}</b><span>${c.ap}</span>`));
  document.querySelectorAll('[data-clock]').forEach((el) => setHtml(el, clockHtml(n)));
  if (saverOpen) {
    const time = document.querySelector('.saver-time');
    if (time) setHtml(time, `${c.h}:${c.m}<span>${c.ap}</span>`);
  }
}

function minuteTick(n) {
  lastMin = n.getMinutes();
  paintClocks(n);
  if (themeFn) themeFn();
  const view = views[current];
  const el = document.getElementById(`view-${current}`);
  if (view && view.tick && el) view.tick(el);
  if (saverOpen) paintSaver();
}

// Align the clock repaint to the start of each minute so it never lags the
// real time by up to a second.
function scheduleMinute() {
  const ms = 60000 - (Date.now() % 60000) + 50;
  setTimeout(() => {
    const n = now();
    if (n.getMinutes() !== lastMin) minuteTick(n);
    scheduleMinute();
  }, ms);
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

// Screenshot harness: ?sheet=<event id> opens that event's sheet; ?sheet=uniform opens
// the next event that has a uniform line (proves the soccer popup without a tap).
function openSheetParam() {
  const want = pageParams.get('sheet');
  if (!want) return;
  const t = now();
  const ev = want === 'uniform'
    ? state.events.filter((e) => e.uniform && e.uniform.text && new Date(e.end) > t)
      .sort((a, b) => String(a.start).localeCompare(String(b.start)))[0]
    : state.events.find((e) => e.id === want);
  if (ev) openEvent(ev.id);
}

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
  reportFrame();
  setInterval(reportFrame, 60 * 60 * 1000);
  go(location.hash.slice(1) || 'home');
  openSheetParam();
  tick();
  paintClocks();
  setInterval(tick, 1000);
  scheduleMinute();
  setInterval(() => { refreshLists(); }, 20000);
  setInterval(() => { refreshAll(); }, 5 * 60 * 1000);
}
