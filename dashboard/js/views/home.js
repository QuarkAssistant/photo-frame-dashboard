import { BRAND, FAMILY } from '../../family.js';
import { addDaysYmd, ymd } from '../../time.js';
import { state } from '../data.js';
import { clockHtml, now, register, routineNow } from '../app.js';
import {
  avatar, compactTitle, dayParts, esc, eventTitle, formatRange, formatTime, nextPersonWhen, nextUp, owner, pstyle, relDay, ring,
} from '../ui.js';
import { celsius } from '../weatherui.js';
import { createSlides } from '../slides.js';
import { icon } from '../icons.js';


function wxPair(f, c, cls = '') {
  return `<span class="hw-pair num ${cls}">${Math.round(f)} °F <i>/</i> ${c} °C</span>`;
}

function weatherHtml() {
  const w = state.weather;
  if (!w) return '';
  const hours = (w.hours || []).slice(0, 5);
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
    `<div class="hw-hours">${cells}</div>`;
}

const TZ = 'America/Chicago';
function dayLabel(ymdStr) {
  const today = ymd(now());
  if (ymdStr === today) return 'Today';
  if (ymdStr === addDaysYmd(today, 1)) return 'Tomorrow';
  const d = new Date(`${ymdStr}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
}
function kickoff(iso) {
  const d = new Date(iso);
  const day = ymd(d);
  const t = d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
  const today = ymd(now());
  const wd = day === today ? 'Today' : day === addDaysYmd(today, 1) ? 'Tomorrow'
    : d.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' });
  return `${wd} ${t}`;
}
function daysHtml() {
  const ex = state.extras || {};
  const hol = (ex.holidays || []).map((h) =>
    `<div class="hd-c"><span class="hd-when"><i class="hd-cc hd-${h.country.toLowerCase()}">${esc(h.country)}</i>${esc(dayLabel(h.date))}</span>` +
    `<b class="hd-name">${esc(h.country === 'BR' ? h.local : h.name)}</b></div>`).join('');
  const fx = (ex.fixtures || []).map((f) =>
    `<div class="hd-c hd-game"><span class="hd-when"><i class="hd-cc hd-fla">FLA</i>${esc(kickoff(f.start))}</span>` +
    `<b class="hd-name">${f.home ? 'vs' : '@'} ${esc(f.opponent)} <small>${esc(f.competition)}</small></b></div>`).join('');
  if (!hol && !fx) return '';
  return `<div class="hd-row">${hol}${fx}</div>`;
}

function personWhen(p) {
  return nextPersonWhen(state.events, p.id, now());
}

function familyHtml() {
  if (V2) {
    return '<div class="h-faces">' + FAMILY.map((p) => `<button class="h-face" type="button" data-go="${p.id}" style="${pstyle(p)}" aria-label="${esc(p.name)}">${avatar(p)}</button>`).join('') + '</div>';
  }
  return FAMILY.map((p) => {
    const sub = personWhen(p);
    const when = `<small>${esc(sub)}</small>`;
    return `<button class="h-who" type="button" data-go="${p.id}" style="${pstyle(p)}">${avatar(p)}` +
      `<span class="h-who-meta"><b>${esc(p.name)}</b>${when}</span></button>`;
  }).join('');
}

// 'Today' / 'Tomorrow' / 'Wed, Oct 14' in America/Chicago.
function heroDay(iso) {
  const tz = 'America/Chicago';
  const key = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const d = new Date(iso);
  const t = now();
  if (key(d) === key(t)) return 'Today';
  if (key(d) === key(new Date(t.getTime() + 86400000))) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(d);
}

const V2 = typeof location !== 'undefined' && /[?&]layout=v2\b/.test(location.search);

// v2 mockup: the next few events after Next Up, filling the hero's empty lower half.
function thenHtml(cur) {
  const n = now();
  const today = ymd(n);
  const list = state.events
    .filter((e) => e.id !== cur.id && !e.allDay && new Date(e.start) > new Date(cur.start))
    .sort((a, b) => String(a.start).localeCompare(String(b.start)))
    .slice(0, 3);
  if (!list.length) return '';
  return '<div class="h-then"><div class="label label--on">After that</div>' + list.map((e) => {
    const who = e.everyone ? 'Everyone' : e.people.map((pid) => (FAMILY.find((m) => m.id === pid) || {}).name || '').join(' + ');
    return `<div class="h-then-row"><span class="h-then-t">${esc(heroDay(e.start))} ${esc(formatTime(e.start))}</span>` +
      `<span class="h-then-n">${esc(compactTitle(e.displayTitle || e.title))}</span><span class="h-then-w">${esc(who)}</span></div>`;
  }).join('') + '</div>';
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
    : `${heroDay(e.start)} · ${formatRangeSafe(e)}${e.location ? ` · ${esc(e.location)}` : ''}`;
  return `<button class="h-hero" type="button" style="${pstyle(p)}" data-ev="${esc(e.id)}">` +
    `<div class="h-hero-main"><div class="label label--on">Next up · ${esc(who)}</div>` +
    `<div class="h-hero-title serif">${esc(eventTitle(e))}</div>` +
    `<div class="h-hero-meta">${meta}</div>${leaveHtml(e, up.phase)}${V2 ? thenHtml(e) : ''}</div>` +
    `<div class="h-hero-big"><div class="h-hero-day">${esc(heroDay(e.start).replace(',', '').toUpperCase())}</div>${big}</div></button>`;
}

const etas = {};
function etaFor(loc, startIso) {
  const c = etas[loc];
  if (c && (c.pending || Date.now() - c.at < 10 * 60000)) return c.data;
  etas[loc] = { pending: true, at: Date.now(), data: c ? c.data : null };
  fetch(`/api/eta?to=${encodeURIComponent(loc)}&start=${encodeURIComponent(startIso || '')}`).then((r) => r.json()).then((d) => {
    etas[loc] = { at: Date.now(), data: d };
    const slot = document.querySelector('.h-hero-slot');
    if (slot) slot.innerHTML = heroHtml();
  }).catch(() => { etas[loc] = { at: Date.now(), data: c ? c.data : null }; });
  return etas[loc].data;
}

function leaveHtml(e, phase) {
  if (phase !== 'soon' || !e.location || e.allDay) return '';
  const eta = etaFor(e.location, e.start);
  if (!eta || !eta.ok) return '';
  const start = new Date(e.start).getTime();
  const leaveAt = start - (eta.minutes + 5) * 60000;
  const left = (leaveAt - now().getTime()) / 60000;
  const drive = `<span class="lv-drive">${eta.minutes} min drive${eta.source === 'tomtom' ? ' · live traffic' : ''}</span>`;
  const by = formatTime(new Date(leaveAt).toISOString());
  let cls = 'lv';
  let txt;
  if (left > 60) txt = `Leave by ${esc(by)}`;
  else if (left > 0) { txt = `Leave in ${Math.ceil(left)} min`; if (left <= 15) cls += ' lv--soon'; }
  else if (now().getTime() <= start - eta.minutes * 60000) { cls += ' lv--now'; txt = 'Leave now'; }
  else { cls += ' lv--late'; txt = `Running late · ${Math.ceil((now().getTime() + eta.minutes * 60000 - start) / 60000)} min`; }
  return `<div class="lv-row"><span class="${cls}"><i class="lv-dot"></i>${txt}</span>${drive}</div>`;
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
  const tg = state.tagger;
  let warn = '';
  if (tg && tg.stale) {
    const since = tg.lastSuccess ? formatTime(tg.lastSuccess) : '';
    warn = `<div class="h-tagwarn">Store tags not updating${since ? ` since ${esc(since)}` : ''}</div>`;
  }
  return warn + `<div class="label">Grocery</div><div class="h-stat"><span class="num">${open.length}</span><small>items to get</small></div>` +
    `<ul class="h-recent">${recent.map((g) => `<li><i></i>${esc(g.name)}</li>`).join('')}</ul>`;
}

function realPhotos() {
  return state.photoSource === 'folder' && state.photos.length > 0;
}

let homeSlides = null;

function showSlide(root) {
  const photoBtn = root.querySelector('.h-photo');
  if (!photoBtn) return;
  if (!realPhotos()) {
    photoBtn.classList.add('is-mark');
    if (homeSlides) homeSlides.stop();
    return;
  }
  photoBtn.classList.remove('is-mark');
  const stage = photoBtn.querySelector('.h-photo-stage');
  if (homeSlides && homeSlides.host !== stage) { homeSlides.stop(); homeSlides = null; }
  if (!homeSlides) {
    homeSlides = createSlides(stage, {
      interval: 15000,
      onShow(photo) {
        const cap = photoBtn.querySelector('.h-photo-cap');
        if (cap) { cap.innerHTML = photo.caption ? `<span>${esc(photo.caption)}</span>` : ''; cap.style.display = photo.caption ? '' : 'none'; }
      },
    });
    homeSlides.host = stage;
  }
  homeSlides.start();
  homeSlides.setPhotos(state.photos);
}

function paint(el) {
  const clock = el.querySelector('[data-clock]');
  if (clock) clock.innerHTML = clockHtml(now());
  el.querySelector('.h-weather').innerHTML = weatherHtml();
  el.querySelector('.h-family').innerHTML = familyHtml();
  el.querySelector('.h-hero-slot').innerHTML = heroHtml();
  el.querySelector('.h-lanes').innerHTML = lanesHtml();
  el.querySelector('.h-days').innerHTML = daysHtml();
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
        `<div class="h-main"><div class="h-hero-slot"></div><div class="h-days"></div><div class="h-lanes"></div></div>` +
        `<div class="h-side">` +
        `<button class="h-photo" type="button" data-go="photos"><div class="h-photo-stage"></div>` +
        `<div class="h-photo-mark"><img src="/emblem.png" alt=""><span class="serif">${esc(BRAND)}</span></div>` +
        `<div class="h-photo-cap"></div></button>` +
        `<button class="h-chores card" type="button" data-go="chores"></button>` +
        `<button class="h-shop card" type="button" data-go="grocery"></button>` +
        `</div></div>`;
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
