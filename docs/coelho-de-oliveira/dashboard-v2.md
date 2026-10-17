# Coelho de Oliveira dashboard v2: Phase 0 (foundations), 2026-10-17

v2 is the redesign of the frame dashboard (PF1007L, 1280×800, Android 6.0.1, WebView 106,
Allwinner A33). It ships in phases; each phase goes branch → preview flag → screenshots →
merge → frame reload. This page covers **Phase 0: foundations**. No page was redesigned yet.

## Decisions this phase builds on (2026-10-17)
- **Navigation:** a 9-item rail: Home, Calendar, Weather, Family, Chores, Grocery, Media,
  Cameras, Settings. Photos moves inside Media, Trips/countdowns go under Calendar (Coming up).
- **Cameras (later phase):** live video only while the Cameras page is open, one camera at a
  time; a doorbell ring opens a pop-up with the doorbell's live feed on any page; no motion
  pop-ups. Phase 0 only adds the placeholder page that states this.
- **Thiago's page:** visible to everyone, dates and counts only, never amounts.
- **The Long Drift:** placeholder only (aired episodes only, art as published). Animation on hold.
- **Agent feeds:** via a synced Dropbox folder (later phase). Homework format pending.

## How to preview
v2 is **opt-in**: add `?ui=v2` to the URL. Without it (the frame's normal URL) the dashboard is
exactly v1. Examples:

```
http://DASHBOARD_HOST:<port>/?ui=v2#home
http://DASHBOARD_HOST:<port>/?ui=v2&theme=dark#family
```

## What Phase 0 adds

### 1. Design tokens (`css/v2/tokens.css`)
- Scoped to `html.ui-v2`, so v1 pages keep their current look until each page is rebuilt.
- **Garden Morning** (day): cream `#FBF6EC`, white cards, ink `#1F2A2E`, teal `#1F6F6B`,
  forest `#16332F`, olive `#7A8A3C`, sunflower `#F2B544` (fill only, never text).
- **Olive Grove** (night / dark theme, `html.ui-v2.theme-dark`): forest `#16332F`, cards
  `#1F4540`, cream text `#F6EFDF`, amber `#E8B04A`.
- Person colours (identity, not text; the name is always next to it): Thiago `#AB2320`,
  Gilmara `#F78872`, JP `#3D78BC`, Lucas `#8EAD74`, Family teal.
- **Type scale** with `clamp(75 %, px/12.8 vw, 125 %)`, so it equals the px value on the
  1280 px frame: clock 156, hero 112, title 54, heading 44, body 28, secondary 22, label 18.
- Layout: 4 px grid, 16–20 px gutters, 26 px card radius, 96 px rail, 84 px rail items,
  64 px+ tap targets, 60 px Back button.
- **Font:** Nunito 700–900, self-hosted and subset to Latin + Latin-1 + Latin Extended-A
  (`public/fonts/Nunito-v2.woff2`, 26 KB, with a `.woff` fallback). OFL licence included.
- No 4- or 8-digit hex colours (the frame's WebView rejects them); `rgba()` instead.

### 2. Navigation shell and routing (`nav.js`, `js/app.js`, `css/v2/shell.css`)
- `nav.js` is the single source for the 9 rail items and the routes. Sub-pages light their
  parent's rail item and get a Back button (top left, 60 px):

| Hash | Page | Rail item | Back to |
|---|---|---|---|
| `#home` | Home (v1 layout for now) | Home | – |
| `#calendar` | Calendar (v1) + "Coming up" button | Calendar | – |
| `#coming-up` (`#trips`) | Coming up placeholder | Calendar | Calendar |
| `#weather` | Weather (v1) | Weather | – |
| `#family` | Family: four person cards | Family | – |
| `#thiago`, `#gilmara`, `#jp`, `#lucas` | Person page (v1) | Family | Family |
| `#chores`, `#grocery` | v1 pages | Chores / Grocery | – |
| `#media` | Media: Photos and The Long Drift tiles | Media | – |
| `#photos` | Photos (v1) | Media | Media |
| `#long-drift` | The Long Drift placeholder | Media | Media |
| `#cameras` | Cameras placeholder | Cameras | – |
| `#settings` | Settings (v1) | Settings | – |

- Every v1 hash and every Home tile still works (weather card → Weather, photo → Photos,
  faces → person pages, chores, grocery, event sheets with the uniform line).
- **Settings opens with a 2-second hold** on its rail item. A short tap shows "Hold for 2
  seconds to open Settings".
- **Idle 3 minutes** on any page except Home and Settings → back to Home (any open event
  sheet closes). The 5-minute photo screensaver and the 11 PM–6 AM night clock are unchanged.
- Family highlights the last person viewed.
- The rail is 22 + 9 × 84 = 778 px on the 800 px frame; items shrink evenly if a viewport is
  ever shorter, so Settings is never cut off.

### 3. Placeholder pages (`js/views/v2pages.js`)
Family, Media, The Long Drift, Cameras and Coming up. They show real data or plain text only
(no sample content) and link to the existing pages. They are replaced in later phases.

### 4. No looping animation
- The pulsing dot on "Leave now" / "Running late" is gone (one looping element kept the A33 near
  1.8 of 4 cores in wesbos/photo-frame-dashboard#143). The pill now **flashes once** (two quick
  blinks, about 1 s) when it switches on and then stays still; `flashOnce()` in `nav.js` makes
  sure the minute repaint never replays it.
- There are no other infinite animations in the dashboard (checked with
  `document.getAnimations()`).

### 5. WebView version check (`frameinfo.js`, `js/frameinfo.js`)
- At start and once an hour the dashboard POSTs `navigator.userAgent`, screen size, a few
  `CSS.supports()` results (clamp, gap, grid, custom properties, aspect-ratio) and
  `performance.memory` to `/api/frame-info`.
- The server keeps **only Android reports** (desktop browsers and the screenshot harness are
  ignored) in `data/frame-info.json` (git-ignored). No IPs are stored.
- Settings → Frame shows a new **Web engine** row, e.g. "WebView 106.0.5249.126 · Android 6.0.1 —
  Supported (106 or newer)".

### 6. Frame health probe over ADB (`scripts/frame-health.mjs`, `server/framehealth.js`)
- Read-only ADB from the Mac: kiosk PSS (`dumpsys meminfo com.wesbos.homehq`), kiosk CPU over
  10 s (`/proc/<pid>/stat`, cores busy), CPU heat (`thermal_zone0`, diagnostics only), WebView
  `versionName`, uptime. Nothing is installed on or changed on the frame.
- Writes `~/Library/Application Support/coelho-dashboard/frame-health.json` (override with
  `FRAME_HEALTH_FILE`): latest sample, the **baseline** (first sample, or one taken with
  `--baseline`), the 24 h PSS peak and 24 h of history.
- `GET /api/frame-health` returns latest, baseline and peak (no history). Settings shows one
  "Frame health" row when a reading exists. The full health panel is a later phase.
- Run: `FRAME_ADB=<frame-host>:5555 node scripts/frame-health.mjs --baseline` (set `FRAME_ADB`
  in `.env`; `ADB_BIN` if adb is not on PATH). Every 5 min:
  `launchd/com.coelho.frame-health.plist.example`.
- **Status 2026-10-17:** no baseline yet. The frame's wireless ADB port is closed and the
  dashboard Mac has no adb installed, so the probe could not run. See open questions.

### 7. Screenshot harness (`scripts/screens.mjs`)
- `node scripts/screens.mjs <base-url> <out-dir> [now-iso]` renders every v2 page plus two v1
  regression shots at exactly 1280×800 with headless Chrome (`CHROME=` to pick the binary).
  Run it on a dev machine, not on the Mac serving the frame.
- URL parameters it uses: `?ui=v2`, `?now=<ISO>`, `?theme=light|dark|auto`, `?night=off`,
  `?saver=99999`, and the new `?sheet=uniform` (opens the next event with a uniform line) or
  `?sheet=<event id>`.

## API added
| Endpoint | What |
|---|---|
| `POST /api/frame-info` | Frame report (UA, screen, CSS support, JS heap). Stored only if Android |
| `GET /api/frame-info` | Latest frame report with parsed `chrome`, `android`, `webview`, `ok` |
| `GET /api/frame-health` | Latest ADB probe sample, baseline and 24 h PSS peak, or `ok: false` |

## Tests
`npm test` adds `server/nav.test.js` (rail items, routes, Back targets, idle rule, flash-once,
opt-in flag), `server/frameinfo.test.js` (UA parsing, sanitising, API stores Android only) and
`server/framehealth.test.js` (meminfo, `/proc` stat, thermal, versionName, uptime, 24 h history
and baseline). Fixtures are made up.

## Not in Phase 0
New Home and night view (Phase 1); Weather and Calendar redesign, Coming up content (Phase 2);
person pages, routines, homework (Phase 3); Media, Photos viewer, The Long Drift content
(Phase 4); Ring bridge, live view and doorbell pop-up (Phase 5); feeds and the Settings health
panel (Phase 6).
