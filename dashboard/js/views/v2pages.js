// v2 Phase 0 placeholder pages. Each one keeps every existing feature one tap away
// and shows only real data (or plain text), never sample content. The real pages
// arrive in later phases (Family in 3, Media and The Long Drift in 4, Cameras in 5,
// Coming up in 2).
import { FAMILY } from '../../family.js';
import { state } from '../data.js';
import { icon } from '../icons.js';
import { currentRoute, lastPersonViewed, register } from '../app.js';
import { avatar, esc } from '../ui.js';

function back() {
  const r = currentRoute();
  if (!r || !r.parent) return '';
  const label = { calendar: 'Calendar', media: 'Media', family: 'Family' }[r.parent] || 'Back';
  return `<button class="v2-back" type="button" data-go="${esc(r.parent)}">${icon('back', 30, 2.6)}<span>${esc(label)}</span></button>`;
}

function head(title, sub, ic) {
  return `<header class="v2-head">${back()}` +
    (ic ? `<span class="v2-head-i">${icon(ic, 40, 2.4)}</span>` : '') +
    `<h1>${esc(title)}</h1>${sub ? `<span class="v2-sub">${esc(sub)}</span>` : ''}</header>`;
}

function soon(text) {
  return `<span class="v2-tag">${esc(text)}</span>`;
}

const pages = {
  family() {
    const last = lastPersonViewed();
    const cards = FAMILY.map((p) =>
      `<button class="v2-card v2-person v2-p-${esc(p.id)}${p.id === last ? ' is-last' : ''}" type="button" data-go="${esc(p.id)}">` +
      `<i class="v2-pbar"></i>${avatar(p)}<b>${esc(p.name)}</b>` +
      `<span class="v2-sec">${p.id === last ? 'Last viewed' : 'Open page'}</span></button>`).join('');
    return head('Family', 'Tap a person') + `<div class="v2-grid4">${cards}</div>`;
  },
  media() {
    const n = state.photoSource === 'folder' ? (state.photos || []).length : 0;
    return head('Media', 'Photos and The Long Drift') +
      `<div class="v2-grid2">` +
      `<button class="v2-card v2-tile" type="button" data-go="photos"><span class="v2-tile-i">${icon('photo', 64, 2.2)}</span>` +
      `<b>Photos</b><span class="v2-sec">${n ? `${n} photos in the slideshow` : 'Family album slideshow'}</span></button>` +
      `<button class="v2-card v2-tile" type="button" data-go="long-drift"><span class="v2-tile-i">${icon('film', 64, 2.2)}</span>` +
      `<b>The Long Drift</b><span class="v2-sec">Aired episodes only</span>${soon('Coming soon')}</button>` +
      `</div>`;
  },
  'long-drift'() {
    return head('The Long Drift', '', 'film') +
      `<div class="v2-card v2-note"><b>Coming soon</b>` +
      `<p>Only episodes that have already aired will show here, with the art exactly as published.</p>` +
      `<p class="v2-sec">The season and episode picker arrives once the published-only link is ready.</p></div>`;
  },
  cameras() {
    return head('Cameras', '', 'camera') +
      `<div class="v2-card v2-note"><b>Coming soon</b>` +
      `<ul class="v2-list">` +
      `<li>${icon('camera', 28, 2.4)}<span>Live video runs only while this page is open, one camera at a time.</span></li>` +
      `<li>${icon('bell', 28, 2.4)}<span>When someone rings the doorbell, its live video pops up on any page.</span></li>` +
      `<li>${icon('x', 28, 2.4)}<span>No motion pop-ups.</span></li>` +
      `</ul></div>`;
  },
  'coming-up'() {
    return head('Coming up', '', 'plane') +
      `<div class="v2-card v2-note"><b>Coming soon</b>` +
      `<p>Trips and countdowns will live here, under Calendar.</p>` +
      `<p class="v2-sec">Until then, every event is in the Calendar agenda.</p>` +
      `<button class="v2-btn" type="button" data-go="calendar">${icon('calendar', 26, 2.4)}<span>Open Calendar</span></button></div>`;
  },
};

for (const [name, render] of Object.entries(pages)) {
  register(name, {
    show(el) {
      const html = `<div class="v2-page">${render()}</div>`;
      if (el.__html === html) return;
      el.__html = html;
      el.innerHTML = html;
    },
  });
}
