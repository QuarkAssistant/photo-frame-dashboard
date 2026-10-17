#!/usr/bin/env node
// Frame health probe: read-only ADB from the Mac → frame-health.json.
//   FRAME_ADB=<host:port or serial> node scripts/frame-health.mjs [--baseline] [--seconds 10]
// Reads: kiosk PSS (dumpsys meminfo), kiosk CPU over N seconds (/proc/<pid>/stat),
// CPU heat (thermal_zone0), WebView versionName, uptime. Writes nothing to the frame.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../server/env.js';
import {
  addSample, coresBusy, healthFile, KIOSK_PACKAGE, parseMeminfo, parseProcStat, parseThermal,
  parseUptime, parseVersionName, readHealth,
} from '../server/framehealth.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(path.join(root, '.env'));

const args = process.argv.slice(2);
const baseline = args.includes('--baseline');
const si = args.indexOf('--seconds');
const seconds = si >= 0 ? Math.max(2, Number(args[si + 1]) || 10) : 10;
const adb = process.env.ADB_BIN || 'adb';
const target = process.env.FRAME_ADB || '';
if (!target) {
  console.error('FRAME_ADB is not set (host:port of the frame\'s wireless ADB, or a USB serial).');
  process.exit(2);
}

function run(...cmd) {
  return execFileSync(adb, ['-s', target, ...cmd], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] });
}
function shell(cmd) {
  try { return run('shell', cmd); } catch { return ''; }
}

if (/:\d+$/.test(target)) {
  try { execFileSync(adb, ['connect', target], { encoding: 'utf8', timeout: 10000 }); } catch { /* reported below */ }
}

const psOut = shell('ps');
const line = psOut.split('\n').find((l) => l.trim().endsWith(KIOSK_PACKAGE));
const pid = line ? line.trim().split(/\s+/)[1] : null;
if (!pid) {
  console.error('Kiosk process not found (is ADB connected and the dashboard running?).');
  process.exit(1);
}

const t0 = parseProcStat(shell(`cat /proc/${pid}/stat`));
const started = Date.now();
await new Promise((r) => setTimeout(r, seconds * 1000));
const t1 = parseProcStat(shell(`cat /proc/${pid}/stat`));
const elapsed = (Date.now() - started) / 1000;

const sample = {
  at: new Date().toISOString(),
  pssMB: parseMeminfo(shell(`dumpsys meminfo ${KIOSK_PACKAGE}`)),
  cpuCores: coresBusy(t0, t1, elapsed),
  cpuSeconds: Math.round(elapsed),
  cpuTempC: parseThermal(shell('cat /sys/class/thermal/thermal_zone0/temp')),
  webview: parseVersionName(shell('dumpsys package com.android.webview')) || parseVersionName(shell('dumpsys package com.google.android.webview')),
  uptimeS: parseUptime(shell('cat /proc/uptime')),
  ...(baseline ? { baseline: true } : {}),
};

const file = healthFile();
const doc = addSample(readHealth(file), sample);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(`${file}.tmp`, JSON.stringify(doc, null, 2));
fs.renameSync(`${file}.tmp`, file);
console.log(JSON.stringify(sample));
