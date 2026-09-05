# Changelog (`/promjene`)

What changed in the ZET network, by year, ingested from ZET's own announcement
RSS and illustrated with before/after GTFS geometry for the highlighted
changes. Announcements are the source of truth here; GTFS diffs only draw the
picture.

Static tier.

## Sub-features

- **Timeline** - h1 `Što se promijenilo u ZET-u.`, year headings `2026.`,
  `2025.`, `2024.`, `2022.`, `2020.`, ... with one entry per change.
- **Entry** - a headline like `Autobus 101 produljen do Šestina.`, the date,
  affected line badges, and an `(otvara se u novoj kartici)` source link back
  to the ZET announcement.
- **Search** - placeholder `traži po liniji ili stajalištu`, with an `Očisti`
  button; the result count updates to `N rezultat`/`N rezultata`.
- **Type filter** - `Filtriraj po vrsti promjene`, buttons rendering as
  `sve 29`, `linije 13`, `stajališta 16`, whose counts follow the search.
- **Maps** - highlighted changes carry a before/after GTFS map pair.
- **Footnote** - the disclaimer that only permanent changes are listed and that
  `~` dates are approximate.

## How to get to it (user POV)

The nav `promjene` link. Line pages and the homepage do not link individual
entries, so this page is the entry point.

## Driving it with agent-browser

```bash
source .claude/skills/verify-doseg/scripts/session.sh

.claude/skills/verify-doseg/scripts/snap.sh /promjene --wait "Što se promijenilo" --full

# Search narrows the list and the filter counts follow it.
ab open https://doseg.localhost/promjene
ab find placeholder "traži po liniji ili stajalištu" fill "107"
ab wait --text "1 rezultat"
ab eval 'document.body.innerText.match(/\d+ rezultat\w*/)?.[0]'
ab eval '[...document.querySelectorAll("button")].map(b=>b.textContent.trim()).filter(t=>/^(sve|linije|stajališta)/.test(t))'
# ["sve 1", "linije 0", "stajališta 1"]

# Clear and check the unfiltered totals come back.
ab find role button click --name "Očisti"
ab wait --text "sve 29"
```

## Gotchas

- **Filter button names have no separator in the accessibility tree**
  (`sve1`, `linije0`, `stajališta1`) even though the page shows `sve 29`.
  Match on the visible text with `wait --text`, or on the button name without
  the space, not on `"sve 29"` via `find role button --name`.
- Counts are data-dependent: they change whenever a new announcement is
  ingested, so assert the shape (`/\d+ rezultat/`) rather than a fixed number.
- A search that matches nothing renders zero entry headings while the filter
  row still shows `sve 0`; an empty list is a legitimate state, not a crash.
- Change entries link out to ZET with `(otvara se u novoj kartici)`. Use
  `ab click @eN --new-tab` if you must follow one, and remember external links
  can be down without anything here being wrong.
- The GTFS diff maps are illustrations of an announcement. If a map and the
  headline disagree, the announcement wins.
