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

### Stats page

- **Peak vs off-peak gap** — which neighbourhoods lose the most connectivity outside rush hour? Compute isochrones at 8am vs 10pm and show the delta.

- **Tram vs bus dependency** — neighbourhoods that collapse if you remove one mode. How much of Zagreb is tram-only viable?

- **Transfer penalty map** — where do you need 2+ transfers to reach the city centre (Trg bana Jelačića)? Single-seat rides vs painful connections.

- **Best/worst time to travel** — hour-by-hour reachability heatmap (6am–midnight). When does your neighbourhood come alive, when does it go dark?

- **Walk gap** — how much further can you get with transit vs just walking? Some areas transit barely helps; others it's transformative.

- **Most isolated stop** — the stop with the fewest destinations reachable within 30 minutes. The loneliest stop in Zagreb.

- **Best-connected stop** — the opposite. Which single stop gives you the most city?

- **Real-time reliability** — average delay by line and neighbourhood, computed from GTFS-RT data over time. Which lines are chronically late?

### Map features

- **Reverse isochrone** — flip the question from "where can I go?" to "where can people reach this point from?" Useful for evaluating how accessible a venue or workplace is.

- **"Where should we meet?"** — two people each pick their origin, the app computes both isochrones and highlights the overlap. The sweet spot (lowest combined travel time) becomes the suggested meeting area. Shareable URLs already support one origin — extend to encode both, so each person can share their starting point.

- **POI overlay** — show hospitals, schools, parks, grocery stores within the reachable area (Overpass API). Turns the abstract isochrone into a concrete answer: "what can I actually get to in 15 minutes?"

- **Animated expansion** — play button that sweeps from 0 to 45 minutes, watching the isochrone grow in real-time. Visually striking and makes the data more intuitive.

- **Commute evaluator** — pin your workplace, then explore commute times from any potential home. Reverse isochrone framed for apartment hunting.

### Platform

- **Embeddable widget** — lightweight iframe version that real estate listings, tourism sites, or city planning pages could drop in.

- **Multi-city** — the architecture generalizes. Load different GTFS + OSM data for Split, Rijeka, or other Croatian cities.
