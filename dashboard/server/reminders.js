import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const TTL = 60 * 1000;
const here = path.dirname(fileURLToPath(import.meta.url));
const swiftSrc = path.join(here, 'reminders.swift');
const jxaSrc = path.join(here, 'reminders.jxa.js');
const bin = path.join(here, 'bin', 'reminders-grocery');

let binPromise = null;
let cache = { at: 0, data: null, failed: false };

function prefix() {
  return process.env.REMINDERS_GROCERY_LIST || 'Supermercado';
}

function shape(data) {
  return {
    source: 'reminders',
    list: data.list,
    groceries: (data.items || []).map((item) => ({
      id: String(item.id || ''),
      name: String(item.title || ''),
      notes: String(item.notes || ''),
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
    await execFileAsync('swiftc', ['-O', '-o', bin, swiftSrc], { timeout: 120000 });
    return bin;
  })().catch((err) => {
    console.error('reminders swiftc:', err.message);
    binPromise = null;
    return null;
  });
  return binPromise;
}

async function runHelper(command, arg) {
  const args = [command, prefix()];
  if (arg) args.push(arg);
  const compiled = await ensureBinary();
  const attempts = compiled
    ? [{ cmd: compiled, args }]
    : [];
  attempts.push({ cmd: 'osascript', args: ['-l', 'JavaScript', jxaSrc, ...args] });
  let last = 'Reminders helper failed';
  for (const attempt of attempts) {
    try {
      const { stdout } = await execFileAsync(attempt.cmd, attempt.args, {
        timeout: 20000,
        maxBuffer: 2 * 1024 * 1024,
      });
      const data = JSON.parse(String(stdout || '').trim() || '{}');
      if (!data.ok) throw new Error(data.error || 'reminders failed');
      return data;
    } catch (err) {
      last = err.message || String(err);
    }
  }
  throw new Error(last);
}

async function readList() {
  if (process.platform !== 'darwin') return null;
  const now = Date.now();
  if (now - cache.at < TTL) return cache.failed ? null : cache.data;
  try {
    const data = await runHelper('list');
    cache = { at: now, data, failed: false };
    return data;
  } catch (err) {
    console.error('reminders:', err.message);
    cache = { at: now, data: null, failed: true };
    return null;
  }
}

export async function loadGroceries(store) {
  const data = await readList();
  if (!data) return store.groceries();
  return shape(data);
}

export async function saveGrocery(store, body) {
  if (process.platform !== 'darwin') return store.grocery(body);
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
    cache = { at: 0, data: null, failed: false };
    const data = await readList();
    if (data) return shape(data);
  } catch (err) {
    console.error('reminders:', err.message);
    cache = { at: Date.now(), data: null, failed: true };
  }
  return store.grocery(body);
}
