# Doseg

Interactive transit reachability map for Zagreb. Click anywhere to see how far you can travel by tram, bus, and train in 15, 30, and 45 minutes — visualized as color-coded isochrone bands over the city map.

## Features

- **Isochrone map** — click any point to see reachable areas in 15/30/45 minutes, color-coded from green to purple
- **Multimodal routing** — ZET tram and bus schedules, HZ (Croatian Railways) train routes, and BAJS bike-sharing stations, all in one graph
- **Instant route preview** — hover (or tap on mobile) any destination to reconstruct the full route client-side, no extra network request
- **BAJS bike-sharing layer** — toggle bike-sharing stations on the map with real-time availability (bikes, docks, station status)
- **Departure time picker** — choose when you're leaving; isochrones and routes update accordingly
- **Live transit delays** — real-time delay data from ZET's GTFS-RT feed, shown per leg in route details
- **Walking-only comparison** — dashed ring overlay showing how far you get by walking alone, making it obvious where transit actually helps
- **Export as image** — download button renders the current map state as a shareable PNG
- **Elevation-aware walking** — SRTM elevation data factors into walking speed calculations for accurate isochrones in hilly areas
- **District statistics page** (`/statistika`) — precomputed city-wide transit analytics:
  - Neighbourhood tier list — every district ranked by 30-minute reachability score
  - Best/worst connected neighbourhoods with detailed metrics
  - Accessibility equity gap — what percentage of Zagreb's population lives in poorly-connected areas
  - Maximum city reach — what percentage of the city is reachable from the best-connected district
  - BAJS impact analysis — how bike-sharing improves each district's score, with equity assessment
  - Transit desert score — flags areas >500m from nearest stop or with <2 trips/hour
  - HZ train impact — per-district boost from adding railway access
  - Per-district tram/bus line breakdowns, stop counts, headway times
  - Transit Gini coefficient + Lorenz curve — inequality of transit access visualized
  - Population-weighted city score — single headline number for the average resident
  - Score vs density scatterplot — reveals equity failures in large suburban districts
  - "Tram is king" insight — tram line count as strongest predictor of connectivity
  - Frequency spectrum chart — every line sorted by peak headway
  - Internal inequality ranking — min/max reachability spread within each district
  - Downloadable open data — CSV/JSON export of all computed metrics
- **Onboarding dialog** — first-visit tutorial explaining isochrone bands and route preview
- **About page** (`/o-projektu`)

## How it works

1. You click a point on the map
2. The server runs Dijkstra over ZET tram/bus + HZ train schedules (via OpenTripPlanner) combined with an elevation-aware walking network and BAJS bike-sharing stations
3. The result is a set of isochrone lines showing reachable areas, bucketed by travel time
4. Hover (or tap on mobile) any destination to instantly reconstruct the full route — no extra network request needed, since the routing graph is shipped to the client

## Stack

- **Frontend:** Next.js, React, MapLibre GL, Tailwind, Motion
- **Transit data:** OpenTripPlanner with ZET GTFS + HZ (HZPP) GTFS feeds
- **Bike-sharing:** BAJS stations via GBFS API (nextbike), integrated into routing graph
- **Walking network:** Custom binary graph built from Croatia OSM extract (~422K nodes, CSR-encoded), with SRTM elevation
- **Infra:** Docker Compose (OTP + Next.js + Caddy reverse proxy)

## Development

```bash
bun install
npm run dev          # starts Next.js dev server
```

OTP needs to be running for the isochrone API to work:

```bash
docker compose up otp
```

Other commands:

```bash
npm run typecheck            # type-check without emitting
npm run format               # prettier
npm run codegen              # regenerate GraphQL types
npm run build:walk-graph     # rebuild walking graph from OSM PBF
```

## Production

```bash
docker compose up            # runs OTP, app, and Caddy
```

Caddy handles TLS, gzip/zstd compression, and security headers.

## Roadmap

Roughly ordered by how much sense they make next:

### Quick wins

- **Route commercial speed ranking** — all data exists in `TransitGraph.patterns`. Compute distance/time per pattern, render as sortable table on `/statistika`. Tram 13: 12.8 km/h. Bus 313: 46.5 km/h.

- **Share button** — copy current map URL (with lat/lon/time/bajs params) to clipboard. Toast confirmation.

- **Statistika static caching** — page is `force-dynamic` for no reason. Switch to ISR with `revalidate: 3600` for free CDN caching.

- **Arrival time in route details** — show "Dolazak: 14:32" alongside duration in the route panel.

- **Evening Gini display** — `eveningGini` is already computed but never rendered. Add it to the existing Gini section.

- **Caddy static asset cache headers** — no `Cache-Control` for `/_next/static/*` or SVGs. Add `immutable, max-age=31536000` for hashed assets.

- **BAJS station popups** — click a bike station dot → popup with station name, bikes available, docks available, last updated.

- **Onboarding copy fix** — dialog says "Pomakni miš" (move mouse) on touch devices. Detect touch and show "Dodirni za detalje rute" instead.

- **Train impact narrative** — 10 districts have train access but ALL show 0% reachability boost. Surface this as an insight on `/statistika`.

### Medium effort, high impact

- **Cross-district travel time matrix** — 17x17 heatmap showing travel time from district A to B at 08:00. `computeAvgTravelTimes()` + district `bestPoint` data already exist. Only needs ~289 OTP plan queries.

- **Dynamic OG images** — shared URLs with coordinates show a generic static image. Playwright capture infra exists; parameterize it to generate OG images per lat/lon/time on demand.

- **GTFS-RT vehicle positions** — the RT feed has ~281 vehicle positions per snapshot, completely ignored. Show live tram/bus dots on the map with bearing and speed.

- **GTFS-RT service alerts** — disruptions, cancellations, and detours sitting in the feed, never parsed. Show as a banner on affected routes.

- **POI overlay** — Overpass API for hospitals, schools, parks within isochrone. Turns abstract reachability into "what can I actually reach in 15 minutes?"

- **Auto-update GTFS** — no CI/CD, GTFS is manually fetched. Add GitHub Actions or systemd timer for weekly download + OTP graph rebuild + district score recomputation.

- **Weekend reachability collapse** — run the scoring pipeline against Saturday/Sunday GTFS schedules. Show "weekend penalty" per district. Some may lose 40-50% reach.

- **Network bottleneck analysis** — Crnomerec has 228 unique bridge connections; it's the sole link between the entire western bus network and trams. If it goes down, 22 bus routes lose tram access. Show the hub-and-spoke fragility.

- **"Last tram home" per district** — what time does transit effectively stop serving each district? Map colored by the latest departure that still gets you to Trg bana Jelacica.

- **Nearest hospital/school by transit** — "from Sesvete, 3 hospitals reachable in 30 min. From Donji grad, 15." Overpass API POIs + existing isochrone engine.

- **Multimodal hub map** — show the 63 multimodal stops, highlight the 5 critical bottlenecks. There is only 1 tram-rail interchange in all of Zagreb (Horvati). Zero 3-mode hubs.

- **Walk distance histogram** — not just "desert %", show the full cumulative distribution. Donji grad: 95% of residents within 200m of a stop. Brezovica: only 37% within 500m.

### Polish

- **Touch targets** — export button (36x36) and info button (29x29) are below the 44px minimum. Increase sizes.

- **Motion.js lazy-load** — 1.3MB bundle loaded eagerly. It's only needed on the map page; ensure it's fully code-split behind the existing `dynamic()` import.

- **OG image optimization** — `og.png` is 701KB unoptimized PNG. Convert to optimized WebP/JPEG, target <200KB.

- **Map container a11y** — add `role="application"` to the map `<div>` so screen readers understand it's interactive.

- **Route details `aria-expanded`** — the collapsible route panel has no ARIA state. Add `aria-expanded` to the toggle button.

- **API response compression** — isochrone endpoint uses Brotli but route and BAJS endpoints don't. Normalize compression across all API routes.

- **Isochrone cache duration** — currently 30 seconds. Increase to 5 minutes with `stale-while-revalidate` for repeat clicks near the same origin.

### Stats page — high effort, very high impact

- **"What if" line simulator** — draw a hypothetical new bus route, see how district scores change. Public participation gold. Requires route editor UI + re-scoring.

- **Line removal impact** — remove each line and re-score all districts. "Tram 11 removal drops 4 districts by >10 points." Reveals which infrastructure is most critical. Needs N re-computations.

- **Real-time reliability tracker** — accumulate GTFS-RT delays over weeks. "Tram 6 is late >5 min 23% of the time at Crnomerec." The RT feed already has 503 trip updates + 281 vehicle positions per snapshot.

- **Animated time-of-day slider** — watch the city "breathe": isochrone expanding at 06:00, steady at 08:00, shrinking at 23:00. Pre-compute ~20 hourly snapshots.

- **Cycling infrastructure coverage per district** — Zagreb Open Data has 2,889 cycling path segments with surface type and length. Show km of bike lanes per km² per district. Donji grad has dense cycling infra; Sesvete has almost none.

- **BAJS station placement optimizer** — identify locations where adding a new station would most improve district scores. "Put one station HERE, Podsused gains +8%." Iterative simulation using the scoring engine.

### Map features

- **Reverse isochrone** — flip the question from "where can I go?" to "where can people reach this point from?" Useful for evaluating how accessible a venue or workplace is.

- **"Where should we meet?"** — two people each pick their origin, the app computes both isochrones and highlights the overlap. The sweet spot (lowest combined travel time) becomes the suggested meeting area. Shareable URLs already support one origin — extend to encode both, so each person can share their starting point.

- **Animated expansion** — play button that sweeps from 0 to 45 minutes, watching the isochrone grow in real-time. Visually striking and makes the data more intuitive.

- **Commute evaluator** — pin your workplace, then explore commute times from any potential home. Reverse isochrone framed for apartment hunting.

- **"Rate my commute"** — enter home and work address, see transit options, compare to city average. Geocoding + OTP plan query + comparison to precomputed district scores.

### Platform

- **Embeddable widget** — lightweight iframe version that real estate listings, tourism sites, or city planning pages could drop in.

- **Multi-city** — the architecture generalizes. Load different GTFS + OSM data for Split, Rijeka, or other Croatian cities.
