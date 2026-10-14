export const ICONS = {
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/><circle cx="12" cy="12" r="6.6"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  tasks: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M7.5 12l3 3 6-6"/>',
  cart: '<path d="M3 4h2.2l2.3 11h10.8L21 8H6.5"/><circle cx="10" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  up: '<path d="M12 19V5M7 10l5-5 5 5"/>',
  down: '<path d="M12 5v14M7 14l5 5 5-5"/>',
  sun: '<circle cx="12" cy="12" r="3.6"/><path d="M12 2.6v2.2M12 19.2v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/>',
  moon: '<path d="M15.8 3.2a7.1 7.1 0 1 0 5 12.6A5.7 5.7 0 0 1 15.8 3.2z"/>',
  cloud: '<path d="M7.2 17.6h9.4a3.5 3.5 0 0 0 .4-7 5.2 5.2 0 0 0-10 1.5 3 3 0 0 0 .2 5.5z"/>',
  partly: '<circle cx="7.2" cy="7" r="2.1"/><path d="M7.2 2.5v1.3M7.2 10.2v1.3M2.6 7h1.3M10.4 7h1.3M4 3.8l.9.9M10.4 3.8l-.9.9M4 10.2l.9-.9"/><path d="M9.4 19.2h8.2a3 3 0 0 0 .3-6 4.5 4.5 0 0 0-8.6 1.3 2.5 2.5 0 0 0 .1 4.7z"/>',
  night: '<path d="M8.4 2.8a3.5 3.5 0 1 0 2.3 6.1A2.7 2.7 0 0 1 8.4 2.8z"/><path d="M8.8 19.2h8.4a3.1 3.1 0 0 0 .3-6.2 4.6 4.6 0 0 0-8.8 1.4 2.6 2.6 0 0 0 .1 4.8z"/>',
  rain: '<path d="M7.2 14.2h9.4a3.5 3.5 0 0 0 .4-7 5.2 5.2 0 0 0-10 1.5 3 3 0 0 0 .2 5.5z"/><path d="M8.6 16.6v2.6M12 16.6v2.6M15.4 16.6v2.6"/>',
  snow: '<path d="M7.2 13.6h9.4a3.5 3.5 0 0 0 .4-7 5.2 5.2 0 0 0-10 1.5 3 3 0 0 0 .2 5.5z"/><path d="M8.6 16.2v2.2M7.5 17.3h2.2M12 16.2v2.2M10.9 17.3h2.2M15.4 16.2v2.2M14.3 17.3h2.2"/>',
  storm: '<path d="M7.2 13.4h9.4a3.5 3.5 0 0 0 .4-7 5.2 5.2 0 0 0-10 1.5 3 3 0 0 0 .2 5.5z"/><path d="M12.4 13.2l-2.1 3.5h2.2L10.4 20"/>',
  fog: '<path d="M4 8h16M4 12h16M6 16h12M8 20h8"/>',
};

export function icon(name, size, stroke) {
  const s = size || 24;
  const w = stroke || 2.25;
  return `<svg class="i" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}
