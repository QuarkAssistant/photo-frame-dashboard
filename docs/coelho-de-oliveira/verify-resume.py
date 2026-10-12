#!/usr/bin/env python3
"""Resumable independent re-read of the frame eMMC against backups/a33-emmc-pass1.img.

  sudo python3 -I diagnostics/verify-resume.py diskN 15758000128

Read-only: opens the disk O_RDONLY and refuses anything but U-Boot's read-only
"UMS disk N" of the exact size. Compares 64 MiB chunks to the image and records
progress in backups/verify-progress.txt, so after a USB dropout you reload U-Boot
and run the same command again to continue where it stopped.
"""
import os, plistlib, re, subprocess, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
IMAGE = REPO / "backups/a33-emmc-pass1.img"
PROGRESS = REPO / "backups/verify-progress.txt"
CHUNK = 64 * 1024 * 1024

def fail(m): sys.exit(f"STOP: {m}")

if len(sys.argv) != 3: sys.exit(__doc__)
ident, size = sys.argv[1], int(sys.argv[2])
if not re.fullmatch(r"disk\d+", ident): fail("pass a whole disk like disk7")
info = plistlib.loads(subprocess.check_output(["diskutil", "info", "-plist", ident]))
if not re.fullmatch(r"UMS disk \d+", info.get("MediaName", "")): fail(f"unexpected media {info.get('MediaName')!r}")
if info.get("TotalSize") != size: fail(f"size {info.get('TotalSize')} != {size}")
if info.get("WritableMedia", True): fail("disk is writable; only the read-only U-Boot may be running")
if IMAGE.stat().st_size != size: fail("image size differs from disk size")
subprocess.check_call(["diskutil", "unmountDisk", ident])

done = int(PROGRESS.read_text().strip()) if PROGRESS.exists() else 0
print(f"  resuming at byte {done} ({done * 100 // size}%)")
with open(f"/dev/r{ident}", "rb", buffering=0) as disk, open(IMAGE, "rb") as img:
    disk.seek(done); img.seek(done)
    while done < size:
        n = min(CHUNK, size - done)
        a = disk.read(n)
        if len(a) != n: fail(f"short read at {done}")
        if a != img.read(n): fail(f"MISMATCH in chunk at byte {done}: the copy and the disk differ")
        done += n
        PROGRESS.write_text(str(done))
        print(f"\r  re-read and matched: {done * 100 // size:3d}%", end="", flush=True)
print("\nIndependent re-read matches the saved image byte for byte.")
