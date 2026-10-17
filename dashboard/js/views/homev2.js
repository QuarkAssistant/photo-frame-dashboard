// v2 Home (Phase 1), matched to proposal mockups 01 (Garden Morning) and 02's palette
// (Olive Grove, html.theme-dark). Only registered when the v2 shell is on, so v1's
// Home (home.js) is untouched. Lean DOM: absolute cards, one SVG per ring/icon.
import { FAMILY } from '../../family.js';
import { inRoutine } from '../../chores.js';
import { sectionFor, sortBySection } from '../../sections.js';
import { state } from '../data.js';
import { now, register, routineNow, UI_V2 } from '../app.js';
import { clockBits, esc, owner } from '../ui.js';
import { celsius } from '../weatherui.js';
import { createSlides } from '../slides.js';
import { ui, weatherArt } from '../v2icons.js';
import {
  comingUp, dayTime, fullDate, heroBig, heroDetails, homeTitle, INITIALS, leaveBy, liveProgress, nextAndThen, weatherContext,
} from '../homev2data.js';

const isDark = () => document.documentElement.classList.contains('theme-dark');
const pcolor = (p) => (p && p.color) || '#1F6F6B';

function setHtml(el, html) {
  if (el && el.__html !== html) { el.innerHTML = html; el.__html = html; }
}

function circle(p, cls = '') {
  const init = p.id === 'everyone' ? '★' : (INITIALS[p.id] || p.initial || '');
  return `<span class="hv2-av${init.length > 1 ? ' is-wide' : ''}${cls}" style="background:${pcolor(p)};color:${p.ink || '#fff'}">${esc(init)}</span>`;
}

// ---- Top band ----------------------------------------------------------------
function clockHtml(n) {
  const c = clockBits(n);
  return `<div class="hv2-time">${c.h}:${c.m}<span>${c.ap}</span></div><div class="hv2-date">${esc(fullDate(n))}</div>`;
}

function weatherHtml() {
  const w = state.weather;
  if (!w) return '';
  const dark = isDark();
  const hl = `H ${Math.round(w.hi)}°/${celsius(w.hi, w.hiC)}° · L ${Math.round(w.lo)}°/${celsius(w.lo, w.loC)}°`;
  let inside = '';
  const ind = w.indoor;
  if (ind && Number.isFinite(Number(ind.tempC)) && Number.isFinite(Number(ind.humidity))) {
    const c = Number(ind.tempC);
    inside = `<div class="hv2-wx-in">${ui('home', 24)}<span>Inside ${Math.round(c * 9 / 5 + 32)}°F / ${Math.round(c)}°C · ${Math.round(Number(ind.humidity))}%</span></div>`;
  }
  const ctx = weatherContext(w, dark, celsius);
  const ctxHtml = ctx ? `<div class="hv2-wx-ctx">${ui(ctx.icon, 24)}<span>${esc(ctx.text)}</span></div>` : '';
  return `<span class="hv2-wx-art">${weatherArt(w.code, dark, 96)}</span>` +
    `<div class="hv2-wx-t"><b>${Math.round(w.temp)}°F</b><span>/ ${celsius(w.temp, w.tempC)}°C</span></div>` +
    `<div class="hv2-wx-c"><b>${esc(w.label || '')}</b><span>${esc(hl)}</span></div>${inside}${ctxHtml}`;
}

let where = { ok: false, people: {} };
let whereAt = 0;
function loadWhere(done) {
  if (Date.now() - whereAt < 5 * 60000) return;
  whereAt = Date.now();
  fetch('/api/whereabouts', { cache: 'no-store' }).then((r) => r.json()).then((d) => { if (d) where = d; done(); }).catch(() => {});
}
function ago(iso) {
  const m = Math.max(0, Math.round((now() - new Date(iso)) / 60000));
  if (!Number.isFinite(m)) return '';
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hr ago` : `${Math.round(h / 24)} d ago`;
}
// Real profile photos (same files v1 uses) in a ring of the person's color, with that
// person's own Find My place and update age.
function photoCircle(p) {
  const init = INITIALS[p.id] || p.initial || '';
  const pic = p.photo ? `<i style="background-image:url('${esc(p.photo)}')"></i>` : '';
  return `<span class="hv2-ph" style="background:${pcolor(p)};box-shadow:0 0 0 3px ${pcolor(p)};color:${p.ink || '#fff'}">${esc(init)}${pic}</span>`;
}
function peopleHtml() {
  return FAMILY.map((p) => {
    const loc = where.ok && where.people && where.people[p.id];
    let status = 'Location off';
    if (loc && loc.place) {
      const age = loc.at ? ago(loc.at) : '';
      status = age ? `${loc.place} · Updated ${age}` : loc.place;
    }
    return `<button class="hv2-p" type="button" data-go="${p.id}">${photoCircle(p)}<b>${esc(p.name)}</b><span>${esc(status)}</span></button>`;
  }).join('');
}

// ---- Next Up -----------------------------------------------------------------
const etas = {};
function etaFor(e, repaint) {
  const loc = e.location;
  if (!loc || e.allDay) return null;
  const c = etas[loc];
  if (c && (c.pending || Date.now() - c.at < 10 * 60000)) return c.data;
  etas[loc] = { pending: true, at: Date.now(), data: c ? c.data : null };
  fetch(`/api/eta?to=${encodeURIComponent(loc)}&start=${encodeURIComponent(e.start || '')}`)
    .then((r) => r.json())
    .then((d) => { etas[loc] = { at: Date.now(), data: d }; repaint(); })
    .catch(() => { etas[loc] = { at: Date.now(), data: c ? c.data : null }; });
  return etas[loc].data;
}

function heroHtml(repaint) {
  const n = now();
  const { up, then } = nextAndThen(state.events, n);
  if (!up) {
    return '<div class="hv2-hero is-empty"><div class="hv2-in"><div class="hv2-lbl">Next up</div><div class="hv2-hero-title">Nothing scheduled</div></div></div>';
  }
  const e = up.event;
  const p = owner(e);
  const big = heroBig(up, n);
  const title = homeTitle(e);
  const leave = up.phase === 'soon' && !e.atHome ? leaveBy(e, etaFor(e, repaint), n) : null;
  const live = up.phase === 'now' ? liveProgress(e, n) : null;
  const liveHtml = live
    ? `<div class="hv2-live"><div class="hv2-live-t"><b>${esc(live.ends)}</b><span>${esc(live.left)}</span></div>` +
      `<div class="hv2-bar"><i style="width:${Math.max(2, Math.min(100, live.pct))}%"></i></div></div>`
    : '';
  const leaveHtml = leave
    ? `<div class="hv2-leave is-${leave.state}">${ui('car', 32, 2.4)}<b>${esc(leave.text)}</b><span>${esc(leave.drive)}</span></div>`
    : '';
  let thenHtml = '';
  if (then) {
    const tp = owner(then);
    const who = then.everyone ? 'Everyone' : tp.name;
    thenHtml = `<div class="hv2-then"><span class="hv2-then-k">Then</span><b>${esc(dayTime(then.start, n).replace(/^Today /, ''))}</b>` +
      `<i style="background:${pcolor(tp)}"></i><span class="hv2-then-n">${esc(who)} · ${esc(homeTitle(then))}</span></div>`;
  }
  const who = e.everyone ? 'Everyone' : p.name;
  const size = title.length > 24 ? ' is-xlong' : title.length > 15 ? ' is-long' : '';
  return `<button class="hv2-hero${leave ? ' has-leave' : ''}" type="button" data-ev="${esc(e.id)}"><div class="hv2-in">` +
    `<div class="hv2-hero-top"><div class="hv2-hero-l"><div class="hv2-hero-who"><span class="hv2-lbl">Next up</span>${circle(p, ' is-sm')}<b>${esc(who)}</b></div>` +
    `<div class="hv2-hero-title${size}">${esc(title)}</div></div>` +
    `<div class="hv2-hero-big">${esc(big.text)}${big.unit ? `<span>${esc(big.unit)}</span>` : ''}</div></div>` +
    `<div class="hv2-hero-det">${esc(heroDetails(e, n))}</div>${leaveHtml}${liveHtml}${thenHtml}</div></button>`;
}

// ---- Bottom row --------------------------------------------------------------
function ringSvg(done, total, color, label) {
  const size = 72; const sw = 9; const r = (size - sw) / 2; const c = 2 * Math.PI * r;
  const f = total ? Math.max(0, Math.min(1, done / total)) : 0;
  const arc = f > 0
    ? `<circle cx="36" cy="36" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 36 36)"/>`
    : '';
  return `<svg class="hv2-ring" viewBox="0 0 72 72" aria-hidden="true"><circle class="hv2-ring-bg" cx="36" cy="36" r="${r}" fill="none" stroke-width="${sw}"/>${arc}` +
    `<text x="36" y="36" dy=".36em" text-anchor="middle">${esc(label)}</text></svg>`;
}

function choresHtml() {
  const r = routineNow();
  const rings = FAMILY.map((p) => {
    const list = state.chores.filter((c) => inRoutine(c, r.id) && c.who === p.id);
    const done = list.filter((c) => c.done).length;
    return `<div class="hv2-r">${ringSvg(done, list.length, pcolor(p), INITIALS[p.id] || p.initial)}<b>${list.length ? `${done}/${list.length}` : '–'}</b></div>`;
  }).join('');
  return `<div class="hv2-lbl">Chores · ${esc(r.name)}</div><div class="hv2-rings">${rings}</div>`;
}

const KIND = {
  birthday: ['cake', '#F78872'], trip: ['plane', '#3D78BC'], outing: ['bus', '#3D78BC'], game: ['trophy', '#8EAD74'],
  holiday: ['flag', '#1F6F6B'], flamengo: ['ball', '#AB2320'],
};
function comingHtml() {
  const list = comingUp(state.events, state.extras, now());
  const rows = list.map((i) => {
    const [ic, col] = KIND[i.kind] || KIND.holiday;
    return `<div class="hv2-cu"><span class="hv2-cu-i" style="background:${col}">${ui(ic, 28, 2.4)}</span>` +
      `<span class="hv2-cu-n">${esc(i.title)}</span><b class="hv2-cu-w">${esc(i.when)}</b></div>`;
  }).join('');
  return `<div class="hv2-lbl">Coming up</div>${rows || '<div class="hv2-none">Nothing on the calendar yet</div>'}`;
}

function groceryHtml() {
  const open = sortBySection(state.groceries.filter((g) => !g.done).map((g) => ({ ...g, cat: sectionFor(g.name) })));
  const first = open.slice(0, 4).map((g) => g.name).join(' · ');
  return `<div class="hv2-lbl">Grocery</div><span class="hv2-cart">${ui('cart', 34)}</span>` +
    `<div class="hv2-g-n">${open.length}<span>${open.length === 1 ? 'item' : 'items'}</span></div>` +
    `<div class="hv2-g-l">${esc(first)}</div>`;
}

// ---- Photo -------------------------------------------------------------------
let slides = null;
function showPhotos(el) {
  const stage = el.querySelector('.hv2-photo-stage');
  if (!stage) return;
  const real = state.photoSource === 'folder' && state.photos.length > 0;
  el.querySelector('.hv2-photo').classList.toggle('is-empty', !real);
  if (!real) { if (slides) slides.stop(); return; }
  if (!slides) slides = createSlides(stage, { interval: 15000 });
  slides.setPhotos(state.photos);
  slides.start();
}

// ---- View --------------------------------------------------------------------
function paint(el) {
  const q = (s) => el.querySelector(s);
  setHtml(q('.hv2-clock'), clockHtml(now()));
  setHtml(q('.hv2-wx'), weatherHtml());
  setHtml(q('.hv2-people'), peopleHtml());
  const hero = q('.hv2-hero-slot');
  setHtml(hero, heroHtml(() => setHtml(hero, heroHtml(() => {}))));
  setHtml(q('.hv2-chores'), choresHtml());
  setHtml(q('.hv2-coming'), comingHtml());
  setHtml(q('.hv2-groc'), groceryHtml());
  loadWhere(() => setHtml(q('.hv2-people'), peopleHtml()));
}

if (UI_V2) {
  register('home', {
    show(el) {
      if (!el.dataset.built) {
        el.dataset.built = '1';
        el.classList.add('hv2-view');
        el.innerHTML = '<div class="hv2">' +
          '<div class="hv2-clock"></div>' +
          '<button class="hv2-wx" type="button" data-go="weather"></button>' +
          '<div class="hv2-people"></div>' +
          '<div class="hv2-hero-slot"></div>' +
          '<button class="hv2-photo" type="button" data-go="photos"><div class="hv2-photo-stage"></div></button>' +
          '<button class="hv2-card hv2-chores" type="button" data-go="chores"></button>' +
          '<button class="hv2-card hv2-coming" type="button" data-go="coming-up"></button>' +
          '<button class="hv2-card hv2-groc" type="button" data-go="grocery"></button>' +
          '</div>';
      }
      paint(el);
      showPhotos(el);
    },
    tick(el) {
      if (el.dataset.built) paint(el);
    },
  });
}
