// v2 icons (Phase 1). Stroke UI icons on a 24 px grid, and filled weather
// illustrations from the proposal (no SVG filters: they are slow on WebView 106).
const UI = {
  home: '<path d="M4 11 L12 4 L20 11 V20 H14 V14 H10 V20 H4Z"/>',
  cart: '<path d="M3 4H6L8.5 15H18L20 7H7"/><circle cx="9.5" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  car: '<path d="M5 16V11.5L7 6.5H17L19 11.5V16"/><path d="M3.5 16.5H20.5V19H3.5Z"/><circle cx="7.5" cy="13" r=".8"/><circle cx="16.5" cy="13" r=".8"/>',
  plane: '<path d="M2.5 13.5 21 6.5C22 6.2 22.5 7.5 21.6 8L9 15.5 6.5 19.5 5.5 19 6.3 15.2 2.5 13.5Z"/>',
  cake: '<rect x="4" y="11" width="16" height="9" rx="2"/><path d="M4 15C6 16.5 8 16.5 10 15S14 13.5 16 15 19 16.5 20 15M12 11V7.5"/><path d="M12 3.5C13 5 13 6 12 6.5 11 6 11 5 12 3.5Z"/>',
  ball: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5 15.5 10 14.2 14H9.8L8.5 10Z"/><path d="M12 3.5V7.5M15.5 10 20 9M14.2 14 16.5 18.8M9.8 14 7.5 18.8M8.5 10 4 9"/>',
  drop: '<path d="M12 3.5C15 8 17.5 11 17.5 14A5.5 5.5 0 0 1 6.5 14C6.5 11 9 8 12 3.5Z"/>',
  moonl: '<path d="M15 3.5A8.5 8.5 0 1 0 20.5 15 7 7 0 1 1 15 3.5Z"/>',
  sunset: '<path d="M3 18H21M6.5 14.5A5.5 5.5 0 0 1 17.5 14.5M12 4V7M4.6 8.6 6.3 10.3M19.4 8.6 17.7 10.3"/><path d="M8 21.5H16"/>',
  pin: '<path d="M12 21S5 14.5 5 9.5A7 7 0 0 1 19 9.5C19 14.5 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4.5C9 2.5 12 6.5 19 4.5V13.5C12 15.5 9 11.5 5 13.5"/>',
  bus: '<rect x="4.5" y="3.5" width="15" height="15" rx="3"/><path d="M4.5 11.5H19.5M8 18.5V21M16 18.5V21"/><circle cx="8.5" cy="15" r=".9"/><circle cx="15.5" cy="15" r=".9"/>',
  trophy: '<path d="M7.5 4H16.5V9.5A4.5 4.5 0 0 1 7.5 9.5Z"/><path d="M7.5 6H4.5C4.5 9 6 10.5 8 10.5M16.5 6H19.5C19.5 9 18 10.5 16 10.5M12 14V18M8.5 20.5H15.5"/>',
};

export function ui(name, size = 24, stroke = 2.4) {
  return `<svg class="v2i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${UI[name] || ''}</svg>`;
}

function rays(cx, cy, r1, r2, color) {
  let s = '';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    s += `<line x1="${(cx + r1 * Math.cos(a)).toFixed(1)}" y1="${(cy + r1 * Math.sin(a)).toFixed(1)}" x2="${(cx + r2 * Math.cos(a)).toFixed(1)}" y2="${(cy + r2 * Math.sin(a)).toFixed(1)}" stroke="${color}" stroke-width="6" stroke-linecap="round"/>`;
  }
  return s;
}
const CLOUD = 'M24 74 C10 74 8 56 22 53 C22 38 42 32 50 44 C56 30 80 32 80 50 C94 50 96 74 80 74 Z';
const SUN = `${rays(50, 50, 30, 42, '#F6B93B')}<circle cx="50" cy="50" r="22" fill="#F6B93B"/><circle cx="46" cy="46" r="13" fill="#FFD66B"/>`;
const MOON = '<path d="M62 18 A34 34 0 1 0 84 66 A28 28 0 1 1 62 18Z" fill="#EFE0AE"/><circle cx="22" cy="24" r="2.5" fill="#F6EFDF"/><circle cx="84" cy="22" r="2" fill="#F6EFDF"/><circle cx="76" cy="40" r="1.5" fill="#F6EFDF"/>';
const cloud = (tf, fill) => `<path transform="${tf}" d="${CLOUD}" fill="${fill}" stroke="#B9C6CC" stroke-width="1.5"/>`;
const drops = (c) => [[34, 80], [52, 84], [70, 80]].map(([x, y]) => `<path d="M${x} ${y} q-4 9 0 12 q4 -3 0 -12z" fill="${c}"/>`).join('');

const ART = {
  sun: SUN,
  moon: MOON,
  partly: `<g transform="translate(-10,-14) scale(.85)">${SUN}</g>${cloud('translate(6,8) scale(.95)', '#FFFFFF')}`,
  night: `<g transform="translate(-14,-16) scale(.8)">${MOON}</g>${cloud('translate(6,8) scale(.95)', '#D9E2E6')}`,
  cloud: `${cloud('translate(-6,-10) scale(.8)', '#C9D3D8')}${cloud('translate(4,4) scale(.95)', '#FFFFFF')}`,
  rain: `${cloud('translate(0,-14)', '#C9D3D8')}${drops('#4A90C8')}`,
  storm: `${cloud('translate(0,-14)', '#AEBBC2')}<path d="M54 64 44 80H52L46 94 62 74H54L60 64Z" fill="#F2B544"/>`,
  snow: `${cloud('translate(0,-14)', '#E3EAEE')}${[[34, 84], [52, 88], [70, 84]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="#FFFFFF" stroke="#B9C6CC"/>`).join('')}`,
  fog: `${cloud('translate(0,-16)', '#D9E2E6')}<path d="M18 74H82M26 84H74M34 94H66" stroke="#B9C6CC" stroke-width="5" stroke-linecap="round"/>`,
};

// Weather code from /api/weather → illustration. Clear and partly flip to night art when dark.
export function weatherArt(code, dark, size = 96) {
  let k = ART[code] ? code : 'partly';
  if (dark && k === 'sun') k = 'moon';
  if (dark && k === 'partly') k = 'night';
  return `<svg class="v2-art" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">${ART[k]}</svg>`;
}
