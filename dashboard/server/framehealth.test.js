import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  addSample, coresBusy, healthPayload, parseMeminfo, parseProcStat, parseThermal, parseUptime, parseVersionName,
} from './framehealth.js';

// Trimmed Android 6 `dumpsys meminfo <pkg>` (numbers made up).
const MEMINFO_M = `Applications Memory Usage (kB):
Uptime: 1000 Realtime: 1000

** MEMINFO in pid 1234 [com.wesbos.homehq] **
                   Pss  Private  Private  Swapped     Heap     Heap     Heap
                 Total    Dirty    Clean    Dirty     Size    Alloc     Free
                ------   ------   ------   ------   ------   ------   ------
  Native Heap    20000    19900        0        0    30000    25000     5000
        TOTAL    93184    80000     9000        0    50000    40000    10000
`;

test('reads TOTAL PSS from Android 6 and newer meminfo layouts', () => {
  assert.equal(parseMeminfo(MEMINFO_M), 91);
  assert.equal(parseMeminfo('App Summary\n TOTAL PSS:   104,448   TOTAL RSS: 1'), 102);
  assert.equal(parseMeminfo('No process found for: x'), null);
});

test('CPU: ticks from /proc/<pid>/stat (comm with spaces) to cores busy', () => {
  const stat = '1234 (com.wesbos homehq) S 1 1 0 0 -1 4194624 100 0 0 0 1500 300 0 0 20 0 30 0 500 1000 2000';
  assert.equal(parseProcStat(stat), 1800);
  assert.equal(parseProcStat('garbage'), null);
  assert.equal(coresBusy(1800, 1810, 10), 0.01);
  assert.equal(coresBusy(1000, 2800, 10), 1.8);
  assert.equal(coresBusy(null, 5, 10), null);
});

test('thermal, versionName and uptime', () => {
  assert.equal(parseThermal('48500\n'), 48.5);
  assert.equal(parseThermal('47'), 47);
  assert.equal(parseThermal(''), null);
  assert.equal(parseVersionName('    versionCode=524912603 minSdk=23\n    versionName=106.0.5249.126\n'), '106.0.5249.126');
  assert.equal(parseVersionName('Unable to find package'), null);
  assert.equal(parseUptime('86400.52 300000.10'), 86400);
});

test('history keeps 24 h, the baseline and the peak', () => {
  let doc = addSample(null, { at: '2026-10-16T10:00:00Z', pssMB: 95, cpuCores: 0.05 });
  assert.equal(doc.baseline.pssMB, 95);
  doc = addSample(doc, { at: '2026-10-17T09:00:00Z', pssMB: 101 });
  doc = addSample(doc, { at: '2026-10-17T10:30:00Z', pssMB: 99 });
  assert.equal(doc.history.length, 2);
  assert.equal(doc.peakPssMB24h, 101);
  assert.equal(doc.baseline.pssMB, 95);
  doc = addSample(doc, { at: '2026-10-17T11:00:00Z', pssMB: 97, baseline: true });
  assert.equal(doc.baseline.pssMB, 97);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coelho-fh-'));
  const file = path.join(dir, 'h.json');
  assert.equal(healthPayload(file).ok, false);
  fs.writeFileSync(file, JSON.stringify(doc));
  const p = healthPayload(file);
  assert.equal(p.ok, true);
  assert.equal(p.latest.pssMB, 97);
  assert.equal(p.history, undefined);
});
