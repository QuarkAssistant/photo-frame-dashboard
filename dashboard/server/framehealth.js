// Frame health probe parsers (read-only ADB output → numbers). Pure, so the tests
// can feed recorded text. The probe script (scripts/frame-health.mjs) runs adb on
// the Mac; nothing is installed on or changed on the frame.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const KIOSK_PACKAGE = 'com.wesbos.homehq';
export const HISTORY_HOURS = 24;

export function healthFile() {
  return process.env.FRAME_HEALTH_FILE
    || path.join(os.homedir(), 'Library', 'Application Support', 'coelho-dashboard', 'frame-health.json');
}

// `dumpsys meminfo <pkg>` → TOTAL PSS in MB. Android 6 prints "TOTAL  <pss> ..." in
// the App Summary table, newer builds "TOTAL PSS: <kb>". Returns null when absent.
export function parseMeminfo(text) {
  const s = String(text || '');
  let m = /TOTAL PSS:\s*([\d,]+)/.exec(s);
  if (!m) m = /^\s*TOTAL\s+([\d,]+)/m.exec(s);
  if (!m) return null;
  return Math.round(Number(m[1].replace(/,/g, '')) / 102.4) / 10;
}

// /proc/<pid>/stat → utime + stime (clock ticks). Field 2 is "(comm)" and may hold spaces.
export function parseProcStat(text) {
  const s = String(text || '').trim();
  const close = s.lastIndexOf(')');
  if (close < 0) return null;
  const rest = s.slice(close + 2).split(/\s+/);
  // rest[0] is field 3 (state); utime is field 14, stime field 15.
  const utime = Number(rest[11]);
  const stime = Number(rest[12]);
  if (!Number.isFinite(utime) || !Number.isFinite(stime)) return null;
  return utime + stime;
}

// Two samples of process ticks over `seconds` → average cores busy (1.0 = one full core).
export function coresBusy(ticksA, ticksB, seconds, hz = 100) {
  if (ticksA == null || ticksB == null || !(seconds > 0)) return null;
  const d = Math.max(0, ticksB - ticksA);
  return Math.round((d / hz / seconds) * 100) / 100;
}

// thermal_zone*/temp is millidegrees on most Allwinner kernels, plain degrees on some.
export function parseThermal(text) {
  const n = Number(String(text || '').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 1000 ? Math.round(n / 100) / 10 : n;
}

// `dumpsys package com.android.webview` → versionName.
export function parseVersionName(text) {
  const m = /versionName=([\w.\-]+)/.exec(String(text || ''));
  return m ? m[1] : null;
}

// `cat /proc/uptime` → seconds since boot.
export function parseUptime(text) {
  const n = Number(String(text || '').trim().split(/\s+/)[0]);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

// Keeps the last 24 h of samples and the baseline (first sample, or the one marked
// baseline) so later phases can be compared against Phase 0.
export function addSample(doc, sample, hours = HISTORY_HOURS) {
  const d = doc && typeof doc === 'object' ? doc : {};
  const history = Array.isArray(d.history) ? d.history.slice() : [];
  history.push(sample);
  const cutoff = new Date(sample.at).getTime() - hours * 3600 * 1000;
  const kept = history.filter((h) => new Date(h.at).getTime() >= cutoff);
  const baseline = sample.baseline ? sample : (d.baseline || sample);
  const pss = kept.map((h) => h.pssMB).filter((v) => v != null);
  return {
    updatedAt: sample.at,
    latest: sample,
    baseline,
    peakPssMB24h: pss.length ? Math.max(...pss) : null,
    history: kept,
  };
}

export function readHealth(file = healthFile()) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

export function healthPayload(file = healthFile()) {
  const doc = readHealth(file);
  if (!doc || !doc.latest) return { ok: false, reason: 'no-probe-yet' };
  return { ok: true, updatedAt: doc.updatedAt, latest: doc.latest, baseline: doc.baseline, peakPssMB24h: doc.peakPssMB24h };
}
