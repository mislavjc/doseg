# Doseg - Master plan for the most comprehensive Zagreb transit data source

## Current state (`/statistika` page)

The page already shows:

- District ranking (17 districts, score 0-100)
- Morning vs evening, weekday vs Saturday
- BAJS bike-share boost analysis, last-mile coverage, station density
- Transit deserts, Gini coefficient, nearest stop distance
- Route stats (speed, headway, departures, service hours)
- Travel matrix (17x17 district pairs)
- Transfer hubs, multimodal connections
- 24-hour accessibility profile (19 hourly Dijkstra passes per district)
- Pulse scheduling detection (transfer hub synchronization analysis)
- Live punctuality charts (avg delay + on-time % per route, from GTFS-RT)
- GTFS-RT coverage (RT signal vs scheduled trips, service-day filtered)
- Alert frequency analysis (auto-hides when no alerts)
- Delay propagation (per-stop delay staircase chart per route)

---

## Tier 1 - From existing data, new computations only

No new sources needed. Just smarter use of GTFS static feed + transit graph.


| #    | Feature                          | Description                                                                              | Status |
| ---- | -------------------------------- | ---------------------------------------------------------------------------------------- | ------ |
| 1.1  | Hourly frequency heatmap         | 24h × routes departure matrix (bin departures into hourly buckets)                       | [x]    |
| 1.2  | Headway regularity (CV)          | `stddev(headway)/mean(headway)` per route - clock-face vs chaotic                        | [x]    |
| 1.3  | Night service gap analysis       | Dijkstra at 23:00-23:30, which districts lose all transit                                | [x]    |
| 1.4  | Time-to-first-service map        | For each grid point, earliest possible departure. "When does your neighborhood wake up?" | [x]    |
| 1.5  | Vehicle-km/day by mode           | Tram: 28,744, Bus: 78,754 (total: 107,498)                                               | [x]    |
| 1.6  | Fleet size from block_id         | 478 blocks (181 tram, 297 bus)                                                            | [x]    |
| 1.7  | Interlining map                  | 90 blocks serve multiple routes - operational dependencies                               | [x]    |
| 1.8  | Route tortuosity                 | From OTP polyline geometry: ratio 1.01-1.79                                               | [x]    |
| 1.9  | Shape-accurate route distances   | Already done in route_stats.rs via OTP polyline geometry                                  | [x]    |
| 1.10 | Stop spacing stats               | Avg, min, max, CV of inter-stop distance per route                                       | [x]    |
| 1.11 | Weekend service ratio            | Saturday/Sunday/weekday trip counts per route. 16 weekday-only routes                    | [x]    |
| 1.12 | Seasonal variation               | School vs summer schedule differences (calendar_dates.txt)                               | [ ]    |
| 1.13 | Directional asymmetry            | Outbound/inbound ratio - 13 routes with >20% asymmetry                                  | [x]    |
| 1.14 | Transfer dependency distribution | "X% direct, Y% 1 transfer, Z% 2+" across all district pairs                              | [x]    |
| 1.15 | Dead-end stops                   | 1,405 stops with single route (1,333 bus, 25 tram, 47 rail)                              | [x]    |
| 1.16 | Betweenness centrality           | All-pairs Dijkstra (~107s Rust) reveals critical bottleneck stops                        | [x]    |
| 1.17 | Closeness centrality             | Which stops can reach the entire network fastest                                         | [x]    |
| 1.18 | Network diameter                 | Longest shortest path in the network                                                     | [x]    |
| 1.19 | Average path length              | Mean of all shortest paths - characterizes overall network quality                       | [x]    |
| 1.20 | Peak-to-base ratio               | How commuter-oriented vs all-day each route is                                           | [x]    |


## Tier 2 - Existing APIs/feeds already fetched but not analyzed


| #    | Feature                       | Description                                                              | Status |
| ---- | ----------------------------- | ------------------------------------------------------------------------ | ------ |
| 2.1  | Live punctuality              | From GTFS-RT delays: % on-time, avg delay per route                      | [x]    |
| 2.2  | Actual vs scheduled speed     | Vehicle positions give real speed; compare to commercialSpeedKmh         | [x]    |
| 2.3  | GTFS-RT coverage              | RT signal vs scheduled trips per route (service-day filtered)            | [x]    |
| 2.4  | Occupancy heatmap             | GTFS-RT occupancyStatus by route/time (if ZET sends it)                  | [x]    |
| 2.5  | Alert frequency analysis      | Which routes are disrupted most, cause breakdown                         | [x]    |
| 2.6  | BAJS first/last-mile coverage | "X% of transit stops within 350m of a BAJS station"                      | [x]    |
| 2.7  | BAJS station density          | Stations/km², per 10k residents per district                             | [x]    |
| 2.8  | BAJS snapshot utilization     | "X% of bikes currently in use", empty/full stations                      | [x]    |
| 2.9  | Delay propagation             | Delay by stop sequence - where does delay accumulate?                    | [x]    |
| 2.10 | Pulse scheduling detection    | Do routes synchronize at hubs or are transfers left to chance?           | [x]    |


## Tier 3 - New data sources (OSM, hardcoded reference, Overpass)


| #    | Feature                    | Description                                                                    | Status |
| ---- | -------------------------- | ------------------------------------------------------------------------------ | ------ |
| 3.1  | Hospital accessibility     | Min travel time to nearest hospital from every point (Overpass)                | [ ]    |
| 3.2  | School accessibility       | Same for schools and universities                                              | [ ]    |
| 3.3  | Food deserts               | Supermarket accessibility by transit - food desert analysis                    | [ ]    |
| 3.4  | Walkability score          | From walk graph: node density, dead-ends, avg degree per district              | [ ]    |
| 3.5  | Pedestrian circuity        | Network walk distance vs straight-line to stops - barrier effects              | [ ]    |
| 3.6  | Stop amenities (OSM)       | shelter, bench, lit, wheelchair tags - quality index per stop                  | [ ]    |
| 3.7  | European benchmarks        | Contextual annotations: "ZG tram speed: 14 km/h (EU avg: 16-19)"               | [ ]    |
| 3.8  | Fare equity                | Same EUR 1.33 ticket, but 7.4× less reach in Podsljeme vs Donji grad           | [ ]    |
| 3.9  | Mode cost comparison       | Transit EUR 0.06/km vs car EUR 0.39/km vs Bolt EUR 1.20/km                     | [ ]    |
| 3.10 | Monthly pass affordability | EUR 46.30 = 2.7% of avg salary (threshold: 5%)                                 | [ ]    |
| 3.11 | European fare comparison   | Zagreb EUR 46 vs Prague EUR 22 vs Berlin EUR 107                               | [ ]    |
| 3.12 | Fleet composition          | TMK 2200 (140), T4YU (85), KT4YU (51), TMK 2100 (15), GT6M (11), TMK 2400 (20) | [ ]    |
| 3.13 | Average fleet age          | ~28-30 years for trams, modern buses                                           | [ ]    |
| 3.14 | Low-floor percentage       | ~60% trams, 100% buses                                                         | [ ]    |
| 3.15 | Infrastructure km          | 116.3 km tram track / 1,524 km bus routes                                      | [ ]    |
| 3.16 | E-bus charging             | 124 chargers at Podsused depot, 70 e-buses ordered for 2026                    | [ ]    |
| 3.17 | HZPP accessibility         | 63% wheelchair-accessible, 57% bikes-allowed (ZET: zero data)                  | [ ]    |
| 3.18 | CO2 savings estimate       | Vehicle-km × emission factor per mode. Tram = 0 direct emissions               | [ ]    |
| 3.19 | Bike infrastructure (OSM)  | km of cycle lanes, bike parking near stops                                     | [ ]    |
| 3.20 | POI density in isochrones  | "154 restaurants, 23 pharmacies, 8 hospitals within 30 min"                    | [ ]    |


## Tier 4 - Infrastructure upgrades


| #   | Feature                       | Description                                                                | Status |
| --- | ----------------------------- | -------------------------------------------------------------------------- | ------ |
| 4.1 | GTFS-RT persistence (SQLite)  | Snapshot every 60s → enables ALL historical analyses                       | [x]    |
| 4.2 | 24-hour accessibility profile | 19 hourly Dijkstra passes (05-23h) from district centroids                 | [x]    |
| 4.3 | Network resilience            | "If Glavni kolodvor shuts down, avg travel time increases by X min"        | [ ]    |
| 4.4 | Animated vehicle map          | Real-time dots on MapLibre - the single most visually impressive feature   | [x]    |
| 4.5 | Census population grid        | DZS 2021 census by statistical circles - population-weighted accessibility | [ ]    |
| 4.6 | Historical trend tracking     | Monthly GTFS archive → service change trends over time                     | [ ]    |


## Visualizations


| #    | Visualization                                           | Data ready?   | Status |
| ---- | ------------------------------------------------------- | ------------- | ------ |
| V.1  | Animated live vehicle map (MapLibre + GTFS-RT)          | Yes           | [x]    |
| V.2  | Network map colored by metric (speed/headway/frequency) | Yes           | [ ]    |
| V.3  | Marey diagrams for tram lines                           | Yes           | [ ]    |
| V.4  | Small multiples (hourly departure histograms per route) | Yes           | [x]    |
| V.5  | Isochrone A/B comparison slider (morning vs night)      | Yes           | [ ]    |
| V.6  | District box plots (p25/median/p75 reachable cells)     | Yes           | [ ]    |
| V.7  | Radar chart for district comparison                     | Yes           | [ ]    |
| V.8  | Slope chart (weekday vs Saturday rank)                  | Yes           | [ ]    |
| V.9  | Frequency clock (polar 24h departure visualization)     | Yes           | [ ]    |
| V.10 | Speed heatmap along corridors                           | Yes (GTFS-RT) | [ ]    |


---

## Open data / Export


| #   | Feature                               | Status |
| --- | ------------------------------------- | ------ |
| E.1 | CSV/GeoJSON export of all statistics  | [ ]    |
| E.2 | API documentation page                | [ ]    |
| E.3 | Embeddable widgets (shareable charts) | [ ]    |
| E.4 | OG image per metric (social sharing)  | [x]    |


---

## Implementation notes

### No duplication between Rust and TypeScript

All new computation goes in Rust (`transit/src/`). The Rust `transit-scorer` binary already owns:
- District scoring (4-pass Dijkstra, walk expansion, BAJS) → `main.rs`
- Route stats (speed, headway, departures, hubs) → `route_stats.rs`
- Walk graph, OSM footprints, GTFS-RT, BAJS adjacency

The TS `scripts/compute-route-stats.ts` is a legacy duplicate of `route_stats.rs` - do not extend it.

TS scripts remain responsible for things Rust doesn't do:
- `build-walk-graph.ts` / `build-bike-graph.ts` - one-time graph compilation from OSM PBF
- `build-travel-matrix.ts` - OTP GraphQL queries for 17×17 district pairs
- `build-district-map-svg.ts` - SVG generation from scores

### Where new code goes

- **Tier 1 items 1.1-1.13, 1.15, 1.20** → new `transit/src/network_stats.rs` module, called from `main.rs` alongside `route_stats::compute_and_write()`. Reads from the same `TransitGraphJson`. Outputs `data/network-stats.json`.
- **Tier 1 items 1.6-1.7** (block_id, interlining) → needs raw GTFS `trips.txt` parsing. Add to `transit/src/network_stats.rs` with a GTFS zip reader (e.g. `zip` crate + csv parsing), or fetch block data via OTP GraphQL if available.
- **Tier 1 items 1.8-1.9** (shapes, tortuosity) → OTP polyline geometries are already in the transit graph (`geometry_encoded`). Extend `route_stats.rs`.
- **Tier 1 items 1.16-1.19** (centrality) → new `transit/src/centrality.rs`, heavy computation (~107s), separate CLI flag.
- **Tier 2 items** (live RT analytics) → extend `transit/src/isochrone_server.rs` with new endpoints, or add a new `/api/rt-stats` in Next.js that aggregates the cached GTFS-RT data.
- **Tier 3 items 3.7-3.17** (hardcoded reference data) → pure React components, no backend.

### Other notes

- **All Tier 1 items** use only existing GTFS data and transit graph - zero new APIs
- **Tier 2** uses GTFS-RT and BAJS GBFS feeds already being fetched
- **Tier 3** mixes OSM Overpass queries, hardcoded reference data, and public statistics
- **Tier 4** requires new system components (SQLite, census data, GTFS archive)
- Fare/infrastructure data (3.7-3.17) are hardcoded from public sources, not from GTFS

