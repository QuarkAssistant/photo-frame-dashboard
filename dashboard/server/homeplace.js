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

// Loose match of a calendar location against HOME_ADDRESS: same street number and the
// same street name (abbreviations folded, e.g. "Cir" = "Circle"). Any line or comma part
// of the location can hold the street ("Home\n12 Example Cir, Springfield").
function numberAndStreet(text) {
  const w = words(text);
  if (!w.length || !/^\d+[a-z]?$/.test(w[0])) return null;
  const street = w.slice(1).join(' ');
  return street ? { num: w[0], street } : null;
}
export function isHomeAddress(location, address) {
  const home = numberAndStreet(String(address || '').split(',')[0]);
  if (!home || !location) return false;
  return String(location).split(/[\n,]/).some((part) => {
    const p = numberAndStreet(part);
    if (!p || p.num !== home.num) return false;
    // "12 Example Circle" vs "12 Example Cir Unit 3": the home street name must lead.
    return p.street === home.street || p.street.startsWith(`${home.street} `)
      || home.street.startsWith(`${p.street} `);
  });
}

// Home events say "Home" on the dashboard; the street address never leaves the server.
export function labelHomeEvents(events, address) {
  return (events || []).map((e) => (e && isHomeAddress(e.location, address) ? { ...e, location: 'Home', atHome: true } : e));
}
