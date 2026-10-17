import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApi } from './app.js';

test('DASHBOARD_UI=v2 marks the served page; unset leaves it as built', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coelho-ui-'));
  fs.mkdirSync(path.join(root, 'dist'));
  const page = '<!doctype html>\n<html lang="en"><head></head><body></body></html>';
  fs.writeFileSync(path.join(root, 'dist', 'index.html'), page);
  fs.writeFileSync(path.join(root, 'dist', 'a.js'), 'x');
  const before = process.env.DASHBOARD_UI;
  const handle = createApi({ root });
  const server = http.createServer((req, res) => { handle(req, res); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    delete process.env.DASHBOARD_UI;
    assert.equal(await (await fetch(`${base}/`)).text(), page);
    process.env.DASHBOARD_UI = 'v2';
    const r = await fetch(`${base}/`);
    assert.equal(r.headers.get('cache-control'), 'no-cache');
    assert.match(await r.text(), /<html data-ui-default="v2" lang="en">/);
    assert.match(await (await fetch(`${base}/calendar`)).text(), /data-ui-default="v2"/);
    assert.equal(await (await fetch(`${base}/a.js`)).text(), 'x');
  } finally {
    if (before == null) delete process.env.DASHBOARD_UI; else process.env.DASHBOARD_UI = before;
    server.close();
  }
});
