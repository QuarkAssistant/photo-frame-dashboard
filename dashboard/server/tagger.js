// Grocery tagger: keeps ONE "stores: #a #b" line in the notes of each incomplete
// reminder in the grocery list. Never touches titles, completion, dates or other
// notes lines. A stores line that differs from what the tagger last wrote is
// treated as hand-edited and left alone forever (state file per reminder id).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MAP_FILE = path.join(here, 'tagger-map.json');
const STATE_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'coelho-tagger');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const EVERY_MS = 5 * 60 * 1000;
const LINE_RE = /^stores:/i;

export const taggerStatus = { last: null, applied: [], skipped: [], error: null };

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
      tags: r.tags.filter((t) => allowed.has(t)),
      keys: r.keywords.map(normalize).filter(Boolean),
    })),
  };
}

export function classify(title, map) {
  const t = ` ${normalize(title)} `;
  for (const r of map.rules) {
    if (r.tags.length && r.keys.some((k) => t.includes(` ${k} `))) return r.tags;
  }
  return null;
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

export function startTagger(deps) {
  const tick = async () => {
    try {
      const res = await runTagger(deps);
      taggerStatus.applied = res.filter((r) => r.action === 'add' || r.action === 'replace');
      taggerStatus.skipped = res.filter((r) => r.action === 'hand-edited' || r.action === 'untagged');
      taggerStatus.error = null;
    } catch (e) {
      taggerStatus.error = String(e && e.message ? e.message : e);
    }
    taggerStatus.last = new Date().toISOString();
  };
  tick();
  setInterval(tick, EVERY_MS).unref();
}
