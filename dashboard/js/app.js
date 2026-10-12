import { BRAND, FAMILY } from '../family.js';
import { routineForHour } from '../mock.js';
import { parts, ymd } from '../time.js';
import { refreshAll, refreshLists, state, subscribe } from './data.js';
import { icon } from './icons.js';
import {
  avatar, clockBits, dayParts, esc, formatRange, formatTime, nextUp, onDay, owner, pstyle, relDay,
} from './ui.js';

const views = {};
let current = 'home';
let memberId = null;
let lastMin = -1;
let idle = 0;
let saverOpen = false;

export function register(name, view) { views[name] = view; }
export function now() { return new Date(); }
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
  if (location.hash !== `#${hash}`) history.replaceState(null, '', `#${hash}`);
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
    `<div class="rail-brand"><img src="/icon-192.png" alt=""><span>${esc(BRAND)}</span></div>` +
    item('home', 'home', 'Today') +
    item('calendar', 'calendar', 'Calendar') +
    item('chores', 'tasks', 'Chores') +
    item('grocery', 'cart', 'Grocery') +
    people +
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
    `<h2 class="serif sheet-h">${esc(ev.displayTitle || ev.title)}</h2>` +
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

function paintSaver() {
  const n = now();
  const c = clockBits(n);
  const dp = dayParts(ymd(n));
  const up = nextUp(state.events, n);
  const next = up
    ? `<div class="saver-next">${esc(up.event.displayTitle || up.event.title)}</div>`
    : '';
  document.getElementById('saver').innerHTML =
    `<img src="/icon-512.png" alt="">` +
    `<div class="saver-name serif">${esc(BRAND)}</div>` +
    `<div class="saver-time num">${c.h}:${c.m}<span>${c.ap}</span></div>` +
    `<div class="saver-date">${esc(dp.weekday)} ${esc(dp.month)} ${esc(dp.day)}</div>` +
    next;
}

function openSaver() {
  saverOpen = true;
  paintSaver();
  document.getElementById('saver').classList.add('is-open');
}

function closeSaver() {
  saverOpen = false;
  document.getElementById('saver').classList.remove('is-open');
}

function tick() {
  const n = now();
  const c = clockBits(n);
  document.querySelectorAll('[data-railclock]').forEach((el) => {
    el.innerHTML = `<b>${c.h}:${c.m}</b><span>${c.ap}</span>`;
  });
  document.querySelectorAll('[data-clock]').forEach((el) => { el.innerHTML = clockHtml(n); });
  if (saverOpen) {
    const time = document.querySelector('.saver-time');
    if (time) time.innerHTML = `${c.h}:${c.m}<span>${c.ap}</span>`;
  }
  if (n.getMinutes() !== lastMin) {
    lastMin = n.getMinutes();
    const view = views[current];
    const el = document.getElementById(`view-${current}`);
    if (view && view.tick && el) view.tick(el);
    if (saverOpen) paintSaver();
  }
  idle += 1;
  if (!saverOpen && idle >= 180) openSaver();
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
  document.addEventListener('pointerdown', () => { idle = 0; }, true);
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
  bind();
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
