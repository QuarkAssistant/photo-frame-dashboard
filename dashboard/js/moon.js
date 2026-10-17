// Moon phase from the Sun and Moon positions (low-precision formulas as used by SunCalc,
// after Meeus "Astronomical Algorithms"); about 1 % accurate, plenty for a wall display.
const RAD = Math.PI / 180;
const E = RAD * 23.4397; // obliquity of the Earth
const J2000 = 2451545;

const toDays = (date) => date.valueOf() / 86400000 - 0.5 + 2440588 - J2000;
const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(E) - Math.tan(b) * Math.sin(E), Math.cos(l));
const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(E) + Math.cos(b) * Math.sin(E) * Math.sin(l));

function sunCoords(d) {
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}
function moonCoords(d) {
  const L = RAD * (218.316 + 13.176396 * d);
  const M = RAD * (134.963 + 13.064993 * d);
  const F = RAD * (93.272 + 13.22935 * d);
  const l = L + RAD * 6.289 * Math.sin(M);
  const b = RAD * 5.128 * Math.sin(F);
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: 385001 - 20905 * Math.cos(M) };
}

const NAMES = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];

// { fraction 0–1 lit, phase 0–1 through the cycle (0 new, .5 full), waxing, name, pct }
export function moonPhase(date = new Date()) {
  const d = toDays(date);
  const s = sunCoords(d);
  const m = moonCoords(d);
  const sdist = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  const fraction = (1 + Math.cos(inc)) / 2;
  const phase = 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI;
  const waxing = phase < 0.5;
  const pct = Math.round(fraction * 100);
  let name;
  if (pct <= 2) name = NAMES[0];
  else if (pct >= 98) name = NAMES[4];
  else if (pct >= 47 && pct <= 53) name = waxing ? NAMES[2] : NAMES[6];
  else if (pct < 50) name = waxing ? NAMES[1] : NAMES[7];
  else name = waxing ? NAMES[3] : NAMES[5];
  return { fraction, phase, waxing, name, pct };
}

// Small moon: dark disc, lit part on the right while waxing (left while waning), as seen from
// the northern hemisphere. Thin outline so it reads on cream and on the night palette.
export function moonSvg(m, size = 30) {
  const r = 10;
  const k = Math.max(0, Math.min(1, m.fraction));
  const rx = Math.abs(1 - 2 * k) * r;
  const lit = m.waxing ? 1 : 0; // outer arc on the right (sweep 1) when waxing
  const term = k < 0.5 ? (m.waxing ? 0 : 1) : (m.waxing ? 1 : 0);
  const d = k <= 0.005 ? '' : k >= 0.995
    ? `<circle cx="12" cy="12" r="${r}" fill="#F3E7C4"/>`
    : `<path d="M12 2A${r} ${r} 0 0 ${lit} 12 22A${rx.toFixed(2)} ${r} 0 0 ${term} 12 2Z" fill="#F3E7C4"/>`;
  return `<svg class="wv2-moon" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">` +
    `<circle cx="12" cy="12" r="${r}" fill="#3A4A52"/>${d}` +
    `<circle cx="12" cy="12" r="${r}" fill="none" stroke="rgba(31,42,46,0.55)" stroke-width="1"/></svg>`;
}
