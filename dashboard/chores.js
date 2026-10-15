// Shared (server + client) helpers for chores.
// Recurring chores have a `routine` (morning/after/evening).
// One-off chores have `oneOff: true` and a `due` date (YYYY-MM-DD). They count in
// every routine ring and stay visible until checked off (no midnight expiry).
export function isOneOff(c) {
  return Boolean(c && c.oneOff);
}

export function inRoutine(c, routineId) {
  return isOneOff(c) || c.routine === routineId;
}

export function choreSubtitle(c, routines, today) {
  if (!isOneOff(c)) return (routines.find((r) => r.id === c.routine) || {}).name || '';
  if (!c.due) return 'One-off';
  if (today && c.due < today && !c.done) return 'One-off · overdue';
  if (today && c.due === today) return 'One-off · today';
  const [, m, d] = c.due.split('-').map(Number);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  return `One-off · ${mon} ${d}`;
}

// Open one-offs first (they are urgent and must not scroll out of view),
// then recurring chores in their usual order, then checked-off one-offs.
const rank = (c) => (isOneOff(c) ? (c.done ? 2 : 0) : 1);
export function sortChores(list) {
  return list.slice().sort((a, b) => rank(a) - rank(b));
}
