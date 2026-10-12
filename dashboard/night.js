export const DEFAULT_NIGHT_START = '23:00';
export const DEFAULT_NIGHT_END = '06:00';
export const NIGHT_WAKE_MS = 2 * 60 * 1000;
export const NIGHT_DRIFT_MINUTES = 3;

export function parseClockMinutes(value, fallbackMinutes) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return fallbackMinutes;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return fallbackMinutes;
  return hour * 60 + minute;
}

export function clockLabel(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// start === end turns the window off. A later end is a same-day range;
// an earlier end wraps past midnight (23:00–06:00). The end minute is day.
export function inNightWindow(hour, minute, startMin, endMin) {
  const nowMin = hour * 60 + minute;
  if (startMin === endMin) return false;
  if (startMin < endMin) return nowMin >= startMin && nowMin < endMin;
  return nowMin >= startMin || nowMin < endMin;
}

export function nightAnchor(slot) {
  const n = Math.abs(Number(slot) || 0);
  return {
    x: 8 + ((n * 37) % 64),
    y: 12 + ((n * 53) % 58),
  };
}
