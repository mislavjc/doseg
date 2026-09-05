# Stop pages (`/stanice`, `/stanice/[slug]`)

1,220 stop pages plus an A-Ž index. Each page answers: which lines call here,
when the first and last departure is, how much of the city you reach from this
stop, and what else is nearby.

Static tier. Data is committed under `data/stanice/`, heroes are baked into
`public/stanice/`.

## Sub-features

- **Index** (`/stanice`) - h1 `Sve stanice ZET-a, od A do Ž.`, h2
  `Cijeli grad, po abecedi.`, letter anchors for stops with enough lines.
- **Stop page** - h1 `Stanica Britanski trg.`, then
  `Osam linija, čvorište.` (line list),
  `Za pola sata dosegneš 216 stanica.` (reach), `Stanice u blizini.`
- **Direction grouping** - `oba smjera` / `više smjerova` / `čvorište` wording.
- **Headway** - `interval u špici` from the most frequent line at the stop.
- **Cross-links** - every line badge links to `/linije/[broj]`, neighbours to
  their own stop pages.

## How to get to it (user POV)

Homepage search by stop name (including aliases), the A-Ž strip, the nav
`stanice` link, a line page's stop list, or search.

## Driving it with agent-browser

```bash
source .claude/skills/verify-doseg/scripts/session.sh

.claude/skills/verify-doseg/scripts/snap.sh /stanice/britanski-trg --wait "Stanica Britanski trg" --full
.claude/skills/verify-doseg/scripts/snap.sh /stanice --wait "od A do Ž"

ab open https://doseg.localhost/stanice/britanski-trg
ab eval '[...document.querySelectorAll("h1,h2")].map(e=>e.textContent.trim())'
# ["Stanica Britanski trg.", "Osam linija, čvorište.", "Za pola sata dosegneš 216 stanica.", "Stanice u blizini."]

# Line badges must land on real line pages.
ab snapshot -i -u -c | grep "/linije/" | head -5
ab scrollintoview "text=Stanice u blizini" && ab screenshot tmp/verify/blizina.png

# Index: a letter anchor must land on stops under that letter.
ab open https://doseg.localhost/stanice
ab snapshot -i -c | head -30
```

A template change needs more than one stop: a hub with many lines
(`britanski-trg`), a single-line suburban stop, and a stop whose name carries
diacritics.

## Gotchas

- **Never commit a locally regenerated stop dataset.** The local OTP is
  routinely on an older feed than the committed data, so a local
  `--stop-pages` run silently downgrades every page. Regens belong to the feed
  refresh pipeline.
- Only stops above the line-count threshold get letter anchors on the index, so
  a stop missing from the A-Ž strip is not necessarily a bug.
- Slugs are diacritic-folded. Verify one accented name end to end when slug
  logic changes.
- Reach counts on the page are precomputed, not live: they will not move when
  the isochrone service is down, and they can disagree with `/karta` if the
  feeds differ.
- The stop hero is baked at zoom 17. A missing image points at the hero build
  script, not the page.
