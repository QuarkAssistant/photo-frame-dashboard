# Coelho de Oliveira frame: PF1007L on firmware 20260410 (rooted 2026-10-11)

A record of the family's PF1007L photo frame (Amazon ASIN B0GHR65YYX) going from stock to rooted,
locked down and running WebView 106, using Wes Bos's
[PF1007L start-here guide](pf1007l-start-here.md) and **Route U**
([mainline U-Boot over FEL](allwinner-a33-mainline-uboot.md)). It follows the guide's numbered tests
(T1 to T8), and it notes where this unit was different from units A, B and C, plus what we changed.

No serials, MAC addresses, Wi-Fi details, account details or whole-eMMC hashes are recorded here.

## Unit report (the guide's template)

```text
About model / firmware:   PF1007L / YHK.F-null-A33-1001-D1024-PF1007L-321-OS-AIMOR.0.20260410
AiMOR version:            6.0.78
Ports:                    USB-C only, TF slot
Cable and port that gave USB data: USB-A to USB-C cable, first through a dock's USB-A port, then a
                          USB-C to USB-A adapter straight into the Mac mini (both worked for data)
T3 USB IDs seen:          1f3a:1000 "Android" (no ADB)
T3b network ADB result:   port 5555 "Connection refused"
T4 sunxi-fel version:     AWUSBFEX soc=00001667(A33) 00000001 ver=0001 44 08 scratchpad=00007e00
T5 check-dump:            skipped (Route U)
eMMC size in sectors:     30,777,344 (15,758,000,128 bytes)   <- differs from units A/B/C
Boot partition start:     172032
Boot image SHA-256:       8ffc2a7d95972422b97ecf7e82da7002011bdacedcbfcc74dd52ae871b98a24e  <- untested hash
Route used and result:    Route U, success: root ADB over USB (uid=0), fingerprint
                          AEEZO/astar_m86_8723cs/astar-m86_8723cs:6.0.1/MOB30R/20260410:eng/test-keys
Host OS:                  macOS 27 on an Apple silicon Mac mini
First failed step:        T4/U-Boot section 4. Read-only ums dropped off USB mid-backup with the stock
                          8-bit eMMC settings (see below), fixed with 4-bit at 26 MHz
```

## What was different on this unit, and the fixes

### 1. `system_profiler` printed nothing on macOS 27
`system_profiler SPUSBDataType | grep 0x1f3a` returned nothing even though the frame was connected.
`ioreg -p IOUSB -l -w0` showed it as `idVendor = 7994`, `idProduct = 4096` (0x1f3a:0x1000).
Use `ioreg` on newer macOS.

### 2. `sunxi-fel` would not link with the default SDK on macOS 27
The linker in Xcode 26.4.1 failed on the macOS 27 SDK's `.tbd` files (`unknown architecture
arm64e.x1-macos`). Building against the older SDK worked:
```sh
SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk make -C diagnostics/sunxi-tools sunxi-fel
```
(sunxi-tools at `d7bbd172a5da`, stub SHA-256 verified as the guide requires.)

### 3. U-Boot built without Docker
The host had no Docker, so the read-only U-Boot was built on a Linux box: first with Debian's GCC 14.2,
then with an Ubuntu 24.04 chroot (GCC 13.3, the same toolchain as the guide's Dockerfile). It was
otherwise identical to `build-uboot.sh` (U-Boot `e50b1e87` plus the unmodified `pf1007l-uboot.patch`,
the SPL-end check passed at `0x456a`/`0x457a`). The compiler made no difference to the problem below.

### 4. The read-only `ums` backup dropped off USB mid-read (the main finding)
With the guide's U-Boot, the eMMC enumerated as `UMS disk 1`, `Media Read-Only: Yes`, and read at
17-18 MB/s. But `emmc-macos.py backup` failed with `OSError: [Errno 6] Device not configured`
three times, after 172 MB, 88 MB and 42 MB. Each time the whole USB device vanished and needed a power
cycle. It happened through a USB hub and also plugged straight into the Mac, so the cable and port
weren't the cause.

This eMMC is **30,777,344 sectors**, the same size as the units in
[PR #6](https://github.com/wesbos/photo-frame-dashboard/pull/6) and
[issue #8](https://github.com/wesbos/photo-frame-dashboard/issues/8) (`016G92`, manfid `0x11`), not
the 30,535,680-sector Samsung of units B and C. PR #6 reported that 8-bit high-speed eMMC hangs U-Boot
mid-transfer on that chip.

**Fix: a U-Boot variant with a slower eMMC bus and no Ctrl+C abort in ums.** The diff is against the
patched tree, and it's in [`coelho-de-oliveira/pf1007l-uboot-slow-emmc.diff`](coelho-de-oliveira/pf1007l-uboot-slow-emmc.diff):
```diff
 &mmc2 {
-	bus-width = <8>;
+	bus-width = <4>;
+	max-frequency = <26000000>;
```
and `if (ctrlc()) return -EPIPE;` removed from `sleep_thread()` in
`drivers/usb/gadget/f_mass_storage.c`. No console is attached, and a floating RX pin can decode as
Ctrl+C. Both read-only layers are unchanged (`ums_write_sector` refuses writes and the LUN is
write-protected). DRAM, PMIC and CPU settings are unchanged.

With that variant, the first full pass completed at about 8.4 MB/s with 0 `0xCC` filler runs. The
second (re-read) pass still dropped once at 3%, so the variant is much better but not perfectly stable
on this board. Next things to try if needed: CPU at 408 MHz (`CONFIG_SYS_CLK_FREQ=408000000`).

### 5. A resumable re-read instead of restarting a 30-minute pass
So we didn't redo the whole read after every dropout, we kept pass 1 as the image and verified it
with a separate, resumable, read-only re-read that compares 64 MiB chunks to the image and saves its
progress: [`coelho-de-oliveira/verify-resume.py`](coelho-de-oliveira/verify-resume.py). It refuses
anything that isn't a read-only `UMS disk N` of the exact size. It matched byte for byte in one run.
Then we gzipped the image and checked the gzip readback hash, which is the same finishing step as
`emmc-macos.py`.

### 6. The SPL sometimes hangs on the first load after power-on
About half the time, the first `sunxi-fel uboot ...` after a power cycle stopped after
`=> Executing the SPL... done.`, and the next `sunxi-fel version` timed out (`usb_bulk_send() ERROR -7`).
Nothing was written. Unplugging for 10-30 seconds and loading again always worked. This matches PR #6's
note that first DRAM training can fail after power-on.

### 7. The host disk filled up during the backup
The full image is 15.8 GB, and the gzip is another few GB. Check that you have about 35 GB free on the
disk that holds `backups/`. We symlinked `backups/` to an external SSD.

## Compatibility gate (T6) and the write

- Partition layout: boot at **172032**, with an `ANDROID!` header, 2048-byte page, kernel 10,221,784 and
  ramdisk 5,660,295 bytes, for 15,886,336 bytes in total, the same size as the tested image.
- Boot image SHA-256 `8ffc2a7d…a24e` **does not match** unit B's `d71c313d…`, which is expected on newer
  firmware. Route U checks structure, not a fixed hash, so the owner chose to go ahead with the full
  verified backup in hand.
- `boot-patch.py` passed all its checks: one cpio file changed, and the header changes are limited to
  ramdisk size and ID. Write ranges were ramdisk `[192004, 203060)` and header `[172032, 172034)`, the
  **same ranges as the tested units**.
- `write-boot.scr` ran with the slow-eMMC U-Boot. Verifying only the boot area afterwards:
  `dd ... skip=172032 count=31028 | shasum -a 256` gave
  `dc697f1c1c470f63e913dcba62b8aadfc7e5073c7c1dceedd908c7f60b62b770`, which equals the backup's boot
  image with the planned payloads applied.
- After a boot without the card: `adb devices` listed the frame as `device`, `adb -d shell id` returned
  `uid=0(root)`, and `sys.boot_completed=1`.

## T8 lockdown

The frame **rejoined Wi-Fi on its own after the first rooted boot**, and `netstat` showed an
ESTABLISHED connection to the vendor on port 7806. Lesson: forget the Wi-Fi network on the frame
before patching, or be ready to run the firewall rule right away.

1. Applied the in-memory `vendor_block` iptables rule from
   [aimor-remote-root-shell.md](aimor-remote-root-shell.md#8-recommended-actions), then force-stopped
   AiMOR and the updater.
2. Installed Rootless Launcher 3.9.1 (SHA-256 `7fa44d56…8404a`) and confirmed it was the focused Home
   activity.
3. `pm disable` on `com.efercro.os.aimor`, `com.yhk.qeota` and `com.DeviceTest`, then waited for
   `package-restrictions.xml` to show `enabled="2"` for all three.
4. Rebooted. There was no `:7806` connection, no vendor processes, Rootless Launcher was the Home app,
   and root still worked.

## WebView 106

We followed section 6 of [the PF1007L guide](allwinner-a33-pf1007l.md) exactly. The stock WebView
was 44.0.2403.119, and the LineageOS WebView `e2edc1f8…980580` went in with the three `.so` files.
/system had 405,820 KiB free before and 288,336 KiB after. The stock tree is preserved at
`/system/homehq-stock-webview`. After a reboot, `dumpsys` reports `versionName=106.0.5249.126`, logcat
shows `WebViewFactory: Loading com.android.webview version 106.0.5249.126`, and a CSS Grid test page
rendered. Notes: dex2oat couldn't precompile the new APK (`Permission denied`), so it runs uncompiled.
There are also harmless `EGL_BAD_ATTRIBUTE` and `DnsConfig` warnings.

## Kiosk on the wall

The dashboard kiosk (`com.wesbos.homehq`) is the Home app. This frame is **Android 6.0.1 (API 23)**, so there is no `cmd` binary and no `cmd package set-home-activity`. The home app was chosen in the system HOME picker, with **Always**.

The activity declares `android.intent.category.HOME`. Its committed default URL is `http://DASHBOARD_HOST:4173`. `dashboard/kiosk/build.sh` reads gitignored `dashboard/kiosk/local.properties` (`dashboard.url=http://host:4173`) and bakes that address into the APK, falling back to the placeholder when the file is absent. Overnight (23:00–06:00 Chicago time, unless `NIGHT_START` / `NIGHT_END` say otherwise) the page itself goes nearly black and shows a small clock, so the frame can stay on without lighting the room. A tap brings the board back for two minutes. If the main page fails to load (Wi-Fi still coming up, or the MacBook briefly away), the WebView retries every 10 seconds. A two-finger hold leaves for the other launcher (Rootless). A plain HOME intent would only reopen this app once it is the default, so the exit looks up the first other home activity and starts that.

The screen stays on while the frame is plugged in:

```sh
adb shell settings put global stay_on_while_plugged_in 7
adb shell svc power stayon true
```

Wi-Fi had been disabled. It was turned back on with `adb shell svc wifi enable`.

Built on the Mac with Homebrew `openjdk@17` and `android-commandlinetools`, build-tools 34, platform `android-34`, then [`dashboard/kiosk/build.sh`](../dashboard/kiosk/build.sh).

To take the kiosk off the wall: disable it or uninstall it, then send Home so the picker (or Rootless) comes back.

```sh
adb shell pm disable com.wesbos.homehq
adb shell input keyevent KEYCODE_HOME
```

or `adb uninstall com.wesbos.homehq`, then the same `KEYCODE_HOME`.

## Undo paths (kept on the host)

- Boot patch: `diagnostics/a33-boot-patch/restore-boot.scr` (FEL card needed again), then
  `emmc-macos.py verify-original`.
- WebView: the guide's section 6 undo, which restores `/system/homehq-stock-webview`.
- Packages: `pm enable` the three packages.
- Kiosk: `pm disable com.wesbos.homehq` (or uninstall it), then `KEYCODE_HOME`.
- Full verified eMMC image plus gzip, kept privately (not in this repo).
- The FEL card's original 4 MiB prefix was restored with `fel-card-macos.py restore`, so the card went
  back to its normal use.

## Dashboard v0.2

See [coelho-de-oliveira/dashboard-v0.2.md](coelho-de-oliveira/dashboard-v0.2.md).
