#!/usr/bin/env python3
"""Fail-closed validation + churn-normalization gate for the pSEO data regen.

Run from the repo root AFTER `transit-scorer --line-pages --stop-pages` has
rewritten data/linije and data/stanice (scripts/regen-data.sh calls this before
it commits). Exits non-zero — so regen-data.sh aborts WITHOUT committing — when
the freshly generated output looks degraded. The failure mode this exists to
catch is the one that started the whole feed-staleness saga: a silently
walk-only / partial OTP graph yields structurally-valid JSON whose reach has
collapsed across every page, which a plain `/api/health` check can't see but
which would poison ~1,400 SSG pages if auto-deployed.

It also reverts files whose only change vs HEAD is the `generatedAt` timestamp,
so regenerating from an unchanged feed produces an empty diff (no commit, no
deploy). With realtime=0 (schedule-only reach) + a pinned GENERATED_AT the leaf
files are already deterministic; this is the belt-and-suspenders for the index
files that do carry a timestamp.

Tunable via env (GATE_*); defaults are deliberately loose enough not to trip on
a legitimate feed change but tight enough to catch a collapse.
"""

import json
import os
import statistics
import struct
import zlib
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

MIN_LINES = int(os.environ.get("GATE_MIN_LINES", "150"))
MIN_STOPS = int(os.environ.get("GATE_MIN_STOPS", "1200"))
MIN_REACH_COVERAGE = float(os.environ.get("GATE_MIN_REACH_COVERAGE", "0.80"))
MIN_LINE_AREA_MEDIAN = float(os.environ.get("GATE_MIN_LINE_AREA", "10"))
MIN_STOP_STATIONS_MEDIAN = float(os.environ.get("GATE_MIN_STOP_STATIONS", "12"))
# Hero maps: share of pixels that are building (blue). Medians run 7-15% per
# set; a few rural stop crops are legitimately empty, but a broken map source
# blanks (or floods) nearly all of them at once.
BLANK_HERO_COVERAGE = 0.001
FULL_HERO_COVERAGE = 0.95
MAX_BLANK_HERO_SHARE = float(os.environ.get("GATE_MAX_BLANK_HERO_SHARE", "0.05"))
MIN_HERO_COVERAGE_MEDIAN = float(os.environ.get("GATE_MIN_HERO_COVERAGE", "0.02"))
HERO_SETS = (
    ("data/linije/hero-meta.json", "public/linije"),
    ("data/stanice/hero-meta.json", "public/stanice"),
    ("data/kvart/hero-meta.json", "public/kvart"),
)

SKIP = {"index.json", "hero-meta.json"}


def page_files(d):
    return sorted(f for f in os.listdir(d) if f.endswith(".json") and f not in SKIP)


def load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def fail(msg):
    print(f"GATE FAIL: {msg}", file=sys.stderr)
    sys.exit(2)


def main():
    line_files = page_files("data/linije")
    stop_files = page_files("data/stanice")

    # --- 1. Count floors (a collapse means OTP returned a partial graph) ---
    if len(line_files) < MIN_LINES:
        fail(f"only {len(line_files)} line files (< {MIN_LINES})")
    if len(stop_files) < MIN_STOPS:
        fail(f"only {len(stop_files)} stop files (< {MIN_STOPS})")

    # --- 2. Parse everything + measure reach health ---
    line_areas, line_with_reach = [], 0
    for f in line_files:
        try:
            o = load(f"data/linije/{f}")
        except (ValueError, OSError) as e:
            fail(f"data/linije/{f} did not parse: {e}")
        r = o.get("reach")
        if r and r.get("areaKm2") is not None:
            line_with_reach += 1
            line_areas.append(float(r["areaKm2"]))

    stop_stations, stop_with_reach = [], 0
    for f in stop_files:
        try:
            o = load(f"data/stanice/{f}")
        except (ValueError, OSError) as e:
            fail(f"data/stanice/{f} did not parse: {e}")
        r = o.get("reach")
        if r and r.get("stations30") is not None:
            stop_with_reach += 1
            stop_stations.append(float(r["stations30"]))

    for name in ("data/linije/index.json", "data/stanice/index.json"):
        try:
            idx = load(name)
        except (ValueError, OSError) as e:
            fail(f"{name} did not parse: {e}")
        if not idx:
            fail(f"{name} is empty")

    # --- 3. Reach coverage + magnitude (catches walk-only collapse) ---
    line_cov = line_with_reach / len(line_files)
    stop_cov = stop_with_reach / len(stop_files)
    if line_cov < MIN_REACH_COVERAGE:
        fail(f"line reach coverage {line_cov:.2%} < {MIN_REACH_COVERAGE:.0%}")
    if stop_cov < MIN_REACH_COVERAGE:
        fail(f"stop reach coverage {stop_cov:.2%} < {MIN_REACH_COVERAGE:.0%}")

    line_med = statistics.median(line_areas) if line_areas else 0.0
    stop_med = statistics.median(stop_stations) if stop_stations else 0.0
    if line_med < MIN_LINE_AREA_MEDIAN:
        fail(f"median line reach {line_med:.1f} km² < {MIN_LINE_AREA_MEDIAN} (walk-only?)")
    if stop_med < MIN_STOP_STATIONS_MEDIAN:
        fail(f"median stop reach {stop_med:.0f} stations < {MIN_STOP_STATIONS_MEDIAN} (walk-only?)")

    # --- 4. Hero maps: none missing, none blank (a broken map source) ---
    check_heroes()

    # --- 5. Churn normalization: revert timestamp-only diffs ---
    reverted = normalize_timestamp_only_diffs()

    changed = git_changed_count()
    print(
        f"GATE OK: {len(line_files)} lines (reach {line_cov:.0%}, "
        f"med {line_med:.1f} km²), {len(stop_files)} stops "
        f"(reach {stop_cov:.0%}, med {stop_med:.0f}); "
        f"{changed} files materially changed, {reverted} timestamp-only reverts."
    )


def unfilter(ftype, row, prev, bpp):
    """Undo one PNG scanline filter (spec section 9)."""
    out = bytearray(row)
    for i in range(len(out)):
        left = out[i - bpp] if i >= bpp else 0
        up = prev[i]
        if ftype == 1:
            out[i] = (out[i] + left) & 0xFF
        elif ftype == 2:
            out[i] = (out[i] + up) & 0xFF
        elif ftype == 3:
            out[i] = (out[i] + (left + up) // 2) & 0xFF
        elif ftype == 4:
            ul = prev[i - bpp] if i >= bpp else 0
            p = left + up - ul
            pa, pb, pc = abs(p - left), abs(p - up), abs(p - ul)
            pred = left if pa <= pb and pa <= pc else (up if pb <= pc else ul)
            out[i] = (out[i] + pred) & 0xFF
    return bytes(out)


def hero_coverage(path, data=None):
    """Share of non-white pixels in a 1-bit palette hero PNG (what dither-crop
    writes). Any other PNG layout fails the gate rather than being guessed at."""
    if data is None:
        with open(path, "rb") as fh:
            data = fh.read()
    pos, idat, ihdr, plte = 8, [], None, b""
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        kind, body = data[pos + 4 : pos + 8], data[pos + 8 : pos + 8 + length]
        if kind == b"IHDR":
            ihdr = struct.unpack(">IIBBBBB", body)
        elif kind == b"PLTE":
            plte = body
        elif kind == b"IDAT":
            idat.append(body)
        pos += 12 + length
    width, height, depth, ctype, _, _, interlace = ihdr
    if ctype != 3 or depth != 1 or interlace != 0 or len(plte) not in (3, 6):
        fail(f"{path}: expected a 1-bit palette PNG")
    if len(plte) == 3:
        return 0.0 if plte == b"\xff\xff\xff" else 1.0
    white = 0 if plte[:3] == b"\xff\xff\xff" else 1
    raw = zlib.decompress(b"".join(idat))
    stride = (width + 7) // 8
    prev, ones = bytes(stride), 0
    for r in range(height):
        start = r * (stride + 1)
        row = raw[start + 1 : start + 1 + stride]
        if raw[start]:
            row = unfilter(raw[start], row, prev, 1)
        prev = row
        bits = int.from_bytes(row, "big") >> (stride * 8 - width)
        ones += bits.bit_count()
    set_px = ones if white == 0 else width * height - ones
    return set_px / (width * height)


def check_heroes():
    """Every hero-meta entry needs both PNGs, and each set must look like a map:
    the CARTO raster source once started serving a placeholder for every tile,
    which thresholded to all-white heroes that every other check passed."""
    for meta_path, png_dir in HERO_SETS:
        if not os.path.exists(meta_path):
            continue
        coverage = {}
        for key in load(meta_path):
            for suffix in ("", "-m"):
                png = f"{png_dir}/hero-{key}{suffix}.png"
                if not os.path.exists(png):
                    fail(f"{png} is missing but listed in {meta_path}")
                coverage[png] = hero_coverage(png)
        if not coverage:
            continue
        bad = [p for p, c in coverage.items() if not BLANK_HERO_COVERAGE <= c <= FULL_HERO_COVERAGE]
        if len(bad) / len(coverage) > MAX_BLANK_HERO_SHARE:
            fail(f"{len(bad)}/{len(coverage)} {png_dir} heroes are blank or solid, e.g. {', '.join(bad[:3])}")
        med = statistics.median(coverage.values())
        if med < MIN_HERO_COVERAGE_MEDIAN:
            fail(f"median {png_dir} hero coverage {med:.2%} < {MIN_HERO_COVERAGE_MEDIAN:.0%} (map source broken?)")
        # An incremental bake only redraws changed crops, so a broken source
        # shows up as a few previously-good heroes going blank.
        went_blank = [p for p in changed_vs_head(png_dir) if p in coverage and p in bad and head_coverage(p) >= BLANK_HERO_COVERAGE]
        if went_blank:
            fail(f"{len(went_blank)} {png_dir} heroes went blank or solid vs HEAD, e.g. {', '.join(went_blank[:3])}")


def changed_vs_head(path):
    out = subprocess.run(["git", "diff", "--name-only", "HEAD", "--", path], capture_output=True, text=True, check=True)
    return out.stdout.split()


def head_coverage(path):
    """Coverage of the committed version; heroes new in this run count as blank."""
    old = subprocess.run(["git", "show", f"HEAD:{path}"], capture_output=True, check=False)
    return hero_coverage(path, old.stdout) if old.returncode == 0 else 0.0


def normalize_timestamp_only_diffs():
    """For each changed tracked JSON, if it differs from HEAD only in the
    top-level `generatedAt`, restore HEAD's version so it doesn't churn."""
    out = subprocess.run(
        ["git", "diff", "--name-only", "HEAD", "--", "data/linije", "data/stanice"],
        capture_output=True,
        text=True,
        check=True,
    )
    reverted = 0
    for path in out.stdout.split():
        if not path.endswith(".json"):
            continue
        try:
            new = load(path)
        except (ValueError, OSError):
            continue
        # Only the index files carry a top-level `generatedAt`; the ~1,400 leaf
        # files don't, so skip the per-file `git show` + parse for them entirely.
        if not isinstance(new, dict) or "generatedAt" not in new:
            continue
        try:
            head_raw = subprocess.run(
                ["git", "show", f"HEAD:{path}"],
                capture_output=True,
                text=True,
                check=True,
            ).stdout
            old = json.loads(head_raw)
        except (ValueError, OSError, subprocess.CalledProcessError):
            continue
        if isinstance(old, dict):
            a = {k: v for k, v in new.items() if k != "generatedAt"}
            b = {k: v for k, v in old.items() if k != "generatedAt"}
            if a == b:
                subprocess.run(["git", "checkout", "HEAD", "--", path], check=True)
                reverted += 1
    return reverted


def git_changed_count():
    out = subprocess.run(
        ["git", "status", "--porcelain", "--", "data", "public"],
        capture_output=True,
        text=True,
        check=True,
    )
    return len([ln for ln in out.stdout.splitlines() if ln.strip()])


if __name__ == "__main__":
    main()
