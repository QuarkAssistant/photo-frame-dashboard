// Indoor temperature and humidity from a SenseCraft HMI device.
// Polled every 10 minutes. The key and device id come from the environment
// and are never logged or included in the payload.
const POLL_MS = 10 * 60 * 1000;
const STALE_MS = 45 * 60 * 1000;
const ENDPOINT = 'https://sensecraft-hmi-api.seeed.cc/api/v1/user/device/iot_data/';

let lastGood = null;
let timer = null;
let busy = false;

function envValue(name) {
  const value = process.env[name];
  if (value == null) return '';
  return String(value).trim();
}

// .env.example ships these placeholders. Copying that file must not poll Seeed.
function credential(name, placeholder) {
  const value = envValue(name);
  if (!value || value === placeholder) return '';
  return value;
}

export function indoorConfigured() {
  return Boolean(credential('SENSECRAFT_DEVICE_ID', 'your-device-id') && credential('SENSECRAFT_API_KEY', 'your-api-key'));
}

export function parseSensecraft(body) {
  const result = body && body.result;
  const sensor = result && result.sensor;
  if (!sensor) return null;
  const tempC = Number(sensor.temp);
  const humidity = Number(sensor.humidity);
  if (!Number.isFinite(tempC) || !Number.isFinite(humidity)) return null;
  const raw = result.devicestatus && result.devicestatus.status;
  const status = (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') ? raw : null;
  return { tempC, humidity, status };
}

function toPublic(row) {
  return {
    tempC: row.tempC,
    humidity: row.humidity,
    status: row.status,
    fetchedAt: new Date(row.fetchedAt).toISOString(),
  };
}

// null when env is missing, or the last successful read is 45 minutes old or older.
export function indoorReading(now = Date.now()) {
  if (!indoorConfigured() || !lastGood) return null;
  const at = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(at) || at - lastGood.fetchedAt >= STALE_MS) return null;
  return toPublic(lastGood);
}

function logFailure(status) {
  // Static text only. Never include the URL (it contains the device id),
  // the response body, or the API key.
  if (status) console.error(`indoor: sensecraft request failed (${status})`);
  else console.error('indoor: sensecraft request failed');
}

export async function pollIndoor({ fetchImpl = fetch, now = Date.now() } = {}) {
  if (!indoorConfigured()) return null;
  if (busy) return indoorReading(now);
  const id = credential('SENSECRAFT_DEVICE_ID', 'your-device-id');
  const key = credential('SENSECRAFT_API_KEY', 'your-api-key');
  const at = now instanceof Date ? now.getTime() : Number(now);
  const ctrl = new AbortController();
  const kill = setTimeout(() => ctrl.abort(), 12000);
  if (typeof kill.unref === 'function') kill.unref();
  busy = true;
  try {
    const res = await fetchImpl(`${ENDPOINT}${encodeURIComponent(id)}`, {
      headers: { 'API-Key': key },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      logFailure(res.status);
      return indoorReading(at);
    }
    const parsed = parseSensecraft(await res.json());
    if (!parsed) {
      logFailure();
      return indoorReading(at);
    }
    lastGood = { ...parsed, fetchedAt: at };
    return indoorReading(at);
  } catch {
    logFailure();
    return indoorReading(at);
  } finally {
    clearTimeout(kill);
    busy = false;
  }
}

export function startIndoor() {
  if (timer || !indoorConfigured()) return Promise.resolve(null);
  const first = pollIndoor();
  timer = setInterval(() => { pollIndoor(); }, POLL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  return first;
}

export function stopIndoor() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function resetIndoor() {
  stopIndoor();
  lastGood = null;
  busy = false;
}
