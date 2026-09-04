# Plan 012: Multi-city spike - verify Split/Rijeka feasibility and write the design doc

> **Executor instructions**: Follow this plan step by step. This is a
> RESEARCH AND DESIGN plan: its deliverable is a document plus small
> config-extraction groundwork, NOT a multi-city implementation. Run every
> verification command and confirm the expected result before moving on. If
> anything in the "STOP conditions" section occurs, stop and report. When
> done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 58b9341..HEAD -- transit/src/osm.rs transit/src/geo.rs transit/src/gtfs_rt.rs transit/src/main.rs data/build-config.json scripts/build-walk-graph.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M (spike) - the implementation it designs is L/XL and NOT part of this plan
- **Risk**: LOW (read-mostly; small config refactor)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `58b9341`, 2026-07-17

## Why this matters

`ROADMAP.md` lists multi-city ("Load different GTFS + OSM data for Split,
Rijeka... The architecture generalizes"). Before anyone builds that, three
things must be true: (1) usable GTFS feeds for Split and Rijeka actually
exist, (2) a URL/domain scheme is chosen (it shapes every pSEO family), and
(3) the Zagreb hardcoding is inventoried so the refactor is a checklist,
not archaeology. This spike settles all three and leaves a written design
the next plan can execute.

## Current state - the verified Zagreb hardcoding inventory

**Rust transit crate:**

- `transit/src/osm.rs:14-19` - the OSM filter bbox:

  ```rust
  const BBOX: Bbox = Bbox {
      min_lat: 45.7, max_lat: 45.92, min_lon: 15.75, max_lon: 16.2,
  };
  ```

- `transit/src/geo.rs:1-5` - precomputed constants:

  ```rust
  /// Precomputed geographic constants for Zagreb latitude (~45.8°N)
  pub const COS_LAT: f64 = 0.69716510293; // cos(45.8° x pi/180)
  pub const KM_PER_DEG_LAT: f64 = 111.32;
  pub const KM_PER_DEG_LON: f64 = 111.32 * COS_LAT; // ~77.43
  ```

  (Split is at 43.5°N - the flat-earth approximations need per-city COS_LAT.)
- `transit/src/gtfs_rt.rs:12` -
  `const ZET_RT_URL: &str = "https://www.zet.hr/gtfs-rt-protobuf";`
- `transit/src/isochrone_server.rs` - `zagreb_offset()` timezone helper
  (all three cities share CET/CEST, rename-only), plus routing constants
  (WALK_MAX_KM, BAJS_*) that are tuning, not blockers.
- `transit/src/main.rs` (~lines 42-60) - peak-window departure lists
  (MORNING_DEPARTURES / EVENING_DEPARTURES) and scoring thresholds, tuned
  for ZET.
- `data/build-config.json` - OTP inputs: `osm/zagreb.osm.pbf`,
  `gtfs/zet.zip`, `gtfs/hzpp-zagreb.zip` (structure is already city-shaped;
  values are Zagreb's).
- `scripts/build-walk-graph.ts` (~lines 62-84) - SRTM tiles hardcoded
  `["N45E015","N45E016"]` (Split needs N43E016; Rijeka N45E014+N45E015).

**Frontend / data:**

- `app/api/geocode/route.ts` - `ZAGREB_CENTER`, `ZAGREB_BBOX`, and a DGU
  WFS query scoped to Zagreb; `data/adrese.json` is the Zagreb DGU register
  only. Address data for Split/Rijeka is an open question (DGU is national,
  but the bake was Zagreb-scoped - verify coverage in the spike).
- `data/districts.geojson` - 17 Zagreb districts, no city field.
- `lib/constants.ts:1` - `SITE_DOMAIN = "doseg.hr"`;
  `app/layout.tsx` metadataBase; `app/sitemap.ts`/`app/robots.ts` hardcode
  `https://doseg.hr/...`; brand token `--zg-blue` in `app/globals.css`.
- pSEO slug collisions: `/linije/[broj]` - line "1" exists in every city;
  `/stanice/[slug]` name collisions across cities are certain.
- Single OTP instance (docker-compose, 3G limit, `-Xmx2048m` with a comment
  that 1024m OOMed on ZET's 143k-trip feed) - a second city's graph adds
  real memory on a 16GB host that also runs everything else.
- Deep single-city assumptions in copy: home hero draws the Zagreb boundary,
  editorial narratives say Zagreb/ZET throughout, `/kvartovi` prose is
  Zagreb-specific.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Rust check | `cd transit && cargo test && cargo clippy -- -D warnings` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Web research | WebSearch/WebFetch tools | sources cited in the doc |

## Scope

**In scope:**
- `docs/multi-city-design.md` (create - the main deliverable)
- Groundwork refactor ONLY in: `transit/src/osm.rs`, `transit/src/geo.rs`
  (introduce a `CityConfig`/constants module consumed by the existing code
  with Zagreb as the only instance - zero behavior change)
- `plans/README.md` status row

**Out of scope (do NOT touch):**
- Any actual second-city data, routes, pages, OTP config, domain setup.
- `main.rs` scoring windows, frontend copy, geocode route, slug scheme -
  these get DESIGNED in the doc, not changed.
- Renaming `--zg-blue` or any design-token churn.

## Git workflow

- Branch: `advisor/012-multi-city-spike`
- Conventional commits, e.g. `docs: multi-city design spike`,
  `refactor(transit): extract CityConfig (zagreb-only, no behavior change)`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Verify feed reality for Split and Rijeka

Research (WebSearch/WebFetch; cite URLs and access dates in the doc):

- Split: does Promet Split publish GTFS (check data.gov.hr, promet-split.hr,
  Mobility Database / mobilitydatabase.org, transitfeeds successors)? Feed
  freshness, license, shapes.txt present, stop coordinates quality,
  calendar depth. Any GTFS-RT?
- Rijeka: same questions for Autotrolej.
- Rail complement: HZPP feeds for the Split/Rijeka areas (the Zagreb build
  already uses `hzpp-zagreb.zip`).
- Address data: does the DGU WFS used by `scripts/build-adrese.ts` cover
  Split/Rijeka (national register - test a bbox query for each city and
  record row counts)?
- Bike share: does Nextbike GBFS `nextbike_hd/hr` include Split/Rijeka
  systems, or are they absent/other operators?

Record a verdict per city: GO / NO-GO / DEGRADED (e.g. "GO without RT and
without bike share"). If both are NO-GO, the doc says so and the plan ends
here - that is a valid, valuable outcome.

**Verify**: the doc's "Feed reality" section has a filled table with source
URLs, feed versions/dates, and shapes/RT/addresses columns for both cities.

### Step 2: Decide and justify the architecture in the doc

Write `docs/multi-city-design.md` covering, with a recommendation each (not
an options essay - pick one, justify in 2-3 sentences, note the runner-up):

1. **URL scheme**: recommend path-prefix (`doseg.hr/split/linije/3`) vs
   subdomain vs separate domain. Consider: pSEO families all gain a city
   segment; Zagreb keeps its existing URLs unprefixed (SEO equity - 842
   indexed pages must not move); slug collision resolution falls out of the
   scheme.
2. **Data layout**: `data/<city>/...` per-city trees vs suffixed files;
   which artifacts are per-city (all of `linije/ stanice/ kvart/ adrese
   districts scores heroes`) and which are shared.
3. **Runtime topology**: one OTP per city vs multi-feed single OTP;
   isochrone-server per city vs one process with per-city graphs; the 16GB
   host budget (current usage ~5G) with measured/estimated graph sizes for
   the smaller cities.
4. **Rust parameterization checklist**: every item from "Current state"
   above mapped to its fix (config file loaded at startup vs compile-time
   feature vs CLI flag) - recommend a `city.json` runtime config consumed
   by both bins.
5. **Frontend city context**: how pages learn their city (route segment ->
   layout param), what happens to the home page, nav, and Zagreb-specific
   editorial pages (they stay Zagreb-only initially).
6. **Scope of city v1**: recommend the minimum sellable slice (karta +
   linije + stanice for one new city; no kvartovi/statistika/adresa at
   first) and a phased plan with coarse effort estimates.
7. **Non-goals**: RT features for cities without RT feeds; district
   scorecards without district polygons; anything the Step 1 verdicts rule
   out.

**Verify**: doc exists, every numbered section has a single bolded
recommendation, and the Zagreb-URL-stability constraint is stated
explicitly.

### Step 3: Mechanical groundwork (safe, zero behavior change)

In the Rust crate only: introduce a small config struct/module (e.g.
`transit/src/city.rs`) holding bbox, cos_lat, and rt_feed_url with a
`zagreb()` constructor; change `osm.rs`, `geo.rs`, and `gtfs_rt.rs` call
sites to read from it (statically instantiated Zagreb - no runtime loading
yet, no CLI flag). The point is to turn the inventory into types so the
next plan plugs in values instead of hunting constants.

**Verify**: `cargo test`, `cargo clippy -- -D warnings`, `cargo fmt --check`
→ exit 0, and `cargo build --release` produces bins with unchanged behavior
(spot-check: run transit-scorer `--help` or the cheapest subcommand if the
local OTP stack is up; otherwise rely on tests and note it).

## Test plan

- No new product tests. The groundwork refactor must keep every existing
  Rust test green (`cargo test`).
- The design doc is reviewed by the maintainer - flag it for review in your
  final report.

## Done criteria

- [ ] `docs/multi-city-design.md` exists with: feed-reality table (cited),
      7 decided sections, per-city GO/NO-GO verdicts, phased v1 scope
- [ ] `cargo test` + clippy + fmt exit 0 after the groundwork refactor
- [ ] `grep -rn "45.92\|15.75" transit/src/osm.rs` shows the values now come
      from the city config (or the refactor was skipped per a STOP report)
- [ ] No frontend files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Web research cannot establish feed existence with confidence (paywalled,
  dead links, ambiguous portals) - write down what was found and mark the
  verdict UNKNOWN rather than guessing.
- The Rust groundwork refactor touches scoring behavior or any test fixture
  value - it must be provably behavior-neutral.
- You are tempted to start implementing a second city - that is the NEXT
  plan, gated on the maintainer approving this doc.

## Maintenance notes

- The design doc should be re-validated if more than ~6 months pass before
  implementation (feeds appear and die).
- When implementation starts, plan 008's promjene pipeline and plans
  009/010's RT pages are Zagreb-only by data availability; the doc's
  non-goals section should keep them out of city v1.
- The `--zg-blue` token rename question is deliberately deferred; revisit
  only when a second city actually ships a page.
