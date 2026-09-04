# Plan 010: Ship /bajs - live bike-share map plus per-station usage history

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 58b9341..HEAD -- app/bajs transit/src/rt_store.rs transit/src/isochrone_server.rs transit/src/otp.rs lib/bajs.ts app/api/bajs app/sitemap.ts app/statistika/editorial/site-nav.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L (Rust persistence + endpoints + new page)
- **Risk**: MED (schema addition to a production SQLite store)
- **Depends on**: none (009 first is nicer - it establishes the RT-page pattern)
- **Category**: direction (feature)
- **Planned at**: commit `58b9341`, 2026-07-17

## Why this matters

Bajs (Zagreb's Nextbike bike share) already powers isochrone routing and a
live gauge on address pages, and the backend already snapshots FLEET-level
usage. But there is no public page answering: where are the stations, which
are empty right now, which are the most used, and how does availability move
through the day. This plan adds per-station history persistence (the one
missing backend piece) and ships a public `/bajs` page on the editorial
design system.

## Current state

**GBFS ingestion exists twice (know both, touch only Rust):**

- TS adapter `lib/bajs.ts`: fetches
  `https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_hd/hr/station_information.json`
  and `station_status.json` (lines 3-5), TTL-cached `getBajsData()`,
  `buildBajsFeatureCollection()`. Served to clients by `app/api/bajs/route.ts`
  (GeoJSON + `updatedAt` + `ttl`).
- Rust: `transit/src/otp.rs:489` `fetch_station_status()` returns
  `Vec<GbfsStationStatus>`; `isochrone_server.rs:2409`
  `spawn_bajs_status_task()` polls every 60s (log line at
  `isochrone_server.rs:2974`: "BAJS station status polling started (60s
  interval)") and already writes a FLEET-level row per minute:

  ```rust
  // isochrone_server.rs:2440
  "INSERT OR REPLACE INTO bajs_usage (ts, bikes_in_use, available, known_fleet) VALUES (?1, ?2, ?3, ?4)",
  ```

- Existing table (`rt_store.rs:134-139`):

  ```sql
  CREATE TABLE IF NOT EXISTS bajs_usage (
      ts          INTEGER NOT NULL PRIMARY KEY,
      bikes_in_use INTEGER NOT NULL,
      available   INTEGER NOT NULL,
      known_fleet INTEGER NOT NULL
  ) WITHOUT ROWID;
  ```

- Existing endpoints (registered `isochrone_server.rs:3025-3026`):
  `/api/rt/bajs-utilization`, `/api/rt/bajs-usage-history` (handler at
  `isochrone_server.rs:2366`, query `rt_store.rs:1013` returns
  `[{ts, bikes_in_use, available, known_fleet}]`; note: check the exact
  serialized field casing in the `BajsUsagePoint` struct before writing TS
  types). The Next app proxies `/api/rt/*` via `next.config.mjs` rewrites.
- **The gap**: nothing stores per-station history, so "most used stations"
  and "empty-through-the-day" cannot be answered.

**Legacy frontend (pattern source only, OFF design system, do not import):**
`app/statistika/bajs-station-map.tsx` (MapLibre circles, red/yellow/green,
12px border-radius - violates the design system),
`app/statistika/bajs-usage-chart.tsx`, `bajs-utilization-section.tsx` -
part of the quarantined `/statistika/podaci` family.

**Design system + page conventions**: identical to plan 009's "Current
state" design-system block (editorial kit primitives, two font sizes, color
tokens only, sharp corners, kvart not četvrt, no em-dashes, `pseoMetadata`,
`NAV_LINKS`, sitemap entries). Read plan `plans/009-kasnjenja-page.md`
"Current state" if anything is unclear; it is the same contract.

**Rust conventions**: schema lives in the big `execute_batch` in
`RtDb::open()` (`rt_store.rs:64-146`) - `CREATE TABLE IF NOT EXISTS` makes
additions self-migrating. Retention/compaction happens in `RtDb::maintain()`
(`rt_store.rs:445-464`). ts-rs generated TS types land in `lib/generated/`
via `cargo test` - never hand-edit that directory.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Rust build | `cd transit && cargo build --release --bin isochrone-server` | exit 0 |
| Rust tests + ts-rs regen | `cd transit && cargo test` | all pass; `lib/generated/` updated |
| Rust lint | `cd transit && cargo clippy -- -D warnings` and `cargo fmt --check` | exit 0 (CI gates) |
| Typecheck | `bun run typecheck` | exit 0 |
| Lint / tests | `bun run lint` / `bun run test` | exit 0 / all pass |
| Local server | run isochrone-server with a scratch db dir | serves :3002 |

## Scope

**In scope:**
- `transit/src/rt_store.rs` (new table + queries + retention),
  `transit/src/isochrone_server.rs` (extend the bajs task + 2 new routes),
  `transit/src/otp.rs` ONLY if `GbfsStationStatus` lacks a needed field
- `app/bajs/**` (create), `app/sitemap.ts`, `app/statistika/editorial/site-nav.tsx`
- `lib/generated/*` (regenerated by cargo test only)

**Out of scope (do NOT touch):**
- `lib/bajs.ts`, `app/api/bajs/route.ts` - the live-map data path already
  works; reuse as-is.
- The legacy `app/statistika/bajs-*` sections and `/statistika/podaci`.
- `data/bajs-fleet.json` (gitignored seed file, unused by this plan).
- Isochrone routing logic (`transit/src/bajs.rs`).

## Git workflow

- Branch: `advisor/010-bajs-page`
- Conventional commits, e.g. `feat(bajs): per-station usage history + /bajs page`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Per-station hourly aggregates in Rust - DONE (18 Aug 2026)

Superseded and shipped. The turnover proxy below was dropped: the GBFS
`free_bike_status` feed lists every docked bike with an id that is stable
while docked, so departures and returns are counted exactly instead of being
inferred from `|delta bikes|`. See `transit/src/bajs_flow.rs` (diff logic plus
rebalancing and stalled-poll handling) and the `bajs_flow_minute`,
`bajs_station_hourly`, `bajs_trip` tables in `rt_store.rs`. Rank stations by
`starts`, not by turnover.

Note for the page: `bajs_usage.bikes_in_use` and `known_fleet` remain
inferences and must never be labeled as ride counts or fleet size. Only
`available`, and the new `starts` / `returns`, are measurements.

<details>
<summary>Original (superseded) Step 1</summary>

```sql
CREATE TABLE IF NOT EXISTS bajs_station_hourly (
    hour_ts     INTEGER NOT NULL,
    station_id  TEXT    NOT NULL,
    avg_bikes   REAL    NOT NULL,
    min_bikes   INTEGER NOT NULL,
    max_bikes   INTEGER NOT NULL,
    turnover    INTEGER NOT NULL,  -- sum of |delta bikes| between polls; proxy for usage
    empty_polls INTEGER NOT NULL,  -- polls with 0 bikes
    samples     INTEGER NOT NULL,
    PRIMARY KEY (hour_ts, station_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_bajs_station_hour ON bajs_station_hourly(station_id, hour_ts);
```

In `spawn_bajs_status_task()` (`isochrone_server.rs:2409`), keep an
in-memory accumulator (HashMap keyed by station_id holding prev_bikes and
the running hour aggregates). On each 60s poll, update it; when the hour
rolls over, flush one `INSERT OR REPLACE` batch per station into
`bajs_station_hourly` inside the existing `config.db_conn` lock (follow the
existing lock/err handling style at `isochrone_server.rs:2431-2448`).
Volume check: ~300 stations x 24 rows/day = ~7.2k rows/day; add retention in
`RtDb::maintain()` deleting rows older than 1 year (mirror the existing
DELETE patterns at `rt_store.rs:445-464`).

**Verify**: `cargo build --release` + `cargo test` + `cargo clippy -- -D warnings`
→ exit 0. Run the server locally against a scratch db for >2 minutes; then
`sqlite3 <scratch>/gtfs-rt.db ".schema bajs_station_hourly"` shows the table
(rows appear only after an hour boundary - do not wait for that; unit-test
the accumulator flush instead, see Test plan).

### Step 2: Two new endpoints - DONE (21 Aug 2026)

Shipped as `/api/rt/bajs-rides?days=` and
`/api/rt/bajs-station-ranking?days=&limit=`, both `max-age=300`.
`query_bajs_station_day` was not needed: the page wants network totals, not one
station's day, so `rt_store::query_bajs_hourly_totals` (hour buckets with an
observed-minute count) plus `query_bajs_measured_span` cover it. Zagreb-local
day/hour folding happens in `fold_bajs_rides` in `isochrone_server.rs`, unit
tested for the DST offset and for hours too sparsely observed to average.
ts-rs types are in `lib/generated/Bajs*.ts`; i64 counts are declared as i32 so
the generated TS says `number`, not `bigint`.

<details>
<summary>Original Step 2</summary>

`query_bajs_station_ranking(conn, from, to)` and `query_bajs_flow(conn, from,
to, max_gap_sec)` already exist in `rt_store.rs` (ranking is by measured
`starts`, and the flow query drops intervals where polling stalled). Still to
do: `query_bajs_station_day(conn, station_id, from, to)` (hourly rows for
one station). In `isochrone_server.rs` add handlers + routes next to the
existing bajs routes (`:3025-3026`):
`/api/rt/bajs-station-ranking?from=&to=` and
`/api/rt/bajs-station-history?station=&from=&to=`, with
`Cache-Control: public, max-age=300`, matching the response/err style of
`handle_bajs_usage_history` (`isochrone_server.rs:2366-2395`). Derive
serde + ts-rs on the new response structs like the neighboring ones so
`cargo test` exports TS types.

**Verify**: `cargo test` → pass and new types appear in `lib/generated/`;
`curl "localhost:3002/api/rt/bajs-station-ranking"` → `200` with `[]` (empty
db) not an error.

</details>

### Step 3: /bajs page skeleton + live map

Create `app/bajs/page.tsx` (server): editorial shell, `PageTitle`
"Bajs - javni bicikli u Zagrebu", honest intro (podaci uživo iz javnog
GBFS feeda; povijest korištenja mjeri se od trenutka uključenja). Metadata
via `pseoMetadata({ path: "/bajs", ogType: "website", ... })`. Add
`{ label: "bajs", href: "/bajs" }` to `NAV_LINKS` and a sitemap entry
(match `app/sitemap.ts:17-26` pattern).

Create `app/bajs/station-map.tsx` ("use client", dynamic import with
`ssr: false` from page): MapLibre map fetching `/api/bajs` with SWR
(`refreshInterval: 60_000`). Style ON SYSTEM: white ground, stations as
sharp-cornered or plain circle dots colored by availability through CSS
variable-derived colors (read `--zg-blue`, `--ink-faint`, etc. from
`getComputedStyle(document.documentElement)` once - never hex), no
border-radius on the container, legend in 12px mono. Model the MapLibre
lifecycle (init/source/layer/cleanup) on
`app/statistika/bajs-station-map.tsx:14-43` but write fresh markup; also
look at `app/promjene/diff-map.tsx` for the current on-system map component
conventions (cooperative scroll, controls).

**Verify**: `bun run dev` → `/bajs` renders map with live stations;
`grep -rn "rounded\|#[0-9a-fA-F]\{3,8\}" app/bajs/` → no matches.

### Steps 3 + 4 - DONE (21 Aug 2026)

`app/bajs/page.tsx` composes the editorial kit: intro with the measured
rides-per-day headline, live map (`station-map.tsx`, MapLibre, dots sized by
capacity and hollow when empty, colours read from the CSS tokens at runtime),
then `Dani`, `Ritam`, `Kicker`, `Stanice`, `Metodologija` in
`app/bajs/sections.tsx`. Data comes from `lib/bajs-rides.ts`; every reader
returns null instead of throwing, so the page degrades to the live map alone
when the RT server is down.

The page follows the Paper board "Bajs v4 · B — reljef prvi", not the generic
editorial layout: full-bleed dithered map of the whole service area with live
station marks and a mono status strip that doubles as the legend, stat row plus
fleet balance bar (`Ravnoteza`), the two-sided
`Odstupanje` table (surplus right of the axis, emptiness left, kvart from
`lib/district-at.ts`), the `Reljef` 3D kvart terrain, vertical
hour columns with a blue peak callout, prose kicker, gated ranking, and a
`Zakljucak` closing on the blue one-liner.

The hero is the dither *and* interactive, and it replaces the shared `Hero` band
rather than sitting under it: `app/bajs/hero.tsx` is the header, with `SiteNav`
riding on the map, so the page opens on one map instead of two stacked dithers.
This is the only page that opts out of the site-wide band.

The ground is our own fabric, not a vendor basemap.
`scripts/build-bajs-tiles.ts` bakes an XYZ pyramid of the blue-on-white
figure-ground over the service area through `createDitherCropper().buildTilePyramid`
into `public/bajs-tiles/{z}/{x}/{y}.png` (z11-z15, 512 px tiles filling a 256
slot for 2x, ~1130 tiles / 7 MB) and writes `data/bajs-tiles.json` with the
bounds the map is allowed to roam. `app/bajs/hero-map.tsx` is a MapLibre map
whose only source is that pyramid, so zooming in stays inside the site's
cartography instead of dissolving into somebody else's. Re-run the script when
the network grows past the frame; existing tiles are skipped, so extending the
box only bakes what is new. `scripts/build-bajs-hero.ts` survives only to bake
`public/bajs-hero.png`, the band's backdrop while the map boots and all a reader
without JavaScript gets — nothing is projected onto it, so it carries no bounds
file and no per-breakpoint crop.

Two MapLibre traps, both hit: a `zoom` expression is only honoured as the
outermost one, so `["*", interpolateByZoom, 0.6]` silently drops the layer; and
`feature-state` is paint-time only, so an `icon-image` that reads it never
renders at all — hover on the symbol marks runs through a filtered twin layer
instead (`station-icon-hover`).

Stations are **needles** (`app/bajs/station-marks.ts`): a stem standing on the
coordinate, a foot dot marking the exact spot, and a head on top that is solid
when bikes are waiting and hollow when the stand is empty. The point is to
separate *where* from *what*: a disc centred on the station makes its location a
20 px fuzz, and at 188 stations the earlier ring-and-core read as a field of
donuts. Head size ramps mildly with bikes. The `dot` and `pin` candidates that
lost the comparison are gone — bring them back from git history if the mark is
ever reopened rather than carrying dead branches.

`Reljef` is a 3D terrain of Zagreb, not the joyplot it started as. The
ridgeline (`lib/bajs-reljef.ts`, deleted) drew sixteen smeared latitude bands
and Mislav's objection was exact: it was not shaped like Zagreb. It now reuses
`app/statistika/editorial/terrain-view.tsx` — the same three.js iso-extrusion of
`public/district-map.svg` that /statistika uses — driven by rides instead of
connectivity. `TerrainView` gained an optional `values` prop (per-kvart 0–100,
read through a ref at build time so a caller's fresh object literal cannot
rebuild the scene) and `ariaLabel`; with neither passed it behaves exactly as
before, so /statistika is untouched. `lib/bajs-terrain.ts` folds stations into
kvartovi through `districtAt` and normalises against the busiest one, so both
pages speak the one `scoreColor` ramp. `app/bajs/kvart-terrain.tsx` is the
client half: terrain, hover readout, summary, and the ranked kvart list,
hover-linked both ways.

The summary beside that terrain deliberately carries no city-wide ride total or
station count. Both exist elsewhere on the page from a different aggregation
(9.479 vs the hero's headline, 197 measured stations vs 188 live), and two
slightly different answers to the same question read as a bug.

The map uses `cooperativeGestures`, because a full-bleed map at the top of a
long editorial page must not eat the scroll wheel. Control chrome is
de-rounded per-page in `globals.css` (`.bajs-hero-map`), since the app-wide
MapLibre overrides are `!important` and rounded.

`/bajs` renders per request rather than on a revalidate timer, because the
surplus table reads live GBFS through `getBajsData()` and that fetch is
`no-store`. Noted in `page.tsx`.

Two things that differ from the original sketch:

- The fleet-usage chart over `/api/rt/bajs-usage-history` was dropped.
  `bikes_in_use` is inferred from a rolling 24 h maximum, and putting it beside
  counted rides on the same page invites reading it as a ride count.
- The station ranking is gated behind `RANKING_MIN_DAYS = 14` and renders a
  labelled accumulating state below that. It first becomes publishable around
  1 Sep 2026.

Station names arrive from GBFS in caps. `lib/bajs-station-name.ts` is now the
single caser for the whole app (`lib/bajs.ts` delegates to it; its local
`unshout` is gone), and it lowercases Croatian appellatives, so
"TRG KRALJA TOMISLAVA" reads "Trg kralja Tomislava".

<details>
<summary>Original Step 4</summary>

- `app/bajs/fleet-usage.tsx`: chart over `/api/rt/bajs-usage-history`
  (bikes_in_use over 24h/7d), square-bar visx chart per plan 009's chart
  conventions.
- `app/bajs/station-ranking.tsx`: table over `/api/rt/bajs-station-ranking`
  (7d window): najkorišteniji Bajs (top 10 by turnover) and najčešće prazni
  (top empty share), mono rows, each station row shows name + short trend
  figure. Empty state copy must say data is still accumulating ("podaci se
  skupljaju od ..."), because the table is empty until Step 1 has run in
  production for a while.

**Verify**: sections render with server up; labeled empty states with it
down or with an empty db. `bun run typecheck && bun run lint && bun run test`
→ exit 0.

</details>

## Test plan

- Rust: unit tests in `rt_store.rs` (follow existing `#[cfg(test)]` tests
  there if present; else add a test module) - (1) accumulator flush writes
  correct avg/min/max/turnover for a synthetic poll sequence, (2)
  `query_bajs_station_ranking` orders by turnover and computes empty share,
  (3) retention deletes >1yr rows. Use an in-memory SQLite connection.
- TS: one test for any pure formatting/folding helper the sections extract.
- Verification: `cd transit && cargo test` and `bun run test` → all pass.

## Done criteria

- [ ] `cargo test`, `cargo clippy -- -D warnings`, `cargo fmt --check` exit 0
- [ ] `bun run typecheck`, `bun run lint`, `bun run test` exit 0
- [ ] New endpoints return 200 + `[]` on an empty scratch db
- [ ] `/bajs` renders: live map, fleet chart, ranking (or its accumulating
      empty state); nav + sitemap updated
- [ ] No hex colors, no border-radius, no em-dashes, no "četvrt" under `app/bajs/`
- [ ] `lib/generated/` changes come only from `cargo test`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `GbfsStationStatus` in `transit/src/otp.rs` lacks `station_id` or
  bikes-available fields needed for the accumulator (check the struct at
  `otp.rs:419` area first) - report before editing otp.rs.
- The existing bajs task's locking structure makes an hourly flush unsafe
  without restructuring (`config.db_conn` is a `Mutex` shared with the RT
  writer - if contention/design questions arise, report).
- The production db is used for local testing - never point a dev server at
  `data/gtfs-rt.db`; use a scratch directory.
- Any step needs changes to `lib/bajs.ts` response shapes (address-page
  consumers depend on them).

## Maintenance notes

- The ranking is only as old as the deploy; consider announcing the metric
  publicly only after ~2 weeks of accumulation.
- The daily R2 backup workflow already covers `gtfs-rt.db`, so the new table
  is backed up for free.
- Deferred follow-ups: per-station detail pages (`/bajs/[station]`),
  rebalancing detection (large step drops = truck moves), linking station
  dots from `/karta` and address pages to `/bajs`.
