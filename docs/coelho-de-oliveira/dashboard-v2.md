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
`?ui=v2` forces v2 and `?ui=v1` forces v1 in any browser. Without either, the server default
decides: `DASHBOARD_UI=v2` in `dashboard/.env` makes the plain URL (the frame's) open v2; unset or
`v1` keeps it on v1. The server adds `data-ui-default="v2"` to `<html>` when serving the page.
The kiosk APK has its URL built in and the frame opens it at boot, so this flag is what switches
the frame. Examples:

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

## Phase 1: Home (2026-10-17)
Phase 0 only changed the rail, so v2 still looked like v1. Phase 1 rebuilds Home to match
proposal mockup 01 (Garden Morning) and gives it mockup 02's Olive Grove palette at night.
v1's Home (`js/views/home.js`) is untouched; the new one only registers when the v2 shell is on.

Files: `js/views/homev2.js` (view), `js/homev2data.js` (pure data shaping, tested),
`js/v2icons.js` (stroke icons and the filled weather illustrations, no SVG filters),
`css/v2/home.css` (all v2 Home styles, plus the v2-wide font switch).

- **Type:** self-hosted Nunito 700–900 for every v2 page. The v1 serif and condensed faces
  are switched off under `html.ui-v2`. Sizes are `clamp(75 %, px / 12.8 vw, 125 %)`; boxes use
  vw (horizontal) and vh (vertical), so at 1280 × 800 every value is the mockup's px.
- **Clock:** 156 px, AM/PM beside it, full date line ("Saturday, October 17").
- **Weather card:** illustration, °F / °C on one line, condition, H / L (°F / °C), Inside line
  from the indoor sensor, then one context line: rain (first hour in the next 12 with a 40 %+
  chance, "Rain likely from 6 PM · 60%"), else Sunset by day, else tomorrow's high at night.
- **People:** colored initial circles (Thiago red, Gilmara coral, JP blue, Lucas green) with
  the Find My place as the status line and "Find My · N min ago" under them.
- **Next Up:** teal card (card color with amber at night). Person chip, title (smaller type for
  long titles instead of cutting), big time, minute countdown inside the hour, or Now. Details
  line (day, full AM/PM range, first part of the location). Leave-by pill only when `/api/eta`
  returns a real drive time. Then row: the next timed event after it.
- **Photo:** rounded card, real album photos, cover crop, date and place caption.
- **Bottom row:** chore rings in person colors with X/Y for the current routine (the "Anyone"
  chores are not shown on Home); Coming up; Grocery count with the first items.
- **Coming up:** the next three of: birthdays, trips and tournaments found in the family
  calendar, US and Brazil holidays (date.nager.at) and Flamengo games (ESPN). No trips feed
  exists yet, so trips only show when they are on the calendar. Right side: weekday + full time
  within a week ("Sun 4:30 PM", never cut), else "N days". Names are cut with an ellipsis
  before the time ever is.
- **Holidays in English:** `BR_HOLIDAYS_EN` maps Brazilian names (Dia de Finados → All Souls'
  Day, Proclamação da República → Republic Proclamation Day, …). Unknown names stay as they are.
- **Night:** the same layout in Olive Grove, on the existing switch (`html.theme-dark`: the
  Settings choice of light, dark or auto by sunset/sunrise). `?theme=dark` forces it.
- **Calendar grid** is no longer on Home; it stays on the Calendar page.
- Tapping a card opens its page (Weather, a person, Photos, Chores, Coming up, Grocery). Home
  never toggles a chore or a grocery item.

### Phase 1 fixes (2026-10-17, approved by Thiago)
- **People:** the real profile photos again (the same `/avatars/<id>.jpg` files v1 uses), each
  in a 3 px ring of the person's color. Four compact rows; under each name that person's own
  Find My place and update age ("Home · Updated 4 min ago"). The shared "Find My · N min ago"
  line is gone. With no Find My reading the row says "Location off".
- **Next Up while live:** "Ends 6:00 PM · 3 hr 10 min left" and a progress bar of the event's
  own start and end (`liveProgress`). Nothing is shown for all-day events.
- **Home address:** `/api/calendar` relabels any event whose location loosely matches
  `HOME_ADDRESS` from `.env` (same street number and street name, abbreviations folded) to
  `location: "Home"` with `atHome: true`, so the street address never reaches the page.
  `/api/eta` answers `ok: false` for "Home", so home events get no Leave-by pill.
- **Titles as written:** calendar titles show exactly as the calendar gives them (only v1's
  "Name — " owner prefix is stripped, and Brazilian holidays get English names). Birthdays are
  not renamed; an earlier "<Name>'s birthday" rule was removed because the owner prefix only
  says who is attending.
- **Spacing:** people photo rings are `clamp(3px, 0.28vw, 4px)` (about 3.6 px at 1280 wide), and
  the live progress bar sits higher so it has room above the Then row.
- **Family birthdays (Coming up only):** `FAMILY_BIRTHDAYS` in the local `.env` (never committed),
  `<name or id>=<YYYY-MM-DD or MM-DD>` separated by commas, family members only. `/api/extras`
  passes `{ id, name, month, day }` (no year), and Coming up mixes each person's next birthday in by
  date as "<Name>'s birthday" with the cake icon and "Today" / "Tomorrow" / "N days". No age is
  shown. Calendar titles are never renamed.

Tests: `server/homev2.test.js` (date line, holiday names, countdown labels, Coming up mix and
order, Next Up / Then / big number / details, Leave by, rain and context lines, and a CSS check
for WebView 106 limits).

Not matched yet (Phase 1 follow-ups): night Home keeps the day layout (mockup 02's Tomorrow
card, Bedtime routine, Family board and Night mode cards need routines and a board source);
no seasonal leaf art next to the date; no small badges on JP's and Lucas's photos.

## Phase 2: Calendar (2026-10-17)

Matches proposal mockup 04 (Week) and 05 (Coming up). Files: `js/views/calendarv2.js` (registers
`calendar` and `coming-up` only with the v2 shell; v1 keeps `js/views/calendar.js`),
`js/calv2data.js` (pure helpers), `css/v2/calendar.css`, tests in `server/calv2.test.js`.

- **Header:** the range ("Oct 18 – 24", "October 2026", "Next 14 days") and a segmented control:
  Agenda, Week (default), Month, Coming up. Round prev/next buttons for Week (2 weeks back,
  4 ahead) and Month (1 back, 1 ahead), and a "Today" pill whenever you've moved away.
  `?cal=agenda|week|month` opens a mode for screenshots.
- **Filters:** Everyone, Kids (JP + Lucas), Parents (Thiago + Gilmara), with a subtitle. Kids and
  Parents also keep family-wide events and holidays; Flamengo games show under Everyone and
  Parents.
- **Week:** 7 Sunday-first columns; today's column is tinted with a teal pill on its label. Cards
  are tinted with a left bar in the owner's colour (Thiago red, Gilmara coral, JP blue, Lucas
  green, Family teal, Parents brown, holidays gold, Flamengo black) and show the full AM/PM time
  or "All day", the title and the person. Past events are dimmed. Four slots per day; more turns
  the last slot into "+N more", which opens the whole day in a sheet.
- **Titles:** shown as the calendar writes them (v1's "Name — " owner prefix stripped). The
  narrow Week and Month cards also drop the team prefix v1 Home drops ("U14 Boys Academy -
  Team Training" → "Team Training"); Agenda, Coming up and the popup keep the full title.
- **Holidays and Flamengo** come from `/api/extras` (the next 3 holidays and next 2 games), so
  past weeks don't show them.
- **Popup:** the existing event sheet, restyled for v2 (Nunito, person-colour bar, uniform tag
  and colour swatches for soccer events). `?sheet=uniform` still opens the next soccer popup.
- **Agenda and Month:** v2 versions of the v1 views (14-day list; month grid with up to 3 chips
  a day, 2 in 6-week months, then "+N more").
- **Coming up:** today's remaining events (first one teal), tomorrow's first events, four
  countdown tiles and a "Later" list, all from `comingUp()`: family birthdays
  (`FAMILY_BIRTHDAYS`), holidays in English, Flamengo games, and calendar trips, outings,
  tournaments and birthday events. There is no trips feed, so the mockup's Travel day card and
  flight details are not built.
- **DOM (measured on real data):** Week 89 elements inside the view (331 for the whole
  document), Agenda 199, Month 209, Coming up 133.

## Rolling back to v1
Before Phase 0 was merged, v1 was saved two ways:
- Git tag `v1-backup-2026-10-17` (the last v1-only commit on `main`).
- A copy of the built `dist/` in `~/coelho-dashboard-backups/v1-2026-10-17/` on the Mac that
  serves the frame, with a README naming the commit.

**One step back to v1 for the frame:** set `DASHBOARD_UI=v1` in `dashboard/.env` (or remove the
line), then `launchctl kickstart -k gui/$(id -u)/com.coelho.dashboard`. The frame picks it up on
its next page load (relaunch the kiosk with
`adb -d shell am start -n com.wesbos.homehq/.MainActivity -d http://DASHBOARD_HOST:<port>/` or wait
for a reboot). Any browser can still check one version with `?ui=v1` or `?ui=v2`.

If the v2 code itself has to go:
To put the old build back: stop the LaunchAgent, copy the backup `dist/` over `dashboard/dist`,
then restart it. To rebuild from source: check out the tag (on a new branch, or revert the merge
with a normal commit; never force-push), run `npm ci` and `npm run build` in `dashboard/`, and
restart the LaunchAgent.
