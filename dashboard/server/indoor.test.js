import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { viewSignature } from '../js/data.js';
import { indoorHtml } from '../js/weatherui.js';
import {
  indoorReading, parseSensecraft, pollIndoor, resetIndoor, startIndoor, stopIndoor,
} from './indoor.js';
import { weatherPayload } from './weather.js';

const DEVICE = 'device-test';
const KEY = 'key-test-do-not-log';
const T0 = Date.parse('2026-10-16T18:00:00.000Z');
const SAMPLE = {
  result: {
    sensor: { temp: 23.2, humidity: 47 },
    devicestatus: { status: 'online' },
  },
};

function text(html) {
  return html.replace(/<[^>]+>/g, '');
}

function jsonResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

describe('indoor sensor', { concurrency: 1 }, () => {
test.beforeEach(() => {
  resetIndoor();
  delete process.env.SENSECRAFT_DEVICE_ID;
  delete process.env.SENSECRAFT_API_KEY;
});

test.afterEach(() => {
  resetIndoor();
  delete process.env.SENSECRAFT_DEVICE_ID;
  delete process.env.SENSECRAFT_API_KEY;
});

test('parses sensor temp, humidity, and device status', () => {
  assert.deepEqual(parseSensecraft(SAMPLE), { tempC: 23.2, humidity: 47, status: 'online' });
  assert.equal(parseSensecraft({ result: { sensor: { temp: '0', humidity: '12.6' }, devicestatus: { status: 1 } } }).status, 1);
  assert.equal(parseSensecraft({ result: { sensor: { humidity: 40 } } }), null);
  assert.equal(parseSensecraft({}), null);
  assert.equal(parseSensecraft(null), null);
});

test('example placeholders count as unset and do not fetch', async () => {
  process.env.SENSECRAFT_DEVICE_ID = 'your-device-id';
  process.env.SENSECRAFT_API_KEY = 'your-api-key';
  let called = false;
  const reading = await pollIndoor({
    now: T0,
    fetchImpl() { called = true; return jsonResponse(SAMPLE); },
  });
  assert.equal(called, false);
  assert.equal(reading, null);
});

test('missing env does not fetch and the reading is null', async () => {
  let called = false;
  process.env.SENSECRAFT_API_KEY = KEY;
  const reading = await pollIndoor({
    now: T0,
    fetchImpl() { called = true; return jsonResponse(SAMPLE); },
  });
  assert.equal(called, false);
  assert.equal(reading, null);
  assert.equal(indoorReading(T0), null);
});

test('polls SenseCraft with the API-Key header and keeps fetchedAt', async () => {
  process.env.SENSECRAFT_DEVICE_ID = DEVICE;
  process.env.SENSECRAFT_API_KEY = KEY;
  const calls = [];
  const reading = await pollIndoor({
    now: T0,
    fetchImpl(url, opts) {
      calls.push({ url, opts });
      return jsonResponse(SAMPLE);
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://sensecraft-hmi-api.seeed.cc/api/v1/user/device/iot_data/${DEVICE}`);
  assert.equal(calls[0].opts.headers['API-Key'], KEY);
  assert.equal(calls[0].url.includes(KEY), false);
  assert.deepEqual(reading, {
    tempC: 23.2,
    humidity: 47,
    status: 'online',
    fetchedAt: '2026-10-16T18:00:00.000Z',
  });
  assert.equal(JSON.stringify(reading).includes(KEY), false);
  assert.equal(JSON.stringify(reading).includes(DEVICE), false);
});

test('a failed request stays null and never logs the key or device id', async () => {
  process.env.SENSECRAFT_DEVICE_ID = DEVICE;
  process.env.SENSECRAFT_API_KEY = KEY;
  const logged = [];
  const orig = console.error;
  console.error = (...args) => { logged.push(args.join(' ')); };
  try {
    const http = await pollIndoor({
      now: T0,
      fetchImpl() { return jsonResponse({ error: KEY, id: DEVICE }, false, 401); },
    });
    const blown = await pollIndoor({
      now: T0,
      fetchImpl() { throw new Error(`network ${KEY} ${DEVICE}`); },
    });
    assert.equal(http, null);
    assert.equal(blown, null);
    assert.ok(logged.length >= 2);
    for (const line of logged) {
      assert.equal(line.includes(KEY), false);
      assert.equal(line.includes(DEVICE), false);
    }
  } finally {
    console.error = orig;
  }
});

test('keeps the last good reading for 45 minutes, then returns null', async () => {
  process.env.SENSECRAFT_DEVICE_ID = DEVICE;
  process.env.SENSECRAFT_API_KEY = KEY;
  const orig = console.error;
  console.error = () => {};
  try {
    await pollIndoor({ now: T0, fetchImpl: () => jsonResponse(SAMPLE) });
    const kept = await pollIndoor({
      now: T0 + 10 * 60 * 1000,
      fetchImpl: () => jsonResponse({}, false, 500),
    });
    assert.equal(kept.tempC, 23.2);
    assert.equal(kept.fetchedAt, '2026-10-16T18:00:00.000Z');
    await pollIndoor({
      now: T0 + 20 * 60 * 1000,
      fetchImpl: () => jsonResponse({ result: { sensor: { temp: 'nope', humidity: 1 } } }),
    });
    assert.equal(indoorReading(T0 + 44 * 60 * 1000).humidity, 47);
    assert.equal(indoorReading(T0 + 45 * 60 * 1000), null);
  } finally {
    console.error = orig;
  }
});

test('weather payload carries indoor, or null when it is stale or unconfigured', async () => {
  const orig = globalThis.fetch;
  const logged = [];
  const origErr = console.error;
  console.error = (...args) => { logged.push(args.join(' ')); };
  globalThis.fetch = async () => { throw new Error('offline'); };
  try {
    process.env.SENSECRAFT_DEVICE_ID = DEVICE;
    process.env.SENSECRAFT_API_KEY = KEY;
    await pollIndoor({ now: T0, fetchImpl: () => jsonResponse(SAMPLE) });
    const live = await weatherPayload(new Date(T0 + 60 * 1000));
    assert.equal(live.indoor.tempC, 23.2);
    assert.equal(live.indoor.humidity, 47);
    assert.equal(live.indoor.status, 'online');
    assert.equal(live.indoor.fetchedAt, '2026-10-16T18:00:00.000Z');
    assert.equal(JSON.stringify(live).includes(KEY), false);
    assert.equal(JSON.stringify(live).includes(DEVICE), false);

    const stale = await weatherPayload(new Date(T0 + 45 * 60 * 1000));
    assert.equal(stale.indoor, null);

    delete process.env.SENSECRAFT_DEVICE_ID;
    delete process.env.SENSECRAFT_API_KEY;
    const hidden = await weatherPayload(new Date(T0 + 60 * 1000));
    assert.equal(hidden.indoor, null);
    for (const line of logged) {
      assert.equal(line.includes(KEY), false);
      assert.equal(line.includes(DEVICE), false);
    }
  } finally {
    globalThis.fetch = orig;
    console.error = origErr;
  }
});

test('the Home line is Inside °F / °C · humidity, and empty when missing', () => {
  assert.equal(text(indoorHtml({ tempC: 23.2, humidity: 47 })), 'Inside 74 °F / 23 °C · 47%');
  assert.match(indoorHtml({ tempC: 23.2, humidity: 47.4 }), /hw-pair num/);
  assert.equal(indoorHtml(null), '');
  assert.equal(indoorHtml({ tempC: null, humidity: 47 }), '');
  assert.equal(indoorHtml({ humidity: 10 }), '');
});

test('a new fetchedAt does not change the view signature; a new temperature does', () => {
  const base = { temp: 59, indoor: { tempC: 23.2, humidity: 47, status: 'online', fetchedAt: '2026-10-16T18:00:00.000Z' } };
  const same = { temp: 59, indoor: { tempC: 23.2, humidity: 47, status: 'online', fetchedAt: '2026-10-16T18:10:00.000Z' } };
  const warmer = { temp: 59, indoor: { tempC: 24, humidity: 47, status: 'online', fetchedAt: '2026-10-16T18:10:00.000Z' } };
  assert.equal(viewSignature([base]), viewSignature([same]));
  assert.notEqual(viewSignature([base]), viewSignature([warmer]));
  assert.equal(viewSignature([base]).includes('fetchedAt'), false);
});

test('the poller starts once and does not call fetch without env', async () => {
  const orig = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return jsonResponse(SAMPLE);
  };
  try {
    await startIndoor();
    assert.equal(calls, 0);
    process.env.SENSECRAFT_DEVICE_ID = DEVICE;
    process.env.SENSECRAFT_API_KEY = KEY;
    await startIndoor();
    await startIndoor();
    assert.equal(calls, 1);
    assert.equal(indoorReading(Date.now()).tempC, 23.2);
  } finally {
    stopIndoor();
    globalThis.fetch = orig;
  }
});
});
