# Line pages (`/linije`, `/linije/[broj]`)

154 statically generated pages, one per ZET line: schedule summary, peak
headway, terminal-to-terminal time, the stop list in both directions, and a
dithered map of the route corridor. The index at `/linije` lists them all.

Static tier. Everything comes from committed `data/linije/*.json` plus baked
hero PNGs in `public/linije/`.

## Sub-features

- **Index** - tram and bus sections, links to every line page.
- **Hero** - dithered corridor map with an SVG overlay
  (`app/linije/line-hero.tsx`), alt text like
  `Karta tramvajske linije 1 u Zagrebu`.
- **Headline** - h1 `Linija 1: Spr. Trešnj. - Borongaj.` plus a one-line
  summary of mode and notable stops.
- **Data block** - `status`, `broj stanica`, `duljina trase`,
  `vožnja od kraja do kraja`.
- **Stop list** - h2 `18 stanica u svakom smjeru.` (line 1) or
  `23 stanice u svakom smjeru.` (line 107), each stop a link to its
  `/stanice/[slug]` page, per-direction totals.
- **Service sections** on a line the feed actually runs: `43 km² grada u pola
  sata.`, `Četiri polaska na sat u špici.`, `Svi polasci, oba smjera.`
- **Metadata** - title, description, JSON-LD, OG card.

## How to get to it (user POV)

Homepage search by number, the `Tramvajska mreža.` / `Autobusna mreža.` rows,
the nav `linije` link, a stop page's line list, or search engines (this is a
pSEO surface, so titles and descriptions are part of the feature).

## Driving it with agent-browser

```bash
source .claude/skills/verify-doseg/scripts/session.sh

.claude/skills/verify-doseg/scripts/snap.sh /linije/1 --wait "u svakom smjeru" --full

ab open https://doseg.localhost/linije/1
ab get title                          # "Tramvaj 1 (ZET): vozni red i stanice | Doseg"
ab find role heading text --name "Linija 1"
ab snapshot -c -d 4 | head -40        # data block labels and the stop list

# Stop links must resolve, not 404. Use the link role: the same stop name also
# appears in the intro prose, and `find text` would match that section instead.
ab find role link click --name "Tehnički muzej"
ab wait --url "**/stanice/**"        # -> /stanice/tehnicki-muzej

# A bus line and the index, for the other templates.
.claude/skills/verify-doseg/scripts/snap.sh /linije/107 --wait "u svakom smjeru"
.claude/skills/verify-doseg/scripts/snap.sh /linije --wait "linij"

# Structured data, when metadata is what changed.
ab eval '[...document.querySelectorAll("script[type=\"application/ld+json\"]")].map(s=>s.textContent.slice(0,200))'
```

Changing the template means checking more than one line: a tram, a bus, a night
line, and a line the current feed does not run.

## Gotchas

- **Stale data reads like a bug.** `Linija 1 trenutno ne prometuje`, `0 min`
  end-to-end, or a status of `trenutno ne vozi` means the committed feed window
  in `data/linije/index.json` has lapsed. Check the window before filing a
  regression; the fix is a data regen, not a page change.
- Page data is read at build/request time from `data/`. After a regen, reload;
  the dev server does not watch those JSON files reliably.
- Hero PNGs are baked (`bun scripts/build-line-heroes.ts`). A missing image is
  a pipeline gap, and `.dockerignore` allowlists `data/`, so a new data file
  can pass locally and fail the server build.
- Copy keeps terminal names in the nominative on purpose. Odd-looking Croatian
  in templated sentences is usually deliberate, not a bug.
- **Croatian plurals move the noun**, so `18 stanica` but `23 stanice`. Wait on
  the invariant tail (`u svakom smjeru`), never on `stanica ...`, or the wait
  passes on one line and times out on the next.
- A line the current feed does not run drops its service sections entirely, so
  a proof written against line 1 can fail on line 107 and the other way round.
- `bun run build` statically generates all 154 pages, so it is the cheap way to
  catch a loader regression across every line before driving one page.
