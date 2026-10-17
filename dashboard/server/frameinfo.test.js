import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { isFrameReport, parseUserAgent, sanitizeFrameReport, webviewLabel } from '../frameinfo.js';
import { createApi } from './app.js';

// Shape of an Android 6 System WebView UA (model and build made up).
const FRAME_UA = 'Mozilla/5.0 (Linux; Android 6.0.1; Frame Build/MOB30R; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/106.0.5249.126 Safari/537.36';
const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

test('parses the frame WebView user agent', () => {
  const p = parseUserAgent(FRAME_UA);
  assert.equal(p.android, '6.0.1');
  assert.equal(p.chrome, 106);
  assert.equal(p.chromeFull, '106.0.5249.126');
  assert.equal(p.webview, true);
  assert.equal(p.ok, true);
  assert.equal(webviewLabel(FRAME_UA), 'WebView 106.0.5249.126 · Android 6.0.1');
});

test('flags the stock WebView as too old', () => {
  const p = parseUserAgent(FRAME_UA.replace('106.0.5249.126', '44.0.2403.119'));
  assert.equal(p.chrome, 44);
  assert.equal(p.ok, false);
  assert.equal(parseUserAgent('').chrome, null);
  assert.equal(webviewLabel('curl/8'), 'Unknown browser');
});

test('report keeps only known fields and only Android counts as the frame', () => {
  const r = sanitizeFrameReport({
    ua: FRAME_UA, screen: { w: 1280, h: 800, dpr: 1 }, features: { clamp: true, gap: true, evil: 'x' },
    memory: { usedMB: 31.5, totalMB: 40, limitMB: 'n/a' }, ip: '192.0.2.1', build: 'abc123',
  }, new Date('2026-10-17T15:00:00Z'));
  assert.equal(r.receivedAt, '2026-10-17T15:00:00.000Z');
  assert.deepEqual(r.features, { clamp: true, gap: true });
  assert.equal(r.memory.usedMB, 31.5);
  assert.equal(r.memory.limitMB, null);
  assert.equal(r.ip, undefined);
  assert.equal(isFrameReport(r), true);
  assert.equal(isFrameReport(sanitizeFrameReport({ ua: DESKTOP_UA })), false);
});

test('API stores the frame report and ignores desktop browsers', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coelho-fi-'));
  const handle = createApi({ root });
  const server = http.createServer((req, res) => { handle(req, res); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body) => fetch(`${base}/api/frame-info`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }).then((r) => r.json());
  try {
    assert.equal((await (await fetch(`${base}/api/frame-info`)).json()).ok, false);
    assert.equal((await post({ ua: DESKTOP_UA })).stored, false);
    assert.equal((await post({ ua: FRAME_UA, screen: { w: 1280, h: 800, dpr: 1 } })).stored, true);
    assert.equal((await post({ ua: DESKTOP_UA })).stored, false);
    const got = await (await fetch(`${base}/api/frame-info`)).json();
    assert.equal(got.chrome, 106);
    assert.equal(got.screen.w, 1280);
    assert.ok(fs.existsSync(path.join(root, 'data', 'frame-info.json')));
    process.env.FRAME_HEALTH_FILE = path.join(root, 'none.json');
    const health = await (await fetch(`${base}/api/frame-health`)).json();
    assert.deepEqual(health, { ok: false, reason: 'no-probe-yet' });
  } finally {
    delete process.env.FRAME_HEALTH_FILE;
    server.close();
  }
});
