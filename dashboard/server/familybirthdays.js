// Family birthdays for Home's Coming up, from FAMILY_BIRTHDAYS in .env (never committed):
//   FAMILY_BIRTHDAYS=<name or id>=<YYYY-MM-DD or MM-DD>,...
// Only family members are accepted. The birth year is dropped here, so no age reaches the page.
import { FAMILY } from '../family.js';

export function parseFamilyBirthdays(text) {
  const out = [];
  for (const raw of String(text || '').split(/[,;]/)) {
    const m = /^\s*([^=]+?)\s*=\s*(?:\d{4}-)?(\d{1,2})-(\d{1,2})\s*$/.exec(raw);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const p = FAMILY.find((f) => f.id === key || f.name.toLowerCase() === key);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (!p || month < 1 || month > 12 || day < 1 || day > 31) continue;
    if (out.some((b) => b.id === p.id)) continue;
    out.push({ id: p.id, name: p.name, month, day });
  }
  return out;
}
