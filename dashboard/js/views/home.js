import { FAMILY } from '../../family.js';
import { state } from '../data.js';
import { icon } from '../icons.js';
import { clockHtml, eventsToday, now, register, routineNow } from '../app.js';
import {
  avatar, esc, formatTime, nextUp, owner, pstyle, relDay, ring,
} from '../ui.js';

let slideTimer = 0;
let slideIndex = 0;

function weatherHtml() {
  const w = state.weather;
  if (!w) return '';
  const hours = w.hours || [];
  const temps = hours.map((h) => h.temp);
  const tmin = Math.min.apply(null, temps);
  const tmax = Math.max.apply(null, temps);
  return `<div class="h-wx-top"><span class="h-wx-icon">${icon(w.code, 48)}</span>` +
    `<span class="h-wx-temp num">${w.temp}°</span>` +
    `<span class="h-wx-meta"><b>${esc(w.label)}</b><span>H ${w.hi}°  L ${w.lo}°</span></span></div>` +
    `<div class="h-wx-say"><b>${esc(w.summary)}.</b> ${esc(w.advice)}.</div>` +
    `<div class="h-wx-hours">${hours.map((h) => {
      const lift = tmax === tmin ? 0 : Math.round(((h.temp - tmin) / (tmax - tmin)) * 8);
      return `<div class="h-hr${h.pop >= 50 ? ' is-wet' : ''}"><span class="h-hr-l">${esc(h.label)}</span>` +
        `<span class="h-hr-i" style="transform:translateY(-${lift}px)">${icon(h.code, 20)}</span><b>${h.temp}°</b></div>`;
    }).join('')}</div>`;
}

function familyHtml() {
  const n = now();
  return FAMILY.map((p) => {
    const next = state.events
      .filter((e) => !e.allDay && e.people.includes(p.id) && new Date(e.end) > n)
      .sort((a, b) => new Date(a.start) - new Date(b.start))[0];
    let sub = 'Free';
    if (next && new Date(next.start) <= n) sub = 'Now';
    else if (next) sub = formatTime(new Date(next.start));
    return `<button class="h-who" type="button" data-go="${p.id}" style="${pstyle(p)}">${avatar(p)}` +
      `<span><b>${esc(p.name)}</b><small>${esc(sub)}</small></span></button>`;
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
      : `<div class="h-hero-count num">${formatTime(new Date(e.start), false)}<small>${clockAp(e.start)}</small></div>`;
  }
  const meta = e.allDay
    ? relDay(e.start)
    : `${formatRangeSafe(e)}${e.location ? ` · ${esc(e.location)}` : ''}`;
  return `<button class="h-hero" type="button" style="${pstyle(p)}" data-ev="${esc(e.id)}">` +
    `<div class="h-hero-main"><div class="label label--on">Next up · ${esc(who)}</div>` +
    `<div class="h-hero-title serif">${esc(e.displayTitle || e.title)}</div>` +
    `<div class="h-hero-meta">${meta}</div></div>${big}</button>`;
}

function clockAp(iso) {
  const d = new Date(iso);
  return d && formatTime(d).slice(-2);
}

function formatRangeSafe(e) {
  return esc(formatRange(e.start, e.end));
}

function lanesHtml() {
  return FAMILY.map((p) => {
    const list = eventsToday(p.id).filter((e) => !e.allDay || true);
    const timed = list.filter((e) => !e.allDay);
    const shown = (timed.length ? timed : list).slice(0, 3);
    const more = (timed.length ? timed : list).length - shown.length;
    const n = now();
    const rows = shown.length
      ? shown.map((e) => {
        const cur = !e.allDay && new Date(e.start) <= n;
        const t = e.allDay ? 'All day' : (cur ? 'Now' : formatTime(new Date(e.start), false));
        return `<button class="h-ev${cur ? ' is-now' : ''}" type="button" data-ev="${esc(e.id)}">` +
          `<span class="h-ev-t">${esc(t)}</span><span class="h-ev-n">${esc(e.displayTitle || e.title)}</span></button>`;
      }).join('')
      : '<div class="h-free serif"><i>Free</i> the rest of the day</div>';
    return `<div class="h-lane" style="${pstyle(p)}"><div class="h-lane-head">${avatar(p)}<b>${esc(p.name)}</b></div>` +
      rows +
      (more > 0 ? `<button class="h-more" type="button" data-go="calendar">+${more} more</button>` : '') +
      `</div>`;
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
    return `<div class="h-ring${done === list.length ? ' is-done' : ''}" style="${pstyle(p)}">` +
      ring(done, list.length) +
      `<b class="num">${done === list.length ? '✓' : `${done}/${list.length}`}</b><span>${esc(p.name)}</span></div>`;
  }).join('');
  return `<div class="label">Chores · ${esc(r.name)}</div><div class="h-rings">${rings}</div>`;
}

function shopHtml() {
  const open = state.groceries.filter((g) => !g.done);
  const recent = open.slice(0, 3);
  return `<div class="label">Grocery</div><div class="h-stat"><span class="num">${open.length}</span><small>items to get</small></div>` +
    `<ul class="h-recent">${recent.map((g) => `<li><i></i>${esc(g.name)}</li>`).join('')}</ul>`;
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
  const cap = el.querySelector('.h-photo-cap');
  const photo = state.photos[slideIndex % Math.max(state.photos.length, 1)];
  if (cap && photo) cap.innerHTML = `<b>This year</b><span>${esc(photo.caption || 'Home')}</span>`;
}

function showSlide(stage) {
  const photos = state.photos.length ? state.photos : [{ url: '/placeholders/garden.svg', caption: 'Garden' }];
  slideIndex = slideIndex % photos.length;
  const photo = photos[slideIndex];
  stage.innerHTML = `<img src="${esc(photo.url)}" alt="">`;
  const cap = stage.parentElement.querySelector('.h-photo-cap');
  if (cap) cap.innerHTML = `<b>This year</b><span>${esc(photo.caption || 'Home')}</span>`;
}

register('home', {
  show(el) {
    if (!el.dataset.built) {
      el.dataset.built = '1';
      el.innerHTML = `<div class="home">` +
        `<div class="h-clock" data-clock></div>` +
        `<div class="h-weather"></div>` +
        `<div class="h-family"></div>` +
        `<div class="h-main"><div class="h-hero-slot"></div><div class="h-lanes"></div></div>` +
        `<div class="h-side">` +
        `<button class="h-photo" type="button" data-go="photos"><div class="h-photo-stage"></div><div class="h-photo-cap"></div></button>` +
        `<button class="h-chores card" type="button" data-go="chores"></button>` +
        `<button class="h-shop card" type="button" data-go="grocery"></button>` +
        `</div></div>`;
      const stage = el.querySelector('.h-photo-stage');
      showSlide(stage);
      clearInterval(slideTimer);
      slideTimer = setInterval(() => {
        slideIndex += 1;
        showSlide(stage);
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
