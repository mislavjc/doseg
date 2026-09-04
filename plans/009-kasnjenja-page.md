# Plan 009: Ship /kasnjenja - a public reliability page on the existing GTFS-RT delay store

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 58b9341..HEAD -- app/kasnjenja app/sitemap.ts app/statistika/editorial/site-nav.tsx transit/src/rt_store.rs transit/src/isochrone_server.rs app/statistika/punctuality-section.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (frontend-only; all backend endpoints already live)
- **Depends on**: none
- **Category**: direction (feature)
- **Planned at**: commit `58b9341`, 2026-07-17

## Why this matters

The site already collects ZET GTFS-RT data every 30 seconds and persists
per-route delay aggregates to SQLite, with a full set of live query
endpoints. But the only consumers are legacy dashboard sections buried on
`/statistika/podaci`, styled in an older, off-system design. "Koja linija
najviše kasni" is one of the most asked questions about ZET and nobody
publishes real numbers. This plan ships a public, on-design-system page at
`/kasnjenja` (punctuality per line, delay trends, bunching) using ONLY
existing API endpoints - zero backend work.

## Current state

**Backend (all live, do not modify):**

- Collector: `transit/src/gtfs_rt.rs` fetches
  `https://www.zet.hr/gtfs-rt-protobuf` every 30s (`gtfs_rt.rs:12-13`);
  a writer thread persists to SQLite (`transit/src/rt_store.rs`).
- Schema (`rt_store.rs:64-146`): `snapshots` (per-route, 60s buckets:
  `avg_delay`, `max_delay`, `on_time_pct`, `trip_count`, `headway_sec`,
  `headway_cv`), `stop_delays` (per-stop every 5 min), `hourly_agg`
  (compacted, kept forever), `alerts`, `speed_snapshots`,
  `occupancy_snapshots`.
- On-time definition: -60s to +300s (TCQSM standard), `rt_store.rs:20-22`.
- Axum routes (registered around `isochrone_server.rs:3012-3027`):
  `/api/rt/history?route=&from=&to=`, `/api/rt/route-health?from=&to=`,
  `/api/rt/delay-profile?route=&from=&to=`, `/api/rt/alerts`,
  `/api/rt/alert-stats`, `/api/rt/occupancy?from=&to=&tz_offset=`,
  `/api/rt/speed-comparison`, `/api/rt/stops`, `/api/rt/summary`.
- The Next app proxies these already, `next.config.mjs` rewrites:

  ```js
  { source: "/api/rt/:path*",
    destination: `${process.env.ISOCHRONE_URL || "http://localhost:3002"}/api/rt/:path*` }
  ```

**Existing frontend consumers (pattern source, but OFF design system):**

- `app/statistika/punctuality-section.tsx` - "use client", useSWR against
  `/api/rt/history`, visx (`scaleLinear`, `scaleTime`, `Group`,
  `BarRounded`, `GridRows`), time ranges 24h/7d/30d, weighted bucket
  aggregation helper `aggregateBucket()` (lines ~55-85). Response shape
  (lines 18-33):

  ```ts
  interface HistoryPoint { ts: number; avgDelay: number; maxDelay: number;
    onTimePct: number; tripCount: number; headwaySec?: number; headwayCv?: number }
  interface HistoryResponse { route: string; from: number; to: number; points: HistoryPoint[] }
  ```

- `app/statistika/delay-propagation-section.tsx` - same pattern against
  `/api/rt/delay-profile`.
- IMPORTANT: these sections use the legacy slate/dark styling of the
  `/statistika/podaci` deep-dive family (see `plans/README.md`, "Findings
  recorded but not planned": that family is quarantined). Reuse their DATA
  logic (fetch shapes, aggregation helpers), never their markup or styles.

**Design system the new page MUST follow** (from `AGENTS.md`):

- Editorial kit: `app/statistika/editorial/primitives.tsx` exports
  `EditorialShell`, `Section` (article=620px / wide=840px columns),
  `Eyebrow`, `Hook`, `PageTitle`, `Body`, `BodyMuted`, `MonoLabel`,
  `MonoValue`, `Chip`, `Hairline`. Compose from these, never raw
  `<p className=...>`.
- Exactly two font sizes: `text-head`/`text-body` (16px Heros) and
  `text-label` (12px Geist Mono). Hierarchy via weight/color/space only.
- Color tokens only (`text-ink`, `bg-zg-blue`, `border-hairline`, ...);
  never hex/rgba in components. Charts use token-mirroring via CSS vars.
- Sharp corners everywhere (no border-radius; do NOT copy `BarRounded`
  rounding - use radius 0 or `Bar`). No all-caps. Croatian copy: "kvart"
  never "četvrt", no em-dashes, nominative stop names.
- Nav: `app/statistika/editorial/site-nav.tsx` `NAV_LINKS` array
  (lines 12-19), lowercase labels.
- Metadata: `lib/pseo-metadata.ts` `pseoMetadata({ title, description,
  path, ogType, ogImage })`.
- Sitemap: `app/sitemap.ts` static entries at lines 17-26, e.g.
  `{ url: "https://doseg.hr/promjene", lastModified: linesUpdated }`.
- Line index for route names/modes: `loadLineIndex()` from
  `lib/line-data.ts` (used by `app/sitemap.ts:8`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run lint` | exit 0 |
| Tests | `bun run test` | all pass |
| Dev server | `bun run dev`, then open `https://doseg.localhost/kasnjenja` | page renders |

Note: locally the `/api/rt/*` proxy needs the isochrone server on :3002
with an RT database. If it is not running, the page must still render its
server-side frame with client sections showing their loading/empty state -
that degradation path is part of the spec (Step 3).

## Scope

**In scope:**
- `app/kasnjenja/page.tsx` (create) + `app/kasnjenja/*.tsx` client sections (create)
- `app/sitemap.ts` (one line), `app/statistika/editorial/site-nav.tsx` (one NAV_LINKS entry)
- New test file(s) for pure helpers

**Out of scope (do NOT touch):**
- `transit/src/*` - no Rust changes; every metric on this page must come
  from an existing endpoint.
- `app/statistika/podaci/*` and the legacy sections - leave the quarantined
  family untouched; do not refactor it to share components.
- `/api/og` OG-image work beyond reusing an existing generic OG asset.

## Git workflow

- Branch: `advisor/009-kasnjenja-page`
- Conventional commits, e.g. `feat(kasnjenja): public reliability page on RT store`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Page skeleton + metadata + nav + sitemap

Create `app/kasnjenja/page.tsx` (server component): `EditorialShell` +
`SiteNav` + `Section` blocks with `PageTitle` "Kašnjenja ZET linija",
an `Eyebrow` like `uzivo · gtfs-rt`, and a short `Body` intro that states
the method honestly: podaci se mjere iz ZET-ovog GTFS-RT feeda svakih 30
sekundi; "točno" znači od 1 min ranije do 5 min kasnije (TCQSM standard).
Add metadata via `pseoMetadata({ path: "/kasnjenja", ogType: "website", ... })`.
Add `{ label: "kašnjenja", href: "/kasnjenja" }` to `NAV_LINKS` (before
"o projektu") and `{ url: "https://doseg.hr/kasnjenja", lastModified: linesUpdated }`
to `app/sitemap.ts`. URL stays ASCII (`/kasnjenja`), display copy keeps
diacritics.

**Verify**: `bun run typecheck` → exit 0; `bun run dev` →
`https://doseg.localhost/kasnjenja` renders title + nav; nav shows the new
link on other pages too.

### Step 2: Ranking section - "koje linije najviše kasne"

Create `app/kasnjenja/route-health.tsx` ("use client"): useSWR on
`/api/rt/route-health` (default window 24h; add a 24h/7d toggle by passing
`from`). Render a ranked table (top 10 worst by `on_time_pct`, plus top 10
best) using `MonoLabel`/`MonoValue` rows inside a `Section width="article"`;
line number chips should link to `/linije/[broj]` when the route exists in
`loadLineIndex()` (pass the index down from the server component as a prop -
client components cannot read files). Show on-time as a percentage with
decimal comma (Croatian locale), avg delay in minutes with one decimal.
Include a `headwayCv > 0.5` marker as a "bunching" flag with a short label
(`vozila u konvoju`). Empty/error state: one `BodyMuted` line, no spinner.

**Verify**: with the isochrone server running locally, the table shows real
rows; without it, the section renders the empty-state line. `bun run lint`
→ exit 0.

### Step 3: Per-line punctuality chart

Create `app/kasnjenja/line-history.tsx` ("use client"): route picker
(default the worst line from route-health, else "4"), time range 24h/7d/30d,
fetching `/api/rt/history?route=&from=&to=`. Port the data logic (types,
`aggregateBucket`, downsampling) from
`app/statistika/punctuality-section.tsx` but write NEW markup on the
editorial kit and NEW chart styling: visx with square bars (no
`BarRounded`), colors via CSS variables (`var(--zg-blue)`, `var(--ink-faint)`
etc. read through a small helper or inline `style` - never hex), 12px mono
axis labels. Chart shows avgDelay bars with an onTimePct line or secondary
row; pick the simpler encoding and keep one chart.

**Verify**: chart renders for at least two routes and all three ranges;
switching routes does not stack stale requests (useSWR keys include route +
range). `bun run typecheck` → exit 0.

### Step 4: Delay by time of day

Create `app/kasnjenja/by-hour.tsx`: fetch 7 days of `/api/rt/history` for
the selected line (or reuse the Step 3 data via a shared SWR key) and fold
points into 24 hour-of-day buckets (weighted by `tripCount`, local time -
reuse the folding as a pure exported helper so it is testable). Render a
compact 24-column bar strip: x = sat u danu, y = prosječno kašnjenje.

**Verify**: unit test on the folding helper (see Test plan); visual check in
dev.

### Step 5: Alerts context strip (small)

At the bottom, a `Section` fetching `/api/rt/alert-stats` (7 days): one
mono line per top cause/effect count ("N upozorenja u 7 dana - najčešće:
..."). Keep it to a few rows; skip entirely (render nothing) when the fetch
fails or returns zero.

**Verify**: renders rows locally with the server up; renders nothing (not an
error) with it down.

## Test plan

- `app/kasnjenja/fold.test.ts` (or colocated with the helper): 3 tests for
  the hour-of-day folding - (1) points spread across hours land in correct
  buckets, (2) weighting by tripCount, (3) empty input returns 24 zeroed or
  empty buckets without NaN.
- 1 test for the ranking sort/format helper if extracted (on-time formatting
  uses decimal comma).
- Model after the existing vitest files from plan 005
  (`git grep -l "from \"vitest\""`).
- Verification: `bun run test` → all pass including new tests.

## Done criteria

- [ ] `bun run typecheck`, `bun run lint`, `bun run test` exit 0
- [ ] `/kasnjenja` renders end-to-end in dev with the RT backend up, and
      degrades to labeled empty states with it down
- [ ] `grep -rn "#[0-9a-fA-F]\{3,8\}" app/kasnjenja/` returns no hardcoded
      colors; `grep -rn "rounded" app/kasnjenja/` returns nothing
- [ ] `grep -rn "četvrt\|—" app/kasnjenja/` returns nothing (kvart-only, no
      em-dashes)
- [ ] Nav + sitemap entries present; no files outside scope modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any needed endpoint (`/api/rt/route-health`, `/api/rt/history`,
  `/api/rt/alert-stats`) returns a shape different from the excerpts above
  (check with `curl "http://localhost:3002/api/rt/route-health" | head -c 400`).
- The metric story requires a query the endpoints cannot answer (e.g.
  per-corridor stats) - that is backend work belonging to a follow-up plan.
- You find yourself importing anything from `app/statistika/*-section.tsx`
  or `stat-shared.tsx` - copy logic, do not import the quarantined family.

## Maintenance notes

- Data depth grows over time: 30d views will look sparse until the store has
  30 days of history for a route. The copy should never promise more than
  the window returned.
- If plan 010 (bajs page) also ships, consider a shared tiny
  `useRtEndpoint()` SWR helper - do not preemptively abstract here.
- Follow-up candidates (explicitly deferred): worst-corridor analysis (needs
  a new endpoint over `stop_delays`), per-line delay sections embedded on
  `/linije/[broj]`, an OG card with a live on-time number.
