# Editorial statistics (`/statistika`, `/statistika/podaci`)

The city-wide argument page: kvartovi ranked by reach, the inequality gap, the
travel-time matrix, price-versus-reach, and the methodology. Charts are visx
SVG, not images. Deep-dive tables live at `/statistika/podaci`.

Static tier.

## Sub-features

- **Sections** - h1 `Statistika dostupnosti zagrebačkog prijevoza`, then
  `Što znači bod`, `Pola sata. I nigdje.`, `Jaz nije samo bod.`,
  `Jaz počinje prije tramvaja.`, `Koliko grada vam je nadohvat iz vašeg kvarta?`
- **Table of contents** - `Sekcije izvještaja` nav on `/statistika`,
  `Odjeljci izvještaja` on `/statistika/podaci`.
- **Interactive matrix** (on `/statistika`) - the travel-time matrix has an
  origin picker: the page's only `combobox`, reading `Donji grad▾` by default.
- **Deep dive** (`/statistika/podaci`) - the labelled charts and tables live
  here, not on `/statistika`: `Grafikon prosječnog kašnjenja`,
  `Graf propagacije kašnjenja`, a `Linija` select, `Tramvajske linije` and
  `Autobusne linije` tables, and a `Nalazi` carousel
  (`Prethodni nalaz` / `Nalaz 1..3` / `Sljedeći nalaz`).

## How to get to it (user POV)

The nav `statistika` link, the `Cijela statistika` link in the map sidebar, the
homepage teaser `Gdje mreža radi, a gdje staje.`, or search.

## Driving it with agent-browser

```bash
source .claude/skills/verify-doseg/scripts/session.sh

.claude/skills/verify-doseg/scripts/snap.sh /statistika --full --name statistika
.claude/skills/verify-doseg/scripts/snap.sh /statistika/podaci --full --name podaci

ab open https://doseg.localhost/statistika
ab eval '[...document.querySelectorAll("h1,h2")].map(e=>e.textContent.trim())'

# The matrix origin picker: the page's only combobox. Click, re-snapshot for
# the kvart list, pick one, then read the matrix row back.
ab find role combobox click
ab snapshot -i -c

# On /statistika/podaci, every chart must have geometry, not just a labelled
# empty <svg>.
ab open https://doseg.localhost/statistika/podaci
ab eval '[...document.querySelectorAll("svg[aria-label]")].map(s => [s.getAttribute("aria-label"), s.querySelectorAll("path,rect,circle,line").length])'
```

For a visual change, capture `--full` before and after and compare the two
screenshots; the page is long and a regression usually shows in one band.

## Gotchas

- **Two font sizes only** (16px `text-head`/`text-body`, 12px mono
  `text-label`). If labels suddenly render at 16px, the cause is usually a
  custom `text-*` utility missing from the `extendTailwindMerge` config in
  `lib/utils.ts`: `cn()` drops it when it collides with a text colour. That bug
  has hit this exact page before, so check computed sizes after any styling
  change:
  `ab eval '[...document.querySelectorAll("[class*=text-label]")].slice(0,5).map(e=>getComputedStyle(e).fontSize)'`
- No all-caps labels, no rounded corners, no hardcoded hex. Colours come from
  the tokens in `app/globals.css`.
- Chart plot widths are fixed to the editorial column (the scatter is 496px
  wide, not 560). Do not "fix" a chart by widening it past the column.
- Numbers here come from the same stale pooled district data as the kvart
  pages, so they will not match a live map reading.
- **`aria-label` on a Base UI `Select.Root` never reaches the DOM.** The matrix
  picker is labelled that way in source, so querying `[aria-label="Polazni
  kvart"]` finds nothing. Drive the rendered trigger instead
  (`find role combobox`).
- The delay charts on `/statistika/podaci` read `/api/rt/*`, which is a rewrite
  to the Rust service. On the static tier they render empty; use `up.sh --full`
  when those are what you changed.
