import { BRAND, FAMILY } from '../../family.js';
import { addDaysYmd, ymd } from '../../time.js';
import { state } from '../data.js';
import { clockHtml, now, register, routineNow } from '../app.js';
import {
  avatar, compactTitle, dayParts, esc, eventTitle, formatRange, formatTime, nextPersonWhen, nextUp, owner, pstyle, relDay, ring,
} from '../ui.js';
import { celsius } from '../weatherui.js';
import { icon } from '../icons.js';

let slideTimer = 0;
let slideIndex = 0;

function wxPair(f, c, cls = '') {
  return `<span class="hw-pair num ${cls}">${Math.round(f)} °F <i>/</i> ${c} °C</span>`;
}

function weatherHtml() {
  const w = state.weather;
  if (!w) return '';
  const hours = (w.hours || []).slice(0, 6);
  const cells = hours.map((h) =>
    `<div class="hw-hr"><span class="hw-hr-l">${esc(h.label)}</span>` +
    `<span class="hw-hr-i">${icon(h.code || 'partly', 20, 2)}</span>` +
    `${wxPair(h.temp, celsius(h.temp, h.tempC))}` +
    `${Number(h.pop) > 0 ? `<small class="hw-pop">${Math.round(h.pop)}%</small>` : ''}</div>`).join('');
  return `<div class="hw-top">` +
    `<div class="hw-now"><span class="hw-icon">${icon(w.code || 'partly', 40, 2)}</span>` +
    `<div class="hw-now-txt">${wxPair(w.temp, celsius(w.temp, w.tempC), 'hw-big')}` +
    `<span class="hw-cond"><b>${esc(w.label)}</b> · ${esc(w.place || 'Naperville')}</span></div></div>` +
    `<div class="hw-hl">` +
    `<span class="hw-line"><em>High</em>${icon('up', 14, 2)}${wxPair(w.hi, celsius(w.hi, w.hiC))}</span>` +
    `<span class="hw-line"><em>Low</em>${icon('down', 14, 2)}${wxPair(w.lo, celsius(w.lo, w.loC))}</span>` +
    `</div></div>` +
    `<div class="hw-hours" style="grid-template-columns:repeat(${Math.max(hours.length, 1)},minmax(0,1fr))">${cells}</div>`;
}

function personWhen(p) {
  return nextPersonWhen(state.events, p.id, now());
}

function familyHtml() {
  return FAMILY.map((p) => {
    const sub = personWhen(p);
    const when = `<small>${esc(sub)}</small>`;
    return `<button class="h-who" type="button" data-go="${p.id}" style="${pstyle(p)}">${avatar(p)}` +
      `<span class="h-who-meta"><b>${esc(p.name)}</b>${when}</span></button>`;
  }).join('');
}

function heroHtml() {
  const up = nextUp(state.events, now());
  if (!up) {
    return `<div class="h-hero h-hero--empty"><div class="label label--light">Next up</div>` +
      `<div class="h-hero-title serif">Nothing scheduled.<br><i>Enjoy the quiet.</i></div></div>`;
  }
  const e = up.event;
  const p = owner(e);
  const who = e.everyone ? 'Everyone' : (FAMILY.find((m) => m.id === e.people[0])?.name || '');
  let big = '<div class="h-hero-count num">All<small>day</small></div>';
  if (up.phase === 'now') big = '<div class="h-hero-count num">Now</div>';
  else if (up.phase === 'soon') {
    const mins = Math.max(0, Math.round((new Date(e.start) - now()) / 60000));
    big = mins < 100
      ? `<div class="h-hero-count num">${mins}<small>min</small></div>`
      : `<div class="h-hero-count num">${heroClock(e.start)}</div>`;
  }
  const meta = e.allDay
    ? relDay(e.start)
    : `${formatRangeSafe(e)}${e.location ? ` · ${esc(e.location)}` : ''}`;
  return `<button class="h-hero" type="button" style="${pstyle(p)}" data-ev="${esc(e.id)}">` +
    `<div class="h-hero-main"><div class="label label--on">Next up · ${esc(who)}</div>` +
    `<div class="h-hero-title serif">${esc(eventTitle(e))}</div>` +
    `<div class="h-hero-meta">${meta}</div></div>${big}</button>`;
}

function heroClock(iso) {
  const label = formatTime(iso);
  const space = label.lastIndexOf(' ');
  return `${esc(label.slice(0, space))}<small>${esc(label.slice(space + 1))}</small>`;
}

function formatRangeSafe(e) {
  return esc(formatRange(e.start, e.end));
}

function laneWhen(e, today, n) {
  if (e.allDay) {
    const label = relDay(e.start, n);
    return label === 'Today' ? 'All day' : label;
  }
  const day = ymd(new Date(e.start));
  const t = formatTime(e.start);
  if (day === today) return new Date(e.start) <= n ? 'Now' : t;
  return `${dayParts(day).weekday.slice(0, 3)} ${t}`;
}

function lanesHtml() {
  const n = now();
  const today = ymd(n);
  const until = addDaysYmd(today, 6);
  return FAMILY.map((p) => {
    const list = state.events
      .filter((e) => e.people.includes(p.id))
      .filter((e) => (e.allDay ? e.start <= until && e.end > today : ymd(new Date(e.start)) <= until && new Date(e.end) > n))
      .sort((a, b) => String(a.start).localeCompare(String(b.start)))
      .slice(0, 6);
    const rows = list.length
      ? list.map((e) => {
        const cur = !e.allDay && new Date(e.start) <= n && new Date(e.end) > n;
        return `<button class="h-ev${cur ? ' is-now' : ''}" type="button" data-ev="${esc(e.id)}">` +
          `<span class="h-ev-t">${esc(laneWhen(e, today, n))}</span><span class="h-ev-n">${esc(compactTitle(e.displayTitle || e.title))}</span></button>`;
      }).join('')
      : '<div class="h-free serif"><i>Nothing</i> coming up</div>';
    return `<div class="h-lane" style="${pstyle(p)}"><div class="h-lane-head">${avatar(p)}<b>${esc(p.name)}</b></div>${rows}</div>`;
  }).join('');
}

function choresHtml() {
  const r = routineNow();
  const who = FAMILY.map((p) => p.id).concat(['any']);
  const rings = who.map((id) => {
    const list = state.chores.filter((c) => c.routine === r.id && c.who === id);
    if (!list.length) return '';
    const done = list.filter((c) => c.done).length;
    const p = id === 'any'
      ? { id: 'any', name: 'Anyone', color: '#1F3A3A', rgb: '31, 58, 58', ink: '#E8DCC4' }
      : FAMILY.find((m) => m.id === id);
    const label = done === list.length ? '✓' : `${done}/${list.length}`;
    return `<div class="h-ring${done === list.length ? ' is-done' : ''}" style="${pstyle(p)}">` +
      `<div class="h-dial">${ring(done, list.length)}<b class="num">${label}</b></div>` +
      `<span>${esc(p.name)}</span></div>`;
  }).join('');
  return `<div class="label">Chores · ${esc(r.name)}</div><div class="h-rings">${rings}</div>`;
}

function shopHtml() {
  const open = state.groceries.filter((g) => !g.done);
  const recent = open.slice(0, 3);
  return `<div class="label">Grocery</div><div class="h-stat"><span class="num">${open.length}</span><small>items to get</small></div>` +
    `<ul class="h-recent">${recent.map((g) => `<li><i></i>${esc(g.name)}</li>`).join('')}</ul>`;
}

function realPhotos() {
  return state.photoSource === 'folder' && state.photos.length > 0;
}

function showSlide(root) {
  const photoBtn = root.querySelector('.h-photo');
  if (!photoBtn) return;
  if (!realPhotos()) {
    photoBtn.classList.add('is-mark');
    return;
  }
  photoBtn.classList.remove('is-mark');
  const photos = state.photos;
  slideIndex = slideIndex % photos.length;
  const photo = photos[slideIndex];
  const stage = photoBtn.querySelector('.h-photo-stage');
  if (stage) stage.innerHTML = `<img src="${esc(photo.url)}" alt="">`;
  const cap = photoBtn.querySelector('.h-photo-cap');
  if (cap) cap.innerHTML = `<b>This year</b><span>${esc(photo.caption || 'Home')}</span>`;
}

function paint(el) {
  const clock = el.querySelector('[data-clock]');
  if (clock) clock.innerHTML = clockHtml(now());
  el.querySelector('.h-weather').innerHTML = weatherHtml();
  el.querySelector('.h-family').innerHTML = familyHtml();
  el.querySelector('.h-hero-slot').innerHTML = heroHtml();
  el.querySelector('.h-lanes').innerHTML = lanesHtml();
  el.querySelector('.h-chores').innerHTML = choresHtml();
  el.querySelector('.h-shop').innerHTML = shopHtml();
  showSlide(el);
}

register('home', {
  show(el) {
    if (!el.dataset.built) {
      el.dataset.built = '1';
      el.innerHTML = `<div class="home">` +
        `<div class="h-clock" data-clock></div>` +
        `<button class="h-weather card" type="button" data-go="weather"></button>` +
        `<div class="h-family"></div>` +
        `<div class="h-main"><div class="h-hero-slot"></div><div class="h-lanes"></div></div>` +
        `<div class="h-side">` +
        `<button class="h-photo" type="button" data-go="photos"><div class="h-photo-stage"></div>` +
        `<div class="h-photo-mark"><img src="/emblem.png" alt=""><span class="serif">${esc(BRAND)}</span></div>` +
        `<div class="h-photo-cap"></div></button>` +
        `<button class="h-chores card" type="button" data-go="chores"></button>` +
        `<button class="h-shop card" type="button" data-go="grocery"></button>` +
        `</div></div>`;
      clearInterval(slideTimer);
      slideTimer = setInterval(() => {
        if (!realPhotos()) return;
        slideIndex += 1;
        showSlide(el);
      }, 12000);
    }
    paint(el);
  },
  tick(el) {
    if (!el.dataset.built) return;
    const clock = el.querySelector('[data-clock]');
    if (clock) clock.innerHTML = clockHtml(now());
    el.querySelector('.h-hero-slot').innerHTML = heroHtml();
    el.querySelector('.h-lanes').innerHTML = lanesHtml();
    el.querySelector('.h-family').innerHTML = familyHtml();
    if (now().getMinutes() === 0) el.querySelector('.h-weather').innerHTML = weatherHtml();
  },
});
