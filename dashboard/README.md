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
| `LAT`, `LON` | Weather point. Default Chicago |
| `PHOTOS_DIR` | Optional local image folder |

Calendar flow: PROPFIND principal discovery on `https://caldav.icloud.com`, then `calendar-home-set`, then the calendar whose display name matches, then a REPORT `calendar-query` with a time range and `<c:expand>` so recurring events are expanded. Times are converted to `America/Chicago`. The result is cached about five minutes.

Event titles like `⚽️ JP — U14 Boys Academy - Team Training` belong to that person (emoji before the em dash is ignored). Anything else, including `KJHS — No School`, is for everyone.

## Mac mini, always on

Build once, then let launchd keep the server up. Copy [`launchd/com.coelho.home-dashboard.plist.example`](launchd/com.coelho.home-dashboard.plist.example), fix the path and the `node` binary (`which node`), and:

```sh
cp launchd/com.coelho.home-dashboard.plist.example ~/Library/LaunchAgents/com.coelho.home-dashboard.plist
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.coelho.home-dashboard.plist
```

The process loads `.env` from the dashboard directory itself, so the secrets do not have to be in the plist. `KeepAlive` restarts it if it exits.

## Kiosk URL

The frame must use HTTP on the LAN. In [`kiosk/src/com/wesbos/homehq/MainActivity.java`](kiosk/src/com/wesbos/homehq/MainActivity.java) the default is:

```text
http://MAC_MINI_IP:4173
```

Replace `MAC_MINI_IP` with the mini’s LAN address before installing the kiosk. Cleartext is already allowed in the manifest. The launcher icon is the circle emblem.

## On the frame

Home shows the clock, weather and hourly strip, a next-up countdown in the owner’s color, today’s events in a column per person, a photo tile, chore progress, and the grocery summary. Calendar is an agenda or a week, color-coded, and shows every event. Thiago, Gilmara, JP, and Lucas each have a page with upcoming events plus chores and a homework placeholder. Grocery and chores are stored in `data/store.json` and check off with a tap.
