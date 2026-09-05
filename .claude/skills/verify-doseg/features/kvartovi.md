# Kvart scorecards (`/kvartovi`, `/kvartovi/[slug]`)

The 17 Zagreb kvartovi ranked by reach, plus a scorecard per kvart: where it
sits in the ranking, how much of the city it reaches, whether service holds up
in the evening and at weekends, which lines serve it, and its busiest stops.

Static tier. Data comes from `data/district-scores*.json`; each kvart has its
own dithered hero.

## Sub-features

- **Index** (`/kvartovi`) - h1 `Kvartovi po povezanosti.`, all 17 ranked with
  comparison bars.
- **Scorecard** - h1 `Trnje.`, then `2. od 17 kvartova.`,
  `Koliko grada ti je nadohvat?`, `Vrijedi li i navečer i vikendom?`,
  `35 linija.`, `Najprometnije stanice.`
- **Cross-links** - stops to `/stanice/[slug]`, lines to `/linije/[broj]`,
  and out to `/statistika`.
- **Map sidebar link** - `/karta` shows the origin kvart's rank and links back
  here.

## How to get to it (user POV)

The nav `kvartovi` link, the ranking on `/statistika`, the map sidebar's
`tvoj kvart na ljestvici` row, or search.

## Driving it with agent-browser

```bash
source .claude/skills/verify-doseg/scripts/session.sh

.claude/skills/verify-doseg/scripts/snap.sh /kvartovi/trnje --wait "od 17 kvartova" --full
.claude/skills/verify-doseg/scripts/snap.sh /kvartovi --wait "po povezanosti"

ab open https://doseg.localhost/kvartovi/trnje
ab eval '[...document.querySelectorAll("h1,h2")].map(e=>e.textContent.trim()).slice(0,6)'
# ["Trnje.", "2. od 17 kvartova.", "Koliko grada ti je nadohvat?", ...]

# Rank on the index must agree with the rank on the scorecard.
ab open https://doseg.localhost/kvartovi
ab eval 'document.body.innerText.match(/Trnje[^\n]*/g)?.slice(0,2)'

# A low-ranked kvart exercises the other end of the copy.
.claude/skills/verify-doseg/scripts/snap.sh /kvartovi/sesvete --wait "od 17 kvartova"
```

Check at least a top-ranked and a bottom-ranked kvart: the comparison copy
changes sign.

## Gotchas

- **All district data is stale by design** until the next regen, and the
  interleaved build pools days. Numbers here are not expected to match a live
  `/karta` reading for the same spot.
- The scorecard composes the shared editorial kit
  (`app/statistika/editorial/`). Fix layout there, not with one-off markup, or
  the kvart page drifts from `/statistika`.
- Copy says **kvart**, never `četvrt`, with masculine declensions. That is
  SEO-locked, so a "grammar fix" toward `četvrt` is a regression.
- Heroes are baked per kvart by `build-kvart-heroes`; a missing crop is a
  pipeline gap.
