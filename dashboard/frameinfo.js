// WebView version check (shared by the dashboard and the server). Pure.
// The frame reports navigator.userAgent once at start; the server keeps the latest
// Android report so Settings and the docs can confirm the engine without ADB.

export const MIN_CHROME = 106;

export function parseUserAgent(ua) {
  const s = String(ua || '');
  const chrome = /Chrome\/(\d+)(?:\.(\d+)\.(\d+)\.(\d+))?/.exec(s);
  const android = /Android (\d+(?:\.\d+)*)/.exec(s);
  const major = chrome ? Number(chrome[1]) : null;
  return {
    android: android ? android[1] : null,
    chrome: major,
    chromeFull: chrome && chrome[2] != null ? `${chrome[1]}.${chrome[2]}.${chrome[3]}.${chrome[4]}` : (major != null ? String(major) : null),
    // "; wv)" marks an Android System WebView rather than the Chrome app.
    webview: /;\s*wv\)/.test(s),
    ok: major != null && major >= MIN_CHROME,
  };
}

export function webviewLabel(ua) {
  const p = parseUserAgent(ua);
  if (p.chrome == null) return 'Unknown browser';
  const kind = p.webview ? 'WebView' : 'Chrome';
  const os = p.android ? ` · Android ${p.android}` : '';
  return `${kind} ${p.chromeFull}${os}`;
}

// Only what the dashboard needs. Never stores IPs or anything that identifies a person.
const FEATURES = ['clamp', 'gap', 'grid', 'vars', 'aspectRatio'];
export function sanitizeFrameReport(body, receivedAt = new Date()) {
  const b = body && typeof body === 'object' ? body : {};
  const ua = String(b.ua || '').slice(0, 400);
  const parsed = parseUserAgent(ua);
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const features = {};
  for (const k of FEATURES) if (b.features && typeof b.features[k] === 'boolean') features[k] = b.features[k];
  const mem = b.memory && typeof b.memory === 'object'
    ? { usedMB: num(b.memory.usedMB), totalMB: num(b.memory.totalMB), limitMB: num(b.memory.limitMB) }
    : null;
  return {
    receivedAt: receivedAt.toISOString(),
    ua,
    ...parsed,
    screen: { w: num(b.screen && b.screen.w), h: num(b.screen && b.screen.h), dpr: num(b.screen && b.screen.dpr) },
    features,
    memory: mem,
    build: String(b.build || '').slice(0, 40),
  };
}

// The frame is the only Android client. Desktop browsers and the screenshot
// harness must not overwrite its report.
export function isFrameReport(report) {
  return Boolean(report && report.android);
}
