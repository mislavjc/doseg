---
name: verify-doseg
description: Drive the doseg web app (Next.js at https://doseg.localhost, Rust isochrone service, OTP) with agent-browser and capture proof that a change works. Use after touching any page, component, API route, or data loader, and whenever a claim needs evidence from the real app rather than from tests or a type check.
---

# Verify doseg

doseg is a Zagreb transit reachability site. The surface a user touches is the
web UI: an isochrone map at `/karta`, a search-first imenik at `/`, and
generated pSEO pages for lines, stops, kvartovi, plus the editorial
`/statistika`. Everything below drives that UI with `agent-browser`.

`bun run typecheck`, `bun run lint`, `bun test` and `bun run build` still catch
what they catch. They are not a proof that a page works: the pages read
committed JSON at request time and the map depends on two more services, so a
green build says nothing about what renders.

## Launch

Two tiers. Pick the smaller one that covers what you changed.

```bash
.claude/skills/verify-doseg/scripts/up.sh          # Next dev only
.claude/skills/verify-doseg/scripts/up.sh --full   # + OTP :8080 + isochrone server :3002
```

- **Static tier** covers every page except live isochrones: `/`, `/linije/*`,
  `/stanice/*`, `/kvartovi/*`, `/statistika`, `/promjene`, `/adresa/*`,
  `/bajs`, and the Next API routes. `/karta` renders, but any reach or route
  request fails.
- **Full tier** adds `/karta`'s isochrones. `scripts/otp.sh` picks the OTP
  source itself: reuse a running one, else an SSH tunnel to `netcup`, else
  local Docker (that last path builds a graph and takes minutes). The
  isochrone server then needs `data/walk-graph.bin`; if it is missing, run
  `./scripts/setup-dev.sh`.

Ready means `https://doseg.localhost` answers 200. `up.sh` polls for that and
prints the startup log tail if it never comes.

**One instance only.** portless owns the `doseg.localhost` hostname, so a
second dev server cannot have it. `up.sh` reuses whatever is already serving
and, when that instance is not one it started, records nothing so `down.sh`
leaves it alone. Never start a competing server or kill a foreign one.

## Doctor

```bash
.claude/skills/verify-doseg/scripts/doctor.sh
```

Read-only. Reports whether the app answers, who owns the running instance,
whether `:3002` and `:8080` are up, the current commit and dirty count, and
whether the walk graph exists. Exit 0 means drivable. Run it first whenever
something looks wrong, before restarting anything.

`/api/health` returning 503 is normal on the static tier: it probes OTP.

## Drive

The harness is `agent-browser` (CDP, accessibility-tree snapshots). Give the
work its own browser session so parallel agents do not fight over tabs:

```bash
source .claude/skills/verify-doseg/scripts/session.sh   # defines VERIFY_SESSION + the `ab` wrapper
ab open https://doseg.localhost/karta
ab snapshot -i -c          # interactive elements with @eN refs
ab find role button click --name "30"
ab get text @e5
```

Every `ab` command is `agent-browser --session "$VERIFY_SESSION" ...`; from a
one-off shell line without sourcing, pass `--session` yourself (the file shows
how). Refs go stale on every page change, so re-snapshot after acting.

For the common "load a page and prove it renders" case:

```bash
.claude/skills/verify-doseg/scripts/snap.sh /linije/1 --wait "18 stanica"
.claude/skills/verify-doseg/scripts/snap.sh /statistika --full --name statistika
.claude/skills/verify-doseg/scripts/snap.sh "/karta?lat=45.81310&lon=15.97750&t=08:00" \
  --wait "dohvatljivo" --settle 3000
```

It clears the console and network buffers, opens the path, waits for text you
name, screenshots, and reports console errors plus finished non-2xx/3xx
requests. The screenshot is viewport-only by default, and on pSEO pages the
hero image fills the whole viewport, so pass `--full` when the content below
the hero is the point. Croatian copy is the stable handle on this site: prefer real page
text and ARIA names (`Pretraži adrese, linije i stanice`, `Slojevi`, `Polazište`)
over CSS classes, which are Tailwind utility soup and change with any restyle.

Preferred handles, in order: `find role ... --name` on the Croatian label,
page text via `wait --text`, `@eN` refs from a fresh snapshot, then CSS.

Prefer `find role link|button --name` over `find text` for clicking. Stop and
line names repeat in the surrounding prose, so `find text` can resolve to the
whole `<section>` and then fail with a confusing "covered by" error while the
link itself is perfectly clickable.

## Evidence

Every run writes to `tmp/verify/<name>-<stamp>/`: the screenshot, `console.txt`
(errors and warnings, dev noise filtered), and `bad-requests.txt`. `tmp/` is
gitignored, and cleanup never touches it. Cite the directory in what you report.

Proof standards on this repo:

- Drive the page the way a visitor does: a URL, a click, a typed query. Do not
  prove a page by calling its loader in a bun script, and do not prove the map
  by curling `/api/isochrone` alone. An API check is a supporting fact, not the
  proof.
- Capture the action and its result, not just the final screen. For the map
  that means the reach number in the sidebar and the painted bands; for search
  it means the dropdown row and the page it lands on.
- Check side effects where a feature has them: files written under `data/` or
  `public/` by a generator, a redirect actually issued (`curl -sI`), a
  `Server-Timing` header, an OG image that renders.
- Mock nothing. Both upstreams here (OTP, the isochrone service) are real
  services this repo already runs locally, so there is no reason to stub them.
  The one boundary worth stubbing is a third-party the CSP already isolates
  (CARTO tiles, Overpass, nextbike) when you are testing failure copy:
  `ab network route "**/basemaps.cartocdn.com/**" --abort`.
- Time is not fixed. The dev machine may be nowhere near Zagreb, and the app
  renders Europe/Zagreb time, so "Sada" can be the middle of the night and
  reach numbers shrink accordingly. Pin `?t=08:00` for anything you want to
  compare.
- Committed data can be stale. A line page saying `trenutno ne prometuje`, or
  `0 min` end-to-end, is a lapsed GTFS window in `data/linije/`, not a broken
  page. Check `data/linije/index.json` for the feed window before calling it a
  regression.

## Cleanup

```bash
.claude/skills/verify-doseg/scripts/down.sh   # stops only what up.sh started
agent-browser --session "$VERIFY_SESSION" close
```

`down.sh` kills recorded PIDs and their children, never by process name, and
skips any instance it did not start. Evidence under `tmp/verify/` survives;
service logs stay in `tmp/verify/logs/`.

Leaving the stack up between verifications is fine and faster. Tear down when
you are done with a session, and always after a failed attempt, so a half-dead
isochrone server does not hold `:3002` for the next run.

## Feature map

`features/` is the list of what a user can actually do here, one file per
feature, with the handles and the end state that proves each one. Read the
feature file before driving that area, and update it when the UI moves. A proof
that drives one convenient entry point is incomplete when the map lists others.

Start at [`features/README.md`](features/README.md).
