# Doseg

Interactive transit reachability map for Zagreb. Click anywhere to see how far you can travel by tram, bus, and train in 15, 30, and 45 minutes, visualized as color-coded isochrone bands over the city map.

## Architecture

```
                  Cloudflare (CDN + DNS)
                         │
                       Caddy (TLS, compression, security headers)
                      ╱      ╲
               Next.js         Rust isochrone service
            (SSR + APIs)           (axum, port 3001)
                │                       │
                └───── OpenTripPlanner ──┘
                       (GTFS routing)
```

**Caddy** terminates TLS, applies gzip/zstd compression, sets security headers, and routes `/api/isochrone` directly to the Rust service. Everything else goes to Next.js.

**Next.js** handles SSR, the statistics page, OG image generation, GTFS-RT vehicle positions/alerts, and all client-side map interactions (MapLibre GL).

**Rust isochrone service** (`transit/src/isochrone_server.rs`) is the hot path. It computes isochrones and routing graphs for every map click. On startup it fetches the full transit graph from OTP, loads the binary walking graph (~422K nodes, CSR-encoded with SRTM elevation), builds BAJS bike-sharing adjacency, and starts a GTFS-RT background refresh loop.

**OpenTripPlanner** builds and serves the transit routing graph from ZET (tram/bus) and HZPP (train) GTFS feeds.

### Rust isochrone service

The isochrone endpoint runs Dijkstra over the transit graph (patterns, stops, departures), then expands reachable stops onto the walking graph to generate GeoJSON features bucketed by travel time. It also returns a routing payload (predecessor graph) so the client can reconstruct full routes without additional network requests.

Performance (single-core, release build with LTO):
- **69ms** median single request (Dijkstra + walk expansion + GeoJSON generation + serialization)
- **41 req/s** sustained at 100 concurrent connections
- Previous Node.js implementation: 244ms / 9 req/s

Key design decisions:
- **Coordinate snapping**: origin lat/lon snapped to 3 decimal places (~100m), departure time to 5-minute intervals. This collapses nearby requests into identical cache keys for Cloudflare CDN hits.
- **ts-rs type generation**: response types are defined once in Rust with `#[derive(TS)]` and exported to `lib/generated/*.ts`. The TypeScript frontend imports these directly, so the API contract is enforced at compile time on both sides.
- **GTFS-RT realtime delays**: a background task fetches ZET's protobuf feed every 30 seconds. The Dijkstra loop applies per-stop delay adjustments from the latest snapshot, and the response includes a `realtime` flag so the UI can indicate live data.
- **RT persistence**: every 60 seconds, route-level delay aggregates are written to a SQLite database (WAL mode, separate writer thread). Stop-level delays are sampled every 5 minutes. Data is kept for 1 year raw, then compacted to hourly aggregates. Query endpoints (`/api/rt/history`, `/api/rt/stops`, `/api/rt/alerts`, `/api/rt/summary`) serve historical data. Daily backups to Cloudflare R2 via GitHub Actions.
- **BAJS bike-sharing**: idealized station availability (1 bike, 1 dock always present) integrated into the routing graph as walk + bike edges.

### Rust scoring CLI

A separate binary (`transit-scorer`) runs 4 scoring passes across all 17 districts (bus+tram, +train, +BAJS, evening off-peak) using parallel Dijkstra via rayon. Outputs `data/district-scores.json` consumed by the `/statistika` page.

## Features

- **Isochrone map**: click any point to see reachable areas in 15/30/45 minutes, color-coded from green to purple
- **Multimodal routing**: ZET tram and bus schedules, HZ (Croatian Railways) train routes, and BAJS bike-sharing stations, all in one graph
- **Instant route preview**: hover (or tap on mobile) any destination to reconstruct the full route client-side, no extra network request
- **BAJS bike-sharing layer**: toggle bike-sharing stations on the map with real-time availability (bikes, docks, station status)
- **Departure time picker**: choose when you're leaving; isochrones and routes update accordingly
- **Live transit delays**: real-time delay data from ZET's GTFS-RT feed, shown per leg in route details
- **Live vehicle positions**: toggle to show real-time tram/bus dots with line numbers on the map, refreshed every 30 seconds from GTFS-RT
- **Service alerts**: GTFS-RT disruptions and cancellations shown as a dismissible banner
- **POI overlay**: toggle hospitals, schools, parks, and pharmacies on the map (via Overpass API), with colored letter badges and name labels at higher zoom
- **Walking-only comparison**: dashed ring overlay showing how far you get by walking alone, making it obvious where transit actually helps
- **Share link**: copy current map state URL to clipboard
- **Export as image**: download button renders the current map state as a shareable PNG
- **Dynamic OG images**: shared URLs generate per-coordinate Open Graph images with district name and score
- **Elevation-aware walking**: SRTM elevation data factors into walking speed calculations for accurate isochrones in hilly areas
- **District statistics page** (`/statistika`): precomputed city-wide transit analytics:
  - Neighbourhood tier list: every district ranked by 30-minute reachability score
  - Best/worst connected neighbourhoods with detailed metrics
  - Accessibility equity gap: what percentage of Zagreb's population lives in poorly-connected areas
  - Maximum city reach: what percentage of the city is reachable from the best-connected district
  - BAJS impact analysis: how bike-sharing improves each district's score, with equity assessment
  - Transit desert score: flags areas >500m from nearest stop or with <2 trips/hour
  - HZ train impact: per-district boost from adding railway access
  - Per-district tram/bus line breakdowns, stop counts, headway times
  - Transit Gini coefficient + Lorenz curve: inequality of transit access visualized
  - Population-weighted city score: single headline number for the average resident
  - Score vs density scatterplot: reveals equity failures in large suburban districts
  - "Tram is king" insight: tram line count as strongest predictor of connectivity
  - Frequency spectrum chart: every line sorted by peak headway
  - Internal inequality ranking: min/max reachability spread within each district
  - Downloadable open data: CSV/JSON export of all computed metrics
  - Route commercial speed ranking: mode speed comparison with frequency analysis
  - Walk distance to nearest stop: bar chart per district with 400m comfort threshold
  - Train impact narrative: why 10 districts with rail access see 0% reachability boost
  - Cross-district travel matrix: 17x17 heatmap of travel times between all districts, color-coded with transfer counts
  - Weekend reachability collapse: weekday vs Saturday comparison showing per-district penalty with population-weighted city average
  - Route statistics: per-route distance, stops, daily departures, and commercial speed for all 201 lines
  - Transfer hub ranking: top hubs by route count with multimodal breakdown (tram/bus/rail stacked bars)
  - Route length charts: bar charts comparing all tram, bus, and rail routes by distance
- **Onboarding dialog**: first-visit tutorial explaining isochrone bands and route preview
- **About page** (`/o-projektu`)

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, MapLibre GL, Tailwind 4, Motion |
| Isochrone service | Rust, axum, tokio, rayon, ts-rs, prost (protobuf), rusqlite |
| Transit routing | OpenTripPlanner 2.9 with ZET + HZPP GTFS feeds |
| Realtime | ZET GTFS-RT protobuf feed (trip updates + vehicle positions) |
| Bike-sharing | BAJS/nextbike via GBFS API |
| Walking network | Custom binary graph from Croatia OSM extract (~422K nodes, CSR-encoded), SRTM elevation |
| Reverse proxy | Caddy 2 (TLS, compression, security headers, path-based routing) |
| CDN | Cloudflare (coordinate-snapped cache keys) |
| Containers | Docker Compose (4 services: OTP, isochrone, app, Caddy) |
| RT history DB | SQLite (WAL mode), daily backups to Cloudflare R2 |
| CI/CD | GitHub Actions: auto-deploy on push, weekly GTFS data updates, daily RT DB backup |

## Development

### Prerequisites

- [bun](https://bun.sh/) (package manager + runtime)
- [Rust](https://rustup.rs/) (isochrone server)
- [Docker](https://docs.docker.com/get-docker/) (for OTP, or full-stack local)
- [mprocs](https://github.com/pvolok/mprocs) (optional, runs all processes in one terminal)
- [portless](https://github.com/nicholasgasior/portless) (optional, gives `doseg.localhost:1355` instead of `localhost:3000`)

### Quick start

```bash
./scripts/setup-dev.sh
```

This installs dependencies, downloads data files (walk graph, GTFS), and builds the Rust isochrone server. If you have SSH access to the production server (`netcup`), it downloads pre-built data; otherwise it builds from source.

Then start everything:

```bash
mprocs
```

This starts 3 processes: SSH tunnel to OTP on the server, Rust isochrone service, and Next.js dev server.

### Without SSH access to the server

If you don't have SSH access, run OTP locally:

```bash
docker compose up -d otp                   # starts OTP, builds graph (~2 min first time)
docker compose exec otp wget -qO- http://localhost:8080/otp/  # verify it's ready

# In separate terminals:
OTP_URL=http://localhost:8080 DATA_DIR=data PORT=3002 cargo run --release --bin isochrone-server --manifest-path transit/Cargo.toml
bun dev
```

### Other commands

```bash
bun run typecheck              # type-check without emitting
bun run format                 # prettier
cargo test --manifest-path transit/Cargo.toml  # rust tests
bun run build:walk-graph       # rebuild walking graph from OSM PBF
bun run build:bike-graph       # rebuild bike-sharing graph
```

## Production

```bash
docker compose up
```

This starts 4 services: OTP (builds transit graph on first run), the Rust isochrone server, Next.js, and Caddy. Resource limits are set per service (OTP 1GB, isochrone 512MB, app 768MB, Caddy 256MB).

Pushing to `main` triggers automatic deployment via GitHub Actions (SSH to server, pull, rebuild containers, health check).

## Roadmap

Roughly ordered by how much sense they make next:

### Medium effort

- **Nearest hospital/school by transit**: "from Sesvete, 3 hospitals reachable in 30 min." POI library exists (`lib/overpass.ts`), needs integration with isochrone engine.

- **Network bottleneck analysis**: Crnomerec has 228 unique bridge connections; it's the sole link between the entire western bus network and trams. If it goes down, 22 bus routes lose tram access. Show the hub-and-spoke fragility.

- **"Last tram home" per district**: what time does transit effectively stop serving each district? Map colored by the latest departure that still gets you to Trg bana Jelacica.

- **Multimodal hub map**: show the 63 multimodal stops, highlight the 5 critical bottlenecks. There is only 1 tram-rail interchange in all of Zagreb (Horvati). Zero 3-mode hubs.

### High effort, very high impact

- **"What if" line simulator**: draw a hypothetical new bus route, see how district scores change. Public participation gold. Requires route editor UI + re-scoring.

- **Line removal impact**: remove each line and re-score all districts. "Tram 11 removal drops 4 districts by >10 points." Reveals which infrastructure is most critical. Needs N re-computations.

- **Real-time reliability tracker**: RT data is now being persisted to SQLite (route-level every 60s, stop-level every 5 min). Query endpoints are live. Next: build frontend dashboards showing punctuality trends, delay corridors, and fleet deployment over time.

- **Animated time-of-day slider**: watch the city "breathe": isochrone expanding at 06:00, steady at 08:00, shrinking at 23:00. Pre-compute ~20 hourly snapshots.

- **Cycling infrastructure coverage per district**: Zagreb Open Data has 2,889 cycling path segments with surface type and length. Show km of bike lanes per km² per district. Donji grad has dense cycling infra; Sesvete has almost none.

- **BAJS station placement optimizer**: identify locations where adding a new station would most improve district scores. "Put one station HERE, Podsused gains +8%." Iterative simulation using the scoring engine.

### Map features

- **Reverse isochrone**: flip the question from "where can I go?" to "where can people reach this point from?" Useful for evaluating how accessible a venue or workplace is.

- **"Where should we meet?"**. Two people each pick their origin, the app computes both isochrones and highlights the overlap. The sweet spot (lowest combined travel time) becomes the suggested meeting area. Shareable URLs already support one origin; extend to encode both, so each person can share their starting point.

- **Animated expansion**. Play button that sweeps from 0 to 45 minutes, watching the isochrone grow in real-time. Visually striking and makes the data more intuitive.

- **Commute evaluator**. Pin your workplace, then explore commute times from any potential home. Reverse isochrone framed for apartment hunting.

- **"Rate my commute"**. Enter home and work address, see transit options, compare to city average. Geocoding + OTP plan query + comparison to precomputed district scores.

### Platform

- **Embeddable widget**. Lightweight iframe version that real estate listings, tourism sites, or city planning pages could drop in.

- **Multi-city**. The architecture generalizes. Load different GTFS + OSM data for Split, Rijeka, or other Croatian cities.
