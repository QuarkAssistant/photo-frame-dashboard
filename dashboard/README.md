# Coelho de Oliveira home dashboard

Always-on family dashboard for a rooted PF1007L photo frame (1280×800, Android 6, WebView 106). The frame only talks to a small Node server on the home LAN over plain HTTP. The Mac mini reaches iCloud and Open-Meteo; the frame never does.

The visual model is a light editorial board: big clock, serif headings, cards, and a left icon rail. The mark is the cream rabbit-and-olive emblem. Ink is deep forest green `#1F3A3A`, paper is warm cream `#E8DCC4`, and the accent is olive `#7A8A3C`.

Family names and colors live in one file: [`family.js`](family.js).

## Run it

Node 18 or newer.

```sh
cd dashboard
cp .env.example .env
npm install
npm run build
npm run serve
```

`npm run serve` binds `0.0.0.0` on `PORT` (default **4173**) and serves `dist/` plus the JSON API. With iCloud vars empty, `/api/calendar` is mock data, so the board still runs. Open-Meteo is used for weather when the mini can reach it, and falls back to a mock forecast if it cannot.

`npm run dev` is the same API behind Vite, also with mock data when `.env` is missing.

Do not commit `.env`, `data/`, or anything from `PHOTOS_DIR`. This repository is public.

## Environment

| Variable | Purpose |
| --- | --- |
| `PORT` | Listen port, default 4173 |
| `ICLOUD_USER` | Apple ID email |
| `ICLOUD_APP_PASSWORD` | App-specific password (not the Apple ID password) |
| `ICLOUD_CALENDAR_NAME` | Calendar display name. The real one is `Calendário da Família` |
| `LAT`, `LON` | Weather point. Default Naperville (`41.7859`, `-88.1473`) |
| `WEATHER_PLACE` | City name on the weather card. Default `Naperville` |
| `REMINDERS_GROCERY_LIST` | Prefix of the shared Reminders list. Default `Supermercado` |
| `NIGHT_START`, `NIGHT_END` | Dim-clock window in `America/Chicago`. Default `23:00` to `06:00` |
| `PHOTOS_DIR` | Optional local image folder. Blank shows the family emblem |

Calendar flow: PROPFIND principal discovery on `https://caldav.icloud.com`, then `calendar-home-set`, then the calendar whose display name matches, then a REPORT `calendar-query` with a time range and `<c:expand>` so recurring events are expanded. Times are converted to `America/Chicago`. The result is cached about five minutes.

Event titles like `⚽️ JP — U14 Boys Academy - Team Training` belong to that person (emoji before the em dash is ignored). Anything else, including `KJHS — No School`, is for everyone.

The same normalized title on the same day is kept once. Punctuation, possessives, and a trailing *s* are ignored, so an all-day “Indigenous Peoples' Day” and a midnight “Indigenous People Day” collapse to the all-day event. “Team Training” and “Strength and Conditioning” stay separate. A timed event that starts at midnight is not shown as someone’s next time.

## Grocery from Apple Reminders

On the Mac, the grocery page and the Home tile read the shared Reminders list whose name starts with `Supermercado` (the family’s list is `Supermercado ⚠️`). `REMINDERS_GROCERY_LIST` changes the prefix. The server asks EventKit for that list only. It does not walk the other lists.

`npm run reminders:build` compiles `server/reminders.swift` with `swiftc` into `server/bin/reminders-grocery` (gitignored). The server compiles it on first use when the binary is missing or older than the source. If `swiftc` is not available, it falls back to `osascript` with `server/reminders.jxa.js`. The incomplete items (title, notes, id) are cached for about 60 seconds. Checking an item off marks it complete in Reminders. Adding an item creates a reminder in that list, so the family’s phones stay in sync.

`/api/grocery` and `/api/groceries` include `source`: `reminders` or `store`. On Linux, or if Reminders cannot be read, the board uses `data/store.json`.

The first time the helper runs, macOS asks for Reminders access. Allow it under **System Settings → Privacy & Security → Reminders** for Terminal, `node`, or `reminders-grocery`. An unsigned command-line tool is often attributed to the app that launched it (Terminal, or the launchd job). If no prompt appears, run `server/bin/reminders-grocery list Supermercado` once from Terminal, or `tccutil reset Reminders` and try again.

## Weather

Open-Meteo is called with `LAT` and `LON` (Naperville unless you change them) and `WEATHER_PLACE` for the city name. Temperatures are stored in Fahrenheit and shown with Celsius beside them: the current reading is like `61°F` with `16°C`, the high and low are like `76°F / 24°C`, and each hour and forecast day puts °F above a smaller °C. Hour labels are `Now`, `12 AM`, `1 AM`, `2 PM`. The Home card is the current reading and the next eight hours, with a precipitation percent only when it is above zero. Tap the card for the five-day forecast. The result is cached about ten minutes. If Open-Meteo cannot be reached, a mock forecast is served.

## Mac mini, always on

Build once, then let launchd keep the server up. Copy [`launchd/com.coelho.home-dashboard.plist.example`](launchd/com.coelho.home-dashboard.plist.example), fix the path and the `node` binary (`which node`), and:

```sh
cp launchd/com.coelho.home-dashboard.plist.example ~/Library/LaunchAgents/com.coelho.home-dashboard.plist
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.coelho.home-dashboard.plist
```

The process loads `.env` from the dashboard directory itself, so the secrets do not have to be in the plist. `KeepAlive` restarts it if it exits.

## Night mode

From `NIGHT_START` until `NIGHT_END` (default 23:00–06:00, `America/Chicago`) the board is a near-black screen with one small dim clock. Event times and this clock share `formatTime`, so the meridian is always `AM` or `PM`. The clock glides to a new spot every three minutes. Any tap brings the full board back for two minutes, then the night screen returns while the window is still open. Outside those hours the usual idle screensaver is unchanged. `/api/config` reports the window the server is using.

## Kiosk URL

The frame must use HTTP on the LAN. In [`kiosk/src/com/wesbos/homehq/MainActivity.java`](kiosk/src/com/wesbos/homehq/MainActivity.java) the default is:

```text
http://10.0.0.28:4173
```

The activity is a HOME handler. This frame is Android 6.0.1 (API 23), so the home app was chosen in the HOME picker with Always (`cmd package set-home-activity` does not exist). If the page fails to load, the WebView retries every 10 seconds. A two-finger hold opens the other launcher instead of this app. Cleartext is already allowed in the manifest. The launcher icon is the circle emblem. Build notes and the revert commands (`pm disable com.wesbos.homehq` or uninstall, then `KEYCODE_HOME`) are in the [frame write-up](../docs/coelho-de-oliveira-pf1007l.md).

## On the frame

Home shows the clock, a weather card (current reading and eight hours; tap it for five days), a next-up countdown in the owner’s color, each person’s next event with a weekday and `AM`/`PM`, the family emblem when `PHOTOS_DIR` is empty, chore progress, and the grocery summary. Overnight it rests on the dim clock. Calendar is an agenda or a week, color-coded, and shows every event. Thiago, Gilmara, JP, and Lucas each have a page with upcoming events plus chores and a homework placeholder. On a Mac, grocery checks and adds go to the Reminders list. Otherwise they are stored in `data/store.json`.
