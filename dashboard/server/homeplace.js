// Labels a Find My device reading as "Home" when its place text is the home street.
// Device rows (Items/Devices tab) show "Street Suffix, City" instead of "Home";
// People-tab rows already say "Home". HOME_ADDRESS comes from .env (never committed).
const ABBR = { cir: 'circle', st: 'street', ave: 'avenue', av: 'avenue', rd: 'road', dr: 'drive', ln: 'lane', ct: 'court', blvd: 'boulevard', pl: 'place', ter: 'terrace', trl: 'trail', pkwy: 'parkway', hwy: 'highway', way: 'way', sq: 'square' };
const words = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map((w) => ABBR[w] || w);
export function streetOf(address) {
  return words(String(address || '').split(',')[0]).filter((w, i) => !(i === 0 && /^\d+[a-z]?$/.test(w))).join(' ');
}
export function isHomePlace(place, address) {
  const street = streetOf(address);
  if (!street || !place) return false;
  const first = words(String(place).split(',')[0]).filter((w, i) => !(i === 0 && /^\d+[a-z]?$/.test(w))).join(' ');
  return first === street;
}
export function labelHome(people, address) {
  for (const v of Object.values(people || {})) {
    if (v && v.source === 'device' && isHomePlace(v.place, address)) { v.place = 'Home'; v.detail = 'home'; }
  }
  return people;
}
