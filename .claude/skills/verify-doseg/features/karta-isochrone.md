# Isochrone map (`/karta`)

The core feature: click a point in Zagreb, get the area reachable by public
transport in 15 or 30 minutes, painted as bands on a MapLibre canvas with a
sidebar readout. Click a second point inside the reach and the sidebar turns
into a routed itinerary.

Needs the **full tier** (`up.sh --full`). Without the isochrone server on
`:3002` the page renders and every reach request fails.

## Sub-features

- **Reach from an origin** - sidebar shows `NN km² dohvatljivo`, a share of the
  city, the count of kvartovi touched, and the origin kvart's rank.
- **Minutes toggle** - buttons `15` and `30` refetch and repaint.
- **Route to a destination** - second click (or `dlat`/`dlon` in the URL)
  produces legs: walk, line, walk, with a total.
- **Departure time** - `Vrijeme polaska` control; `?t=HH:MM` in the URL.
- **POI layers** - `Bolnice`, `Škole`, `Parkovi` toggles with counts, plus the
  `Slojevi` panel.
- **Search fields** - `Polazište` and `Odredište` accept typed addresses.
- **Deep links** - `?lat&lon&t&m&dlat&dlon&poi`; `/?lat=` 301s here.

## How to get to it (user POV)

From the homepage, the `otvori kartu` link in the karta banner, or the map's
own URL. Shared links land straight on a computed reach. The mobile layout
replaces the sidebar with a bottom sheet.

## Driving it with agent-browser

```bash
source .claude/skills/verify-doseg/scripts/session.sh

# Reach, with a pinned peak-hour departure (Trg bana Jelačića).
.claude/skills/verify-doseg/scripts/snap.sh \
  "/karta?lat=45.81310&lon=15.97750&t=08:00&m=30" --wait "dohvatljivo" --settle 3000

# Assert the number instead of eyeballing it.
ab eval 'document.body.innerText.match(/\d+ km² dohvatljivo/)?.[0]'   # "54 km² dohvatljivo"

# Minutes toggle: 30 -> 15 must shrink the reach.
ab find role button click --name "15"
ab wait 2500
ab eval 'document.body.innerText.match(/\d+ km² dohvatljivo/)?.[0]'   # "8 km² dohvatljivo"

# Route: origin + destination in the URL, then read the leg list.
ab open "https://doseg.localhost/karta?lat=45.81310&lon=15.97750&dlat=45.79970&dlon=15.94930"
ab wait --text "Natrag na doseg"
ab eval 'document.querySelector("aside")?.innerText.slice(0, 400)'
# "21 min / Polazak ... bez presjedanja / Pješice ... Tramvaj 12 ... Pješice do odredišta"

# Controls and layers.
ab snapshot -i -c        # "Vrijeme polaska", "Slojevi · 1", "Bolnice 18", "Polazište", "Odredište"
ab find role button click --name "Bolnice 18"

# Mobile sheet.
ab set device "iPhone 12"
ab open "https://doseg.localhost/karta?lat=45.81310&lon=15.97750&t=08:00"
```

Proof for a map change is the sidebar number **and** the painted canvas. A
screenshot with a white map area is not a pass.

## Gotchas

- **MapLibre paints after the text lands.** `wait --text "dohvatljivo"` returns
  while the canvas is still white; give it `--settle 3000` (or `ab wait 2500`)
  before screenshotting. Basemap tiles come from CARTO over the network, so a
  slow link shows a blank map with a correct sidebar.
- **"Sada" is Zagreb-now, not host-now.** The dev machine can be hours off
  Zagreb; at night the honest answer is a tiny reach (16 km² vs 54 km² at
  08:00). Pin `?t=08:00` for anything comparable.
- **Reach numbers move with the feed and with real-time delays.** Assert the
  shape (`/\d+ km² dohvatljivo/`, or a floor) rather than an exact km² unless
  you are testing the engine itself.
- **The route panel prints its own departure and arrival clock.** Verify the
  legs; only chase the clock when time handling is what you changed.
- **The client route engine is a deliberate twin of the Rust one.** If you
  touch one, verify both: the map route panel and the isochrone response.
- **Coordinates snap** (about 100 m, 5-minute time buckets), so two nearby
  clicks legitimately give the identical answer.
- `/api/isochrone` is a Next rewrite to `:3002`. A 502 there means the Rust
  service died, not a page bug; check `tmp/verify/logs/isochrone.log`.
