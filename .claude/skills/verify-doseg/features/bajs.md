# Bajs (`/bajs`)

Bike-share in numbers: a live map of every BAJS station read straight from the
public nextbike feed, plus measured sections (rides counted by comparing
consecutive snapshots, van relocations, demand direction) computed from the
RT SQLite database behind the Rust service.

Live map works on the static tier. The measured sections need the **full
tier**, and even then need real history: see the gotchas.

## Sub-features

- **Live band** above the header: `uživo · HH:MM`, `ima bajsa` / `prazna`
  legend, `NNNN bajsa na NNN stanica · NN praznih`.
- **Station map** - `Karta Bajs stanica u Zagrebu`, a MapLibre canvas with
  `Zoom in` / `Zoom out` and baked `bajs-tiles/` PNGs.
- **Counted stock block** - `197 stanica`, `1.656 bajseva`, `27 praznih`,
  `na stanicama` vs `nije na stanici`, with the honesty note that the
  remainder mixes rides in progress with bikes pulled for service.
- **Measured sections** - rides per day, station ranking, van relocations,
  station flow. Gated to a 14-day window.
- **Endpoints** - `/api/bajs` (Next, live feed) and `/api/rt/bajs-*` (rewrites
  to the Rust service on `:3002`).

## How to get to it (user POV)

The nav `bajs` link. Address pages also mention bajs proximity and link here.

## Driving it with agent-browser

```bash
source .claude/skills/verify-doseg/scripts/session.sh

.claude/skills/verify-doseg/scripts/snap.sh /bajs --wait "Bajs u brojkama" --settle 4000 --full

# Live numbers come from the public feed, so they must be present even on the
# static tier.
ab eval 'document.body.innerText.match(/\d[\d.]* bajsa na \d+ stanica/)?.[0]'

# Are the measured sections real or degraded?
ab eval 'document.body.innerText.includes("Brojke se trenutno ne mogu dohvatiti")'

# The endpoints behind them, checked directly.
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3002/api/rt/bajs-rides?days=14"
curl -s "http://localhost:3002/api/rt/bajs-rides?days=14" | head -c 200   # how many days came back
curl -sk -o /dev/null -w "%{http_code}\n" https://doseg.localhost/api/bajs
```

## Gotchas

- **A dev box cannot prove the measured sections.** They need weeks of bajs
  snapshots in `data/gtfs-rt.db`, and a local isochrone server only writes
  snapshots while it runs. Locally the endpoints answer 200 with a single day,
  so the page correctly renders `Brojke se trenutno ne mogu dohvatiti` and
  `poslužitelj koji trenutno ne odgovara` even with `:3002` up. That is the
  page working, not a regression. Real verification of those sections happens
  against production or a restored prod backup (`scripts/backup-rt-db-local.sh`
  runs on the server; the prod database lives in the `doseg_rt_db` docker
  volume).
- The route-delay history in a local DB can be months deep while the bajs
  tables are minutes deep. `/api/rt/summary` reports the delay window, not the
  bajs one, so it is not evidence that bajs data exists.
- Numbers on this page are deliberately hedged: "bikes in use" and "fleet" are
  inferred from station stock, and `bajs_trip` is a van log rather than a ride
  log. Do not "fix" the copy toward stronger claims.
- The station map is MapLibre: give it a settle before screenshotting, same as
  `/karta`.
- Station names go through one caser (`lib/bajs-station-name.ts`), covered by
  `bun test`.
