# About and method (`/o-projektu`)

The methodology page in Croatian: what doseg measures, how the isochrone engine
decides what is reachable, where the data comes from, and what the numbers do
not claim. It is the page every other surface points at when it hedges.

Static tier.

## Sub-features

- **Prose** - h1 `O projektu`, then the method and data-source sections.
- **Footer links** - the shared editorial footer's `preuzmi` block, where only
  `rezultati.json` is a live endpoint (`/api/open-data`); `izohrone.geojson`
  and `metoda.pdf` currently point at the GitHub repo. Plus source credits
  (`zet gtfs · rt`, `© openstreetmap`, `dzs 2021`) and the `ažurirano` date.
- **Nav target** - `o projektu` in the header of every page and in the map
  sidebar.

## How to get to it (user POV)

The `o projektu` nav link anywhere on the site, or the map sidebar's link.

## Driving it with agent-browser

```bash
source .claude/skills/verify-doseg/scripts/session.sh

.claude/skills/verify-doseg/scripts/snap.sh /o-projektu --wait "O projektu" --full

# Footer download links: read the real hrefs, then check the one that is ours.
ab open https://doseg.localhost/o-projektu
ab snapshot -i -u -c | grep -Ei "rezultati|izohrone|metoda"
# rezultati.json -> /api/open-data ; izohrone.geojson and metoda.pdf -> the GitHub repo
curl -sk -o /dev/null -w "open-data %{http_code}\n" https://doseg.localhost/api/open-data

# The "ažurirano" date should not be frozen in the past after a data roll.
ab eval 'document.body.innerText.match(/ažurirano\s+([^\n]+)/)?.[1]'
```

## Gotchas

- The exact download paths come from the shared footer, so confirm them in the
  snapshot rather than trusting the list above after a footer change.
- This page is the place where hedged claims live. If a number elsewhere gets
  a stronger wording, the method text here has to still be true.
- Croatian copy rules apply: kvart, no em-dashes, no all-caps labels.
