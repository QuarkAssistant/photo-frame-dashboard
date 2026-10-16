// Runs the Find My helper's pure parsing/selection checks (no Find My access needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let swiftc = null;
try { swiftc = execFileSync('which', ['swiftc']).toString().trim(); } catch {}

test('findmy preferred-device parsing and age rule', { skip: !swiftc && 'swiftc not available' }, () => {
  const bin = join(mkdtempSync(join(tmpdir(), 'findmy-')), 'findmy-selftest');
  execFileSync(swiftc, ['-O', '-o', bin, join(here, 'findmy.swift')], { stdio: 'pipe' });
  const out = execFileSync(bin, ['--selftest']).toString();
  assert.match(out, /selftest ok/);
});
