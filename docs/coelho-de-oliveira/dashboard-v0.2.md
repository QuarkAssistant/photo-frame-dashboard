# Coelho de Oliveira dashboard — v0.2 (2026-10-12)

What changed in the home dashboard that runs on the PF1007L frame (Android 6.0.1,
old system WebView), and how to run, configure and reload it. The server runs on a
Mac that stays on at home; the frame loads `http://DASHBOARD_HOST:4173` over Wi‑Fi.

## Changes in v0.2

### Weather
- **One-line temperatures** everywhere in the weather UI: `59 °F / 15 °C` (no stacked °F/°C lines).
- **Home weather header uses the full card width**: current conditions on the left
  (icon, big `°F / °C`, condition · place), today's High/Low on the right, and the next
  5 hours evenly spread underneath. Every hour label has full AM/PM (`2 PM`).
- The header is built with **`display: table` / `table-cell` and fixed percentages**
  (20 % per hour), because the frame's old WebView mis-handled CSS grid `fr` columns
  and flex `gap` (hourly temperatures ran together and the content only filled ~60 %).
- **Weather page shows 7 days** (Open-Meteo `forecast_days=7`), each with
  `High °F / °C` and `Low °F / °C`.
- **One continuous divider** under the clock, weather card and family list
  (a single `::before` rule spanning the whole header row).

### Grocery list from Reminders
- The grocery card mirrors a shared Reminders list (`REMINDERS_GROCERY_LIST`) via a
  Swift EventKit helper (`npm run reminders:build`) with an osascript fallback.
- macOS requires a one-time **Reminders permission for `node`**:
  System Settings → Privacy & Security → Reminders → enable `node`
  (or click *Allow* on the prompt). Without it the list is empty.

### Photo slideshow and idle screensaver
- The big panel on Home is a **crossfading slideshow** (15 s per photo, 1.2 s fade,
  next image preloaded). Falls back to the family emblem when there are no photos.
- **Screensaver**: after 5 min without a touch, photos go full-screen with a small
  clock, date and `°F / °C` weather overlay. Tap to dismiss (returns to Home).
  It never opens during night mode and closes if night starts.
- Photos come from `PHOTOS_DIR`. The server re-encodes each one to a JPEG that fits
  **1280×800** (macOS `sips`) and caches it in `~/Library/Caches/coelho-photos`,
  which keeps memory use low on the 1 GB frame.
- **iCloud shared album sync**: if `ALBUM_URL` points to a shared album with
  *Public Website* enabled, the server syncs it every **30 minutes** (and at start):
  new photos are downloaded as `icloud-<hash>.jpg`, photos removed from the album are
  deleted. Only `icloud-*` files are managed; other files in the folder are left alone.
  It uses the same anonymous CloudKit calls as the iCloud web viewer
  (`records/resolve` on the public DB → `anonymousPublicAccess` token →
  `records/query` on the shared zone → `resJPEGMedRes.downloadURL`).
  An invite-only album (no Public Website) cannot be read without an Apple ID sign-in.

### Holidays & game days strip
- A compact row between *Next up* and the family columns: the next **3 public holidays**
  (US + Brazil, tagged `US` / `BR`, Brazilian ones in Portuguese) and Flamengo's next
  **2 matches** (`FLA` tag, `@` away / `vs` home, competition). Kick-off times are
  converted to America/Chicago with full AM/PM (`Thu 7:30 PM`).
- Sources (free, no keys): [date.nager.at](https://date.nager.at) `NextPublicHolidays/US|BR`
  (cached 24 h; only nationwide holidays) and ESPN's public JSON
  `site.api.espn.com/apis/site/v2/sports/soccer/all/teams/819/schedule?fixture=true`
  (Flamengo = ESPN team 819, all competitions; cached 3 h; last good data is served
  if a source fails).

## API

| Endpoint | What |
|---|---|
| `GET /api/weather` | Open-Meteo current, hourly, 7-day |
| `GET /api/calendar` | iCloud CalDAV events |
| `GET /api/grocery` / `/api/groceries` | Reminders grocery list |
| `GET /api/photos` | Photo list (`source: folder` or `emblem`) |
| `GET /api/photos/<id>` | Photo as resized JPEG (≤ 1280×800) |
| `GET /api/photos/sync` / `POST` | Album sync status / run a sync now |
| `GET /api/extras` | Next holidays + Flamengo fixtures |

## Refresh intervals
- Clock: every second. Grocery/chores lists: every **20 s**.
- Calendar, weather, photos, extras: every **5 min** (server caches upstream data).
- Album sync: every 30 min. The frame only needs Wi‑Fi; USB is just power.

## URL parameters (testing / screenshots)
- `?night=off` — disable night mode. `?now=2026-10-12T14:00:00-05:00` — fake the time.
- `?saver=5` — open the screensaver after 5 s idle instead of 300.
- `#home`, `#weather`, `#calendar`, … — open a view directly.

## Old-WebView CSS rules
The frame's WebView is old. In new UI code:
- Avoid flex/grid `gap`, `aspect-ratio`, `object-fit`; use margins/padding,
  `display: table` with percentage widths, and `background-size: cover` on divs.
- Add `-webkit-` prefixes for flex and transitions; keep text `white-space: nowrap`
  with ellipsis where space is tight.
- Preload at most one image ahead; serve images already resized.

## Configuration (`dashboard/.env`, never committed)
```
PORT=4173
LAT=00.0000
LON=-00.0000
WEATHER_PLACE=Your Town
ICLOUD_USER=you@example.com
ICLOUD_CALENDAR_NAME=Family
ICLOUD_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
REMINDERS_GROCERY_LIST=Groceries
NIGHT_START=23:00
NIGHT_END=06:00
PHOTOS_DIR=~/dashboard-photos
ALBUM_URL=https://photos.icloud.com/shared/album/<album-key>
HOME_ADDRESS=123 Main St, Your Town, ST 00000
HOME_LAT=00.0000
HOME_LON=-00.0000
```
`ALBUM_URL` gives read access to the album to anyone who has it — keep it only in `.env`.
The kiosk APK reads its URL from the git-ignored `dashboard/kiosk/local.properties`
(`dashboard.url=http://DASHBOARD_HOST:4173`).

## Deploy and reload
```
cd dashboard
npx vite build                                   # static changes: live on next frame reload
launchctl kickstart -k gui/$(id -u)/com.coelho.dashboard   # server changes
```
Reload the frame: power-cycle it, or over adb:
`adb shell am force-stop com.wesbos.homehq; adb shell monkey -p com.wesbos.homehq -c android.intent.category.LAUNCHER 1`.

## v0.3 — "Leave by" on Next up
- For a timed event with a location, Next up shows a pill: **Leave by H:MM AM/PM**
  (event start − driving time − 5 min buffer), then **Leave in N min** (amber at ≤ 15 min),
  **LEAVE NOW** (pulsing, until there is no buffer left) and **Running late · N min**,
  plus the drive time (`11 min drive`).
- `GET /api/eta?to=<event location>` → `{ ok, minutes, km, source }`, cached 10 min per destination.
- Geocoding: OpenStreetMap Nominatim (≤ 1 req/s, cached). Multi-line locations
  ("Place\nStreet, City") are retried line by line.
- Routing: Waze live-map (`/live-map/api/user-drive`) is tried first for live traffic, but it
  currently answers 403 to server requests (the old `RoutingManager/routingRequest` returns 410),
  so in practice the OSRM demo server is used (free, **no live traffic**). The UI only adds
  "live traffic" when the Waze source answered.
- Home location comes from `HOME_LAT` / `HOME_LON` (or `HOME_ADDRESS`) in `.env` — never committed.
  Upstream (wesbos) uses a static `travel` minutes field on mock events (`App.leaveBy` in
  `dashboard/js/app.js`, pill in `dashboard/js/views/home.js`); there is no routing API there.
