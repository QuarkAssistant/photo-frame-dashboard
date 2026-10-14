// Settings: control the frame itself.
// - Works today in any browser/kiosk: software brightness (dim overlay),
//   screen-saver timeout, reload, connection status.
// - Needs the kiosk app's FrameBridge (kiosk/src/.../MainActivity.java, v0.6+):
//   real backlight brightness, Wi-Fi network name/signal, Android Wi-Fi
//   settings, volume, reboot. Buttons show "Needs kiosk update" until then.
import { register } from '../app.js';
import { state } from '../data.js';
import { esc, formatTime } from '../ui.js';
import { icon } from '../icons.js';

const KEY_BRIGHT = 'coelho.brightness';
const KEY_SAVER = 'coelho.saverSeconds';
const bridge = () => (typeof window !== 'undefined' && window.FrameBridge) || null;

function call(name, ...args) {
  const b = bridge();
  if (!b || typeof b[name] !== 'function') return undefined;
  try { return b[name](...args); } catch { return undefined; }
}

export function brightness() {
  const v = Number(localStorage.getItem(KEY_BRIGHT));
  return v >= 10 && v <= 100 ? v : 100;
}

export function saverSeconds() {
  const v = localStorage.getItem(KEY_SAVER);
  return v == null ? null : Number(v);
}

// Applied at boot and on change. Hardware backlight when the bridge exists,
// otherwise a black overlay (pointer-events: none) dims the page.
export function applyBrightness(v = brightness()) {
  const hw = call('setBrightness', v / 100) !== undefined;
  let dim = document.getElementById('dimmer');
  if (!dim) {
    dim = document.createElement('div');
    dim.id = 'dimmer';
    document.body.appendChild(dim);
  }
  dim.style.opacity = hw ? '0' : String(((100 - v) / 100) * 0.8);
}

function wifiInfo() {
  const raw = call('getWifi');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

let ping = null;
function measure(el) {
  const t0 = Date.now();
  fetch(`/api/config?ping=${t0}`, { cache: 'no-store' })
    .then((r) => { ping = { ok: r.ok, ms: Date.now() - t0, at: new Date() }; })
    .catch(() => { ping = { ok: false, ms: 0, at: new Date() }; })
    .then(() => paint(el));
}

function row(label, value, sub = '') {
  return `<div class="st-row"><span class="st-l">${label}</span><span class="st-v">${value}${sub ? `<small>${sub}</small>` : ''}</span></div>`;
}

function needs(text = 'Needs kiosk update') { return `<span class="st-need">${text}</span>`; }

function paint(el) {
  const b = bridge();
  const v = brightness();
  const steps = [20, 40, 60, 80, 100].map((s) =>
    `<button type="button" class="st-chip${s === v ? ' is-on' : ''}" data-set-bright="${s}">${s}%</button>`).join('');
  const sv = saverSeconds();
  const cur = sv == null ? 300 : sv;
  const saver = [[120, '2 min'], [300, '5 min'], [600, '10 min'], [1800, '30 min'], [0, 'Off']].map(([s, l]) =>
    `<button type="button" class="st-chip${s === cur ? ' is-on' : ''}" data-set-saver="${s}">${l}</button>`).join('');
  const w = wifiInfo();
  const net = w && w.ssid ? `${esc(w.ssid)}` : (navigator.onLine ? 'Connected' : 'Offline');
  const sig = w && w.rssi != null ? `Signal ${esc(String(w.level))}/4 · ${esc(String(w.rssi))} dBm` : '';
  const srv = ping ? (ping.ok ? `Reachable · ${ping.ms} ms` : 'Not reachable') : 'Checking…';
  const ua = navigator.userAgent.match(/Android [\d.]+/);
  const vol = Number(call('getVolume'));
  const volBtns = Number.isFinite(vol) && b
    ? [0, 25, 50, 75, 100].map((s) => `<button type="button" class="st-chip${Math.abs(s - vol) < 13 ? ' is-on' : ''}" data-set-vol="${s}">${s ? `${s}%` : 'Mute'}</button>`).join('')
    : needs();
  el.querySelector('.st-body').innerHTML =
    `<section class="st-card"><h2>${icon('sun', 20)} Brightness</h2><div class="st-chips">${steps}</div>` +
    `<p class="st-note">${b ? 'Sets the screen backlight.' : 'Software dimming for now (darkens the page). Real backlight control needs the kiosk update.'}</p></section>` +
    `<section class="st-card"><h2>${icon('photo', 20)} Photo screensaver after</h2><div class="st-chips">${saver}</div>` +
    `<p class="st-note">Idle time before the photo screensaver starts. Night mode still runs 11:00 PM – 6:00 AM.</p></section>` +
    `<section class="st-card"><h2>Wi-Fi</h2>${row('Network', net, sig)}${row('Dashboard server', srv)}` +
    `<div class="st-actions"><button type="button" class="st-btn" data-frame="wifi"${b ? '' : ' disabled'}>Open Wi-Fi settings</button>${b ? '' : needs()}</div></section>` +
    `<section class="st-card"><h2>Volume</h2><div class="st-chips">${volBtns}</div></section>` +
    `<section class="st-card"><h2>Frame</h2>` +
    row('Screen', `${window.screen.width} × ${window.screen.height}`) +
    row('System', esc(ua ? ua[0] : 'Browser'), b ? 'Kiosk bridge connected' : 'Kiosk bridge not installed') +
    row('Photos in rotation', esc(String((state.photos || []).length))) +
    row('Last checked', ping ? esc(formatTime(ping.at)) : '—') +
    `<div class="st-actions"><button type="button" class="st-btn" data-frame="reload">Reload dashboard</button>` +
    `<button type="button" class="st-btn st-btn--warn" data-frame="reboot"${b ? '' : ' disabled'}>Restart frame</button>${b ? '' : needs()}</div></section>`;
}

let confirmReboot = 0;
register('settings', {
  show(el) {
    if (!el.dataset.built) {
      el.dataset.built = '1';
      el.innerHTML = `<div class="st"><header class="st-head"><h1 class="serif">Settings</h1><span class="st-sub">This frame</span></header><div class="st-body"></div></div>`;
      el.addEventListener('click', (e) => {
        const br = e.target.closest('[data-set-bright]');
        if (br) { localStorage.setItem(KEY_BRIGHT, br.dataset.setBright); applyBrightness(); paint(el); return; }
        const sv = e.target.closest('[data-set-saver]');
        if (sv) { localStorage.setItem(KEY_SAVER, sv.dataset.setSaver); paint(el); return; }
        const vo = e.target.closest('[data-set-vol]');
        if (vo) { call('setVolume', Number(vo.dataset.setVol)); paint(el); return; }
        const fr = e.target.closest('[data-frame]');
        if (!fr || fr.disabled) return;
        if (fr.dataset.frame === 'reload') location.reload();
        if (fr.dataset.frame === 'wifi') call('openWifiSettings');
        if (fr.dataset.frame === 'reboot') {
          if (Date.now() - confirmReboot < 5000) call('reboot');
          else { confirmReboot = Date.now(); fr.textContent = 'Tap again to restart'; }
        }
      });
    }
    paint(el);
    measure(el);
  },
});
