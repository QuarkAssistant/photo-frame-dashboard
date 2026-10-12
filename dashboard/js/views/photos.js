import { BRAND } from '../../family.js';
import { state } from '../data.js';
import { icon } from '../icons.js';
import { register } from '../app.js';
import { esc } from '../ui.js';

let index = 0;

function paint(el) {
  const photos = state.photos.length ? state.photos : [{ url: '/placeholders/garden.svg', caption: 'Home' }];
  index = ((index % photos.length) + photos.length) % photos.length;
  const photo = photos[index];
  el.querySelector('.ph-stage').innerHTML = `<img src="${esc(photo.url)}" alt="">`;
  el.querySelector('.ph-cap').innerHTML = `<img src="/icon-192.png" alt=""><div><b>${esc(BRAND)}</b><span class="serif">${esc(photo.caption || '')}</span></div>`;
}

register('photos', {
  show(el) {
    if (!el.dataset.built) {
      el.dataset.built = '1';
      el.innerHTML = `<div class="photos">` +
        `<button class="ph-nav" type="button" data-photo="-1" aria-label="Previous">${icon('left', 36)}</button>` +
        `<div class="ph-stage"></div>` +
        `<button class="ph-nav" type="button" data-photo="1" aria-label="Next">${icon('right', 36)}</button>` +
        `<div class="ph-cap"></div></div>`;
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
