// Grocery tagger: keeps ONE "stores: #a #b" line in the notes of each incomplete
// reminder in the grocery list. Never touches titles, completion, dates or other
// notes lines. A stores line that differs from what the tagger last wrote is
// treated as hand-edited and left alone forever (state file per reminder id).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const MAP_FILE = path.join(here, 'tagger-map.json');
const STATE_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'coelho-tagger');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const EVERY_MS = 5 * 60 * 1000;
const LINE_RE = /^stores:/i;

const LOG_FILE = path.join(os.homedir(), 'Library', 'Logs', 'coelho-tagger.log');
const LOG_MAX = 1024 * 1024;
const STALE_MS = 30 * 60 * 1000;
const FAIL_LIMIT = 3;

export const taggerStatus = {
  last: null, lastSuccess: null, lastError: null, lastErrorAt: null, consecutiveFailures: 0,
  checked: 0, changed: 0, applied: [], skipped: [], error: null, stale: false, intervalMinutes: 5,
};

export function normalize(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

export function loadMap(file = MAP_FILE) {
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  const allowed = new Set(m.allowed);
  return {
    allowed,
    rules: m.rules.map((r) => ({
      also: Boolean(r.also),
      tags: r.tags.filter((t) => allowed.has(t)),
      keys: r.keywords.map(normalize).filter(Boolean),
    })),
  };
}

export function classify(title, map) {
  const t = ` ${normalize(title)} `;
  const hit = (r) => r.tags.length && r.keys.some((k) => t.includes(` ${k} `));
  // First matching normal rule wins; "also" rules (e.g. #wildfork) add their tags on top.
  let base = null;
  for (const r of map.rules) if (!r.also && hit(r)) { base = r.tags; break; }
  const extra = map.rules.filter((r) => r.also && hit(r)).flatMap((r) => r.tags);
  // Nothing is ever left untagged: unknown items can be bought anywhere.
  if (!base) base = map.allowed.has('#any') ? ['#any'] : [];
  const tags = [...new Set([...base, ...extra])];
  return tags.length ? tags : null;
}

export function tagLine(tags) {
  return `stores: ${tags.join(' ')}`;
}

// Pure decision for one item. Returns { action, notes, line }.
// action: 'add' | 'replace' | 'same' | 'hand-edited' | 'untagged'
export function plan(notes, tags, lastWritten) {
  if (!tags) return { action: 'untagged', notes, line: null };
  const want = tagLine(tags);
  const lines = String(notes || '').split('\n');
  const idx = lines.findIndex((l) => LINE_RE.test(l.trim()));
  if (idx < 0) {
    const text = String(notes || '');
    return { action: 'add', notes: text.trim() ? `${text.replace(/\n+$/, '')}\n${want}` : want, line: want };
  }
  const cur = lines[idx].trim();
  if (cur === want) return { action: 'same', notes, line: want };
  if (lastWritten == null || cur !== lastWritten) return { action: 'hand-edited', notes, line: cur };
  lines[idx] = want;
  return { action: 'replace', notes: lines.join('\n'), line: want };
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}
function writeState(s) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(`${STATE_FILE}.tmp`, JSON.stringify(s, null, 2));
  fs.renameSync(`${STATE_FILE}.tmp`, STATE_FILE);
}

export async function runTagger({ dryRun = false, list, setNotes } = {}) {
  const map = loadMap();
  const state = readState();
  const items = await list();
  const out = [];
  for (const it of items) {
    const tags = classify(it.title, map);
    const p = plan(it.notes, tags, state[it.id] ? state[it.id].line : null);
    out.push({ id: it.id, title: it.title, action: p.action, line: p.line });
    if (dryRun) continue;
    if (p.action === 'add' || p.action === 'replace') {
      await setNotes(it.id, p.notes);
      state[it.id] = { line: p.line, at: new Date().toISOString() };
    } else if (p.action === 'same' && !state[it.id]) {
      state[it.id] = { line: p.line, at: new Date().toISOString() };
    }
  }
  if (!dryRun) writeState(state);
  return out;
}

export function appendLog(line, file = LOG_FILE) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let size = 0;
    try { size = fs.statSync(file).size; } catch { /* new file */ }
    if (size > LOG_MAX) {
      // Keep the newest half when the log passes ~1 MB.
      const text = fs.readFileSync(file, 'utf8');
      fs.writeFileSync(file, text.slice(Math.floor(text.length / 2)).replace(/^[^\n]*\n/, ''));
    }
    fs.appendFileSync(file, `${line}\n`);
  } catch { /* logging must never break a run */ }
}

export function isStale(status, nowMs = Date.now()) {
  if (status.consecutiveFailures >= FAIL_LIMIT) return true;
  const ok = status.lastSuccess ? Date.parse(status.lastSuccess) : 0;
  const started = status.startedAt ? Date.parse(status.startedAt) : nowMs;
  return nowMs - (ok || started) > STALE_MS;
}

function macNotify(text) {
  execFile('osascript', ['-e', `display notification ${JSON.stringify(text)} with title "Coelho dashboard"`], () => {});
}

// One run. Never throws; updates status, writes one log line, flags failures.
export async function taggerTick(deps, status = taggerStatus) {
  const t0 = new Date();
  if (!status.startedAt) status.startedAt = t0.toISOString();
  const log = deps.log || appendLog;
  const notify = deps.notify || macNotify;
  const wasStale = status.stale;
  try {
    const res = await runTagger(deps);
    status.applied = res.filter((r) => r.action === 'add' || r.action === 'replace');
    status.skipped = res.filter((r) => r.action === 'hand-edited' || r.action === 'untagged');
    status.checked = res.length;
    status.changed = status.applied.length;
    status.lastSuccess = t0.toISOString();
    status.consecutiveFailures = 0;
    status.error = null;
    log(`${t0.toISOString()} ok checked=${status.checked} changed=${status.changed} skipped=${status.skipped.length}`);
  } catch (e) {
    const msg = String(e && e.message ? e.message : e).slice(0, 200);
    status.consecutiveFailures += 1;
    status.lastError = msg;
    status.lastErrorAt = t0.toISOString();
    status.error = msg;
    log(`${t0.toISOString()} error failures=${status.consecutiveFailures} ${msg}`);
  }
  status.last = t0.toISOString();
  status.stale = isStale(status, Date.now());
  if (status.stale && !wasStale) notify('Grocery store tags are not updating. Check the dashboard server.');
  if (!status.stale && wasStale) notify('Grocery store tags are updating again.');
  return status;
}

export function startTagger(deps) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await taggerTick(deps); } catch { /* taggerTick never throws; belt and braces */ }
    busy = false;
  };
  tick();
  setInterval(tick, EVERY_MS).unref();
  // Re-check staleness between runs too (e.g. a run that hangs).
  setInterval(() => {
    const was = taggerStatus.stale;
    taggerStatus.stale = isStale(taggerStatus);
    if (taggerStatus.stale && !was) macNotify('Grocery store tags are not updating. Check the dashboard server.');
  }, 60 * 1000).unref();
}
