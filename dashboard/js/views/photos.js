import { BRAND } from '../../family.js';
import { state } from '../data.js';
import { icon } from '../icons.js';
import { register } from '../app.js';
import { esc } from '../ui.js';

let index = 0;

function paint(el) {
  const real = state.photoSource === 'folder' && state.photos.length > 0;
  el.querySelectorAll('.ph-nav').forEach((b) => { b.hidden = !real; });
  if (!real) {
    el.querySelector('.ph-stage').innerHTML =
      `<div class="ph-mark"><img src="/emblem.png" alt=""><span class="serif">${esc(BRAND)}</span></div>`;
    el.querySelector('.ph-cap').innerHTML = '';
    return;
  }
  const photos = state.photos;
  index = ((index % photos.length) + photos.length) % photos.length;
  const photo = photos[index];
  el.querySelector('.ph-stage').innerHTML = `<img src="${esc(photo.url)}" alt="">`;
  el.querySelector('.ph-cap').innerHTML = `<img src="/emblem.png" alt=""><div><b>${esc(BRAND)}</b><span class="serif">${esc(photo.caption || '')}</span></div>`;
}

register('photos', {
  show(el) {
    if (!el.dataset.built) {
      el.dataset.built = '1';
      el.innerHTML = `<div class="photos">` +
        `<button class="ph-nav" type="button" data-photo="-1" aria-label="Previous">${icon('left', 36)}</button>` +
        `<div class="ph-stage"></div>` +
        `<button class="ph-nav" type="button" data-photo="1" aria-label="Next">${icon('right', 36)}</button>` +
        `<div class="ph-cap"></div>` +
        (document.documentElement.classList.contains('ui-v2')
          ? `<button class="v2-back" type="button" data-go="media">${icon('back', 30, 2.6)}<span>Media</span></button>`
          : '') +
        `</div>`;
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-photo]');
        if (!b) return;
        index += Number(b.dataset.photo);
        paint(el);
      });
    }
    paint(el);
  },
});
