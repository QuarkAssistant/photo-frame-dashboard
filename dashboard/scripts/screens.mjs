#!/usr/bin/env node
// Screenshot harness: renders dashboard pages at exactly 1280×800 with headless Chrome.
//   node scripts/screens.mjs <base-url> <out-dir> [now-iso]
// Uses ?ui=v2 (shell), ?now= (fixed clock), ?theme=light|dark, ?night=off, ?saver=99999
// (no screensaver) and ?sheet=uniform (opens the next soccer popup). Set CHROME to the
// browser binary if it is not on the usual path. Run it on a dev box, not on the Mac
// that serves the frame (screen-recording prompts).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [,, base, out, nowIso = new Date().toISOString()] = process.argv;
if (!base || !out) {
  console.error('usage: node scripts/screens.mjs <base-url> <out-dir> [now-iso]');
  process.exit(2);
}
const chrome = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));

const day = `now=${encodeURIComponent(nowIso)}&night=off&saver=99999`;
export const SHOTS = [
  ['v2-01-home', `ui=v2&${day}&theme=light#home`],
  ['v2-02-calendar', `ui=v2&${day}&theme=light#calendar`],
  ['v2-03-calendar-uniform', `ui=v2&${day}&theme=light&sheet=uniform#calendar`],
  ['v2-04-coming-up', `ui=v2&${day}&theme=light#coming-up`],
  ['v2-05-weather', `ui=v2&${day}&theme=light#weather`],
  ['v2-06-family', `ui=v2&${day}&theme=light#family`],
  ['v2-07-person-thiago', `ui=v2&${day}&theme=light#thiago`],
  ['v2-08-person-jp', `ui=v2&${day}&theme=light#jp`],
  ['v2-09-chores', `ui=v2&${day}&theme=light#chores`],
  ['v2-10-grocery', `ui=v2&${day}&theme=light#grocery`],
  ['v2-11-media', `ui=v2&${day}&theme=light#media`],
  ['v2-12-photos', `ui=v2&${day}&theme=light#photos`],
  ['v2-13-long-drift', `ui=v2&${day}&theme=light#long-drift`],
  ['v2-14-cameras', `ui=v2&${day}&theme=light#cameras`],
  ['v2-15-settings', `ui=v2&${day}&theme=light#settings`],
  ['v2-16-home-dark', `ui=v2&${day}&theme=dark#home`],
  ['v2-17-family-dark', `ui=v2&${day}&theme=dark#family`],
  ['v1-01-home', `${day}&theme=light#home`],
  ['v1-02-calendar-uniform', `${day}&theme=light&sheet=uniform#calendar`],
];

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!chrome) { console.error('No Chrome found; set CHROME.'); process.exit(2); }
  fs.mkdirSync(out, { recursive: true });
  for (const [name, q] of SHOTS) {
    const file = path.join(out, `${name}.png`);
    execFileSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1', '--window-size=1280,800', '--virtual-time-budget=8000',
      `--screenshot=${file}`, `${base.replace(/\/$/, '')}/?${q}`], { stdio: 'ignore', timeout: 60000 });
    console.log(file);
  }
}
