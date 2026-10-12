import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const TTL = 60 * 1000;
const HELPER_TIMEOUT = 8000;
const AUTH_ERRORS = new Set([
  'denied', 'restricted', 'notDetermined', 'writeOnly',
  'noList', 'missingPrefix', 'missingTitle', 'missingId', 'notFound', 'unknownCommand',
]);
const here = path.dirname(fileURLToPath(import.meta.url));
const swiftSrc = path.join(here, 'reminders.swift');
const jxaSrc = path.join(here, 'reminders.jxa.js');
const bin = path.join(here, 'bin', 'reminders-grocery');

let binPromise = null;
let cache = { at: 0, data: null, failed: false, reason: '', ttl: TTL };

function helperReason(err) {
  const stdout = String(err.stdout || '').trim();
  if (stdout) {
    try {
      const data = JSON.parse(stdout);
      if (data && data.error) return String(data.error);
    } catch { /* helper spoke prose */ }
  }
  const blob = `${err.stderr || ''} ${err.message || ''}`.toLowerCase();
  if (err.killed || err.code === 'ETIMEDOUT' || blob.includes('timed out') || blob.includes('sigkill')) return 'timeout';
  if (blob.includes('not authorized') || blob.includes('(-1743)') || blob.includes('denied') || blob.includes('not permitted')) return 'denied';
  if (blob.includes('not determined')) return 'notDetermined';
  return String(err.message || 'failed').slice(0, 180);
}

function prefix() {
  return process.env.REMINDERS_GROCERY_LIST || 'Supermercado';
}

// Store tags ("stores: #..." lines written by the tagger) are for phone shortcuts only;
// never send them to the dashboard. Other notes lines are kept.
export function stripStoreTags(notes) {
  return String(notes || '').split('\n').filter((l) => !/^\s*stores:/i.test(l)).join('\n').trim();
}

function shape(data) {
  return {
    source: 'reminders',
    list: data.list,
    groceries: (data.items || []).map((item) => ({
      id: String(item.id || ''),
      name: String(item.title || ''),
      notes: stripStoreTags(item.notes),
      cat: 'Other',
      done: false,
    })),
  };
}

async function ensureBinary() {
  if (binPromise) return binPromise;
  binPromise = (async () => {
    let srcTime = 0;
    try { srcTime = fs.statSync(swiftSrc).mtimeMs; } catch { return null; }
    let binTime = 0;
    try { binTime = fs.statSync(bin).mtimeMs; } catch { /* compiled on first use */ }
    if (binTime >= srcTime) return bin;
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    await execFileAsync('swiftc', ['-O', '-o', bin, swiftSrc], { timeout: 20000, killSignal: 'SIGKILL' });
    return bin;
  })().catch((err) => {
    console.error('reminders swiftc:', err.message);
    binPromise = null;
    return null;
  });
  return binPromise;
}

async function runHelper(command, arg, arg2) {
  const args = [command, prefix()];
  if (arg) args.push(arg);
  if (arg2 != null) args.push(arg2);
  const compiled = await ensureBinary();
  const attempts = compiled
    ? [{ cmd: compiled, args }]
    : [];
  attempts.push({ cmd: 'osascript', args: ['-l', 'JavaScript', jxaSrc, ...args] });
  let last = 'failed';
  for (const attempt of attempts) {
    try {
      const { stdout } = await execFileAsync(attempt.cmd, attempt.args, {
        timeout: HELPER_TIMEOUT,
        killSignal: 'SIGKILL',
        maxBuffer: 2 * 1024 * 1024,
      });
      let text = String(stdout || '').trim();
      if (text.startsWith('"') && text.endsWith('"')) {
        try { text = JSON.parse(text); } catch { /* osascript sometimes quotes the JSON */ }
      }
      const data = typeof text === 'string' ? JSON.parse(text || '{}') : text;
      if (!data.ok) {
        const reason = String(data.error || 'failed');
        const error = new Error(reason);
        error.reason = reason;
        throw error;
      }
      return data;
    } catch (err) {
      last = err.reason || helperReason(err);
      if (AUTH_ERRORS.has(last)) break;
    }
  }
  const error = new Error(last);
  error.reason = last;
  throw error;
}

async function readList() {
  if (process.platform !== 'darwin') return { data: null, reason: 'unavailable' };
  const now = Date.now();
  if (now - cache.at < cache.ttl) return { data: cache.failed ? null : cache.data, reason: cache.reason };
  try {
    const data = await runHelper('list');
    cache = { at: now, data, failed: false, reason: '', ttl: TTL };
    return { data, reason: '' };
  } catch (err) {
    const reason = err.reason || err.message || 'failed';
    console.error('reminders:', reason);
    const ttl = reason === 'notDetermined' || reason === 'timeout' ? 15000 : TTL;
    cache = { at: now, data: null, failed: true, reason, ttl };
    return { data: null, reason };
  }
}

function withReason(payload, reason) {
  if (!reason) return payload;
  return { ...payload, reason };
}

export async function loadGroceries(store) {
  const { data, reason } = await readList();
  if (!data) return withReason(store.groceries(), reason);
  return shape(data);
}

export async function saveGrocery(store, body) {
  if (process.platform !== 'darwin') return withReason(await store.grocery(body), 'unavailable');
  const action = body?.action || 'toggle';
  try {
    if (action === 'add') {
      const name = String(body.name || '').trim();
      if (name) await runHelper('add', name);
    } else if (action === 'toggle' || action === 'complete') {
      if (body.done !== false && body.id) await runHelper('complete', String(body.id));
    } else if (action !== 'clear-done' && action !== 'remove') {
      return store.grocery(body);
    }
    cache = { at: 0, data: null, failed: false, reason: '', ttl: TTL };
    const { data, reason } = await readList();
    if (data) return shape(data);
    return withReason(store.groceries(), reason);
  } catch (err) {
    const reason = err.reason || err.message || 'failed';
    console.error('reminders:', reason);
    cache = { at: Date.now(), data: null, failed: true, reason, ttl: TTL };
    return withReason(store.groceries(), reason);
  }
  return store.grocery(body);
}

// Used by the grocery tagger. Requires the compiled EventKit helper (no JXA fallback
// for writes of notes), and invalidates the read cache afterwards.
export async function listReminderItems() {
  const data = await runHelper('list');
  return data.items || [];
}

export async function setReminderNotes(id, notes) {
  const compiled = await ensureBinary();
  if (!compiled) throw new Error('helper not compiled');
  const data = await runHelper('setnotes', String(id), Buffer.from(String(notes), 'utf8').toString('base64'));
  cache = { at: 0, data: null, failed: false, reason: '', ttl: TTL };
  return data.items || [];
}
