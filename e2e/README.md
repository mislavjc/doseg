# e2e

Playwright tests against a production build (`next build && next start`),
run by the `e2e` job in `.github/workflows/ci.yml` on every PR.

| file | what it proves |
| --- | --- |
| `smoke.spec.ts` | every route family answers 200 with no console errors, page errors or CSP violations; OG images render; `/?lat=` redirects to `/karta` |
| `behaviour.spec.ts` | `/karta` map click paints an isochrone and fills the reach panel, the minutes toggle refetches, the `/bajs` station popup opens, the tram map legend and zoom work |
| `mobile.spec.ts` | the `/karta` bottom sheet opens and closes (Pixel 7) |
| `visual.spec.ts` | full-page screenshots of the editorial pages and three line pages, desktop and Pixel 7 |

## Commands

```bash
bun run e2e          # build, serve, run everything
bun run e2e:update   # same, and rewrite any screenshot that changed
bun run e2e:record   # re-record upstream fixtures from the live services, then update screenshots
bun run e2e:record-missing  # record only requests that have no fixture yet; keeps the rest
```

Pass Playwright flags after `--`, e.g. `bun run e2e -- visual -g statistika` or
`bun run e2e:update -- visual`. `E2E_SKIP_BUILD=1` reuses the last build.

All three go through `scripts/e2e.sh`, which runs the suite inside
`mcr.microsoft.com/playwright:v<version>-noble`, the image the CI job runs in.
Screenshots are compared with zero colour tolerance, and they only match when
they are rendered with the same fonts and rasterizer, so this is the only
supported way to run the suite. You need Docker. On an arm64 Mac, Docker
emulates amd64, which is slow but gives the same pixels. Linux x86_64 machines
(cloud agents included) run it natively. Keep the image tag in
`.github/workflows/ci.yml` on the `@playwright/test` version.

**After an intended visual change** (a redesign, a copy edit, a data roll), run
`bun run e2e:update`, look at the diff in `e2e/__screenshots__/`, and commit
it with the change.

## Determinism

- Visual tests run `settle()` (`e2e/helpers.ts`) first. It scrolls the page
  top to bottom half a viewport at a time so every `MountWhenNear` section
  mounts, scrolls back up, and waits until the network is idle and the DOM has
  not changed for 500ms.
- Masked regions: `<time>` elements, the scrollspy section navs (which link is
  highlighted depends on scroll history), and every MapLibre map (it fades
  labels and tiles in on its own clock). Maps are covered by the behaviour
  tests.
- No retries. A flaky test should fail.

## Hermetic by construction

CI has no OTP, no isochrone server and no business calling live feeds, so
nothing leaves the machine during a run:

- `e2e/serve.ts` starts a fixture server (`e2e/upstream/server.ts`) and points
  `ISOCHRONE_URL` and `OTP_URL` at it.
- `e2e/upstream/preload.ts` is loaded into `next build` and `next start` with
  `NODE_OPTIONS=--import`. It sends every server-side `fetch` to a non-loopback
  host (nextbike GBFS, ZET RT, Photon, Nominatim, Overpass) to the fixture
  server, and freezes `Date` at `E2E_NOW` (`e2e/env.ts`, a weekday morning
  inside the committed GTFS window).
- `e2e/test.ts` routes every cross-origin browser request (CARTO style, tiles,
  glyphs) to the same fixture server, pins the browser clock to `E2E_NOW`, and
  adds the production CSP, read from the `Caddyfile`, to every document.
- Anything the fixture server has no recording for answers 504 and is listed
  when the run ends; `e2e/teardown.ts` fails the run on any such miss.
- Overpass always answers 503 (a real answer makes `lib/overpass.ts` rewrite
  `data/poi-snapshot.json`), so POIs come from the committed snapshot.
  Plausible is answered with an empty 202 and never recorded.

## Re-recording fixtures

Fixtures live in `e2e/fixtures/upstream/<host>/<hash>.{json,body}`, one pair
per request (method, URL and request-body hash). Re-record when a test needs a
request that was never recorded (the teardown error names it), when the GTFS
feed rolls and `E2E_NOW` moves, or when you want fresher live data:

```bash
bun run e2e:record
```

When only a few requests changed (a new query parameter, a new page), use
`bun run e2e:record-missing`: it replays every existing recording and records
only what is missing, so live data elsewhere stays frozen and the screenshots
do not move. Delete the recordings the old requests used.

`bun run e2e:record` deletes the recordings, runs the whole suite with `E2E_RECORD=1`, and lets
the fixture server forward each request to the real upstream and save the
answer. The isochrone and RT endpoints are recorded from production
(`https://doseg.hr`, override with `E2E_ISOCHRONE_UPSTREAM`); OTP from
`E2E_OTP_UPSTREAM` (default `http://localhost:8080`, only needed if a test
starts using `/api/route`). Live data changes between recordings, so the same
command also rewrites the screenshots: review both diffs before committing.
