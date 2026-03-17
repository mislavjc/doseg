# Doseg

Interactive transit reachability map for Zagreb. Click anywhere to see how far you can travel by tram and bus in 15, 30, and 45 minutes — visualized as color-coded isochrone bands over the city map.

## How it works

1. You click a point on the map
2. The server runs Dijkstra over ZET tram/bus schedules (via OpenTripPlanner) combined with a walking street network (from OpenStreetMap)
3. The result is a set of isochrone lines showing reachable areas, bucketed by travel time
4. Hover (or tap on mobile) any destination to instantly reconstruct the full route — no extra network request needed, since the routing graph is shipped to the client

## Stack

- **Frontend:** Next.js, React, MapLibre GL, Tailwind, Motion
- **Transit data:** OpenTripPlanner with ZET GTFS feed
- **Walking network:** Custom binary graph built from Croatia OSM extract (~422K nodes, CSR-encoded)
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

- **Time-of-day selector** — isochrones currently assume a fixed departure time. A time picker would show how reachability changes at rush hour vs. late night. OTP already supports `dateTime` queries, so this is mostly UI work.

- **Reverse isochrone** — flip the question from "where can I go?" to "where can people reach this point from?" Useful for evaluating how accessible a venue or workplace is.

- **"Where should we meet?"** — two people each pick their origin, the app computes both isochrones and highlights the overlap. The sweet spot (lowest combined travel time) becomes the suggested meeting area. Shareable URLs already support one origin — extend to encode both, so each person can share their starting point.

- **POI overlay** — show hospitals, schools, parks, grocery stores within the reachable area (Overpass API). Turns the abstract isochrone into a concrete answer: "what can I actually get to in 15 minutes?"

- **Bike/scooter integration** — Zagreb has bike-share. Extending the graph with cycling speeds would show how a bike leg at either end expands your reach dramatically.

- **Accessibility score heatmap** — precompute a grid of origins, score each by total reachable area. Visualize which neighborhoods are best/worst connected by transit.

- **Real-time delays** — OTP supports GTFS-RT. Show how current disruptions shrink or shift the reachable area.

- **Walking-only comparison** — show a walking-only isochrone ring alongside the transit one. Makes it obvious where transit actually helps vs. where you'd be just as fast on foot. The walking graph is already there.

- **Animated expansion** — play button that sweeps from 0 to 45 minutes, watching the isochrone grow in real-time. Visually striking and makes the data more intuitive.

- **Export as image** — screenshot button that renders the current map state as a shareable PNG. Useful for blog posts, presentations, social media. MapLibre has `canvas.toDataURL()` built in.

- **Commute evaluator** — pin your workplace, then explore commute times from any potential home. Reverse isochrone framed for apartment hunting.

- **Transit deserts** — highlight areas with poor coverage. Where does travel time spike over a short distance? Where are the gaps? Could be a compelling data journalism angle.

- **Elevation-aware walking** — Zagreb has hills. Factor DEM elevation data into walking speed calculations for more accurate isochrones in hilly areas like the upper town.

- **Embeddable widget** — lightweight iframe version that real estate listings, tourism sites, or city planning pages could drop in.

- **Multi-city** — the architecture generalizes. Load different GTFS + OSM data for Split, Rijeka, or other Croatian cities.
