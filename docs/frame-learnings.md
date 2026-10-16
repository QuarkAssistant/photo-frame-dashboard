# What we learned running a family dashboard on a rooted PF1007L photo frame

Device: Amazon-sold PF1007L photo frame (Allwinner A33, 4 cores, 1 GB RAM), Android 6.0.1, Android System WebView 106, 1280×800 landscape touch screen, rooted with the guides in [wesbos/photo-frame-dashboard](https://github.com/wesbos/photo-frame-dashboard). The dashboard is a small Node + Vite app served from a computer on the LAN; the frame shows it in the kiosk app's WebView.

These notes come from measuring the real frame over ADB. Numbers are from our unit, so treat them as a guide.

## 1. JavaScript lag: three cheap fixes (PR #27)

Profiling over USB ADB and WebView remote debugging found three causes. Look and behavior stayed the same.

| Fix | Why it matters |
|---|---|
| **Cache `Intl.DateTimeFormat`** (one formatter per time zone, plus a small per-second result cache) | `parts()` built a new formatter on every call. That was 31–39% of main-thread time. A Calendar month tap took 7.6 s to respond; Agenda took 2.9 s. |
| **Only repaint when data changes** (JSON signature of the watched state; skip the view when it matches) | The 20 s list poll and the 5 min refresh rebuilt the visible view even when nothing changed. On Home the main thread was busy about 10 s of every 20 s, and the node count kept growing. User actions still repaint immediately. |
| **Write the clock only when the minute changes**, from a timer aligned to the minute boundary | Rewriting the clock every second caused 31–43 layouts per 20 s. The 1 s tick still drives the night window and the screensaver idle count; it just does not touch the clock DOM. |

Also: avoid continuous animations (animated SVG, infinite `@keyframes`, GIFs). Upstream [issue #143](https://github.com/wesbos/photo-frame-dashboard/issues/143) showed one animated SVG holding ~1.8 of 4 cores on the same chip.

## 2. CSS can't fix scroll jank (PR #28)

List scrolling (grocery and member pages) was measured with `dumpsys gfxinfo` during scripted swipes: 3 up/down pairs, 600 ms each. Every CSS change left jank at roughly the same level (about 93–96% janky frames). What was actually tried:

| Variant | Janky frames |
|---|---|
| Current CSS | 95–96% |
| `will-change: transform` on the scroll container | 93–96% |
| Opaque background on the scroll container | 94–95% |
| Opaque background plus `will-change` | 93–96% |
| No shadows, radii, gradients, or filters anywhere | 96% |
| List text made transparent | 96% |

There are no scroll listeners, and the page's own frame loop stays at about 17 ms (60 fps) during a swipe. As a control, a plain white full-screen list of text lines, injected over the dashboard, still janked (79% janky, 48 ms at the 90th percentile), and a 300×300 px plain scroller janked 96% (53 ms). Most slow frames are reported as "slow issue draw commands", which is the WebView's GPU compositing on this device. The cost is that path, not the dashboard's styling, and no CSS change was shipped.

## 3. Kiosk app WebView tweaks (PR #29)

The kiosk `MainActivity` was rebuilt with these settings, and nothing else on the WebView:

- `setOverScrollMode(View.OVER_SCROLL_NEVER)` (no overscroll glow)
- vertical and horizontal scrollbars off (`setVerticalScrollBarEnabled(false)`, `setHorizontalScrollBarEnabled(false)`)
- `setScrollbarFadingEnabled(false)`
- `WebSettings.setOffscreenPreRaster(true)`
- `WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED` added to the window flags (alongside the existing keep-screen-on and fullscreen flags)

The WebView stays on the default layer type. `setLayerType` is not called.

On the frame, gfxinfo went from **93.5% janky frames to 84%**, and the **slowest 10% of frames from 44 ms to 32 ms**.

Also measured, with no improvement:

- Forcing GPU rendering (the developer option).
- Disabling hardware overlays.

Putting the WebView on a hardware layer (`LAYER_TYPE_HARDWARE`) made scrolling worse (**96.7%** janky).

The remaining stutter is the A33's GPU. Keep lists short, paginate instead of long scrolls where you can.

**Build note:** the kiosk app needs **JDK 17** to compile. Back up the installed APK (`adb shell pm path …` + `adb pull`) before installing a new build, so you can roll back.

## 4. Sensors on the PF1007L

Listed with `adb shell dumpsys sensorservice`:
- **Light sensor** – works; good for auto-brightness / night dimming.
- **Accelerometer** – present.
- **Ambient temperature sensor** – present (reads the inside of the case, so expect it warmer than the room).
- **No usable microphone** found.

## 5. WebView and Android versions

- **WebView 106 is the last release for Android 6.** The stock one was 44.
- `CSS.supports` on this WebView reports grid, flex `gap`, and `aspect-ratio`. It does not report `oklch()`, `color-mix()`, CSS nesting, or `:has()`.
- Even so, this frame mis-handled CSS grid `fr` columns and flex `gap`: hourly temperatures ran together and the weather header only filled about 60% of the card. New UI avoids flex/grid `gap`, `aspect-ratio`, and `object-fit`. Use margins or padding, `display: table` with percentage widths, and `background-size: cover` on divs. Add `-webkit-` prefixes for flex and transitions.
- A newer Chromium build would not give a newer engine than 106 on Android 6.
- **Reflashing a newer Android isn't advised:** there's no maintained ROM for this chip and the brick risk is real.

## 6. Security note: network ADB has no authentication

On our unit `ro.adb.secure=0`. If you enable ADB over Wi-Fi (`adb tcpip 5555`), **anyone on your network gets a root shell with no prompt**. Only do it on a trusted network, never forward the port, and know that it resets on reboot. (Upstream #146 reports the same pattern on another frame.)

## 7. Live security cameras (Ring) via go2rtc

Pipeline that worked, all on the LAN:

`ring-client-api` (Node, sole holder of the refresh token, saves rotated tokens) → ffmpeg → RTSP into **go2rtc** → frame WebView opens go2rtc's player (`mode=webrtc,mse`).

- WebRTC with H.264 plays fine on WebView 106. H.265 won't play; transcode or pick H.264.
- **One live stream at a time is fine:** frame CPU went from ~12% idle to 35–62%, time to first picture 3–7 s.
- **A 4-camera live grid pins the frame at 95–99% CPU.** Don't.
- What we settled on: a still per camera with a **Live** button, one stream at a time, auto-close after 60 s, a "Waking up…" state until go2rtc reports a producer (opening the player too early fails every time), and portrait doorbells kept in portrait.
- Battery cameras: only fetch stills when the page opens and reuse them for 5+ minutes.
- Privacy: token in a chmod-600 local file, never in git; bind go2rtc to the LAN; no port forwarding; keep camera images out of repos and logs.

## 8. How we measured

- **Frame timing:** `adb shell dumpsys gfxinfo <kiosk package> reset`, do the interaction, then `dumpsys gfxinfo <kiosk package>` for janky-frame % and the slowest frames.
- **CPU:** per-thread `/proc/<pid>/task/*/stat` (as in upstream #143) or `top`; **RAM:** `dumpsys meminfo <package>`.
- **Scroll tests:** `adb shell input swipe` for 600 ms, 3 up/down pairs, in list areas.
- ⚠️ **Never use `input tap` on real list items during tests.** A tap can tick a chore or remove a grocery item on the live family data. Swipe only, and test against demo data where possible.
- Measure before and after every change; one variable at a time.
