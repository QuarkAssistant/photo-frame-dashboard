// Tells the Mac which engine this screen runs (WebView version check, Phase 0).
// One small POST at start and once an hour; the server keeps only Android reports.
function supports(prop, value) {
  try { return Boolean(window.CSS && CSS.supports(prop, value)); } catch { return false; }
}

export function reportFrame() {
  const pm = performance && performance.memory;
  const mb = (v) => (v ? Math.round((v / 1048576) * 10) / 10 : null);
  const body = {
    ua: navigator.userAgent,
    screen: { w: window.screen.width, h: window.screen.height, dpr: window.devicePixelRatio || 1 },
    features: {
      clamp: supports('width', 'clamp(1px, 1vw, 2px)'),
      gap: supports('gap', '1px'),
      grid: supports('display', 'grid'),
      vars: supports('--x', '1'),
      aspectRatio: supports('aspect-ratio', '1'),
    },
    memory: pm ? { usedMB: mb(pm.usedJSHeapSize), totalMB: mb(pm.totalJSHeapSize), limitMB: mb(pm.jsHeapSizeLimit) } : null,
  };
  try {
    fetch('/api/frame-info', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .catch(() => {});
  } catch { /* offline: next hour */ }
}
