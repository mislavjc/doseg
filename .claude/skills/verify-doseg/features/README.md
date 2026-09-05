# doseg feature map

What a visitor (or a crawler) can do on doseg, one file per feature. Each file
says what the feature is, how a user reaches it, how to drive it with
`agent-browser`, and what observable end state proves it works.

Read the file for the area you touched before driving it. When the UI moves,
move the file with it: this map is the repo's verification source, and a stale
handle here costs the next agent a debugging round.

## Pages

| Feature | File | Tier |
|---|---|---|
| Isochrone map: reach, route, layers | [karta-isochrone.md](karta-isochrone.md) | full |
| Homepage imenik: search + directory | [home-imenik.md](home-imenik.md) | static |
| Line pages: `/linije` + `/linije/[broj]` | [linije.md](linije.md) | static |
| Stop pages: `/stanice` + `/stanice/[slug]` | [stanice.md](stanice.md) | static |
| Kvart scorecards: `/kvartovi` + `/kvartovi/[slug]` | [kvartovi.md](kvartovi.md) | static |
| Editorial statistics: `/statistika` + `/podaci` | [statistika.md](statistika.md) | static + full for RT charts |
| Address pages: `/adresa/[slug]` | [adresa.md](adresa.md) | static |
| Bike-share: `/bajs` | [bajs.md](bajs.md) | full, plus real RT history |
| Changelog: `/promjene` | [promjene.md](promjene.md) | static |
| Schematic tram map: `/karta-tramvaja` | [karta-tramvaja.md](karta-tramvaja.md) | static |
| About and method: `/o-projektu` | [o-projektu.md](o-projektu.md) | static |
| Error pages: 404 and 500 | [error-pages.md](error-pages.md) | static |

## Machine-facing

| Feature | File | Tier |
|---|---|---|
| OG cards, JSON-LD, llms.txt, sitemap, robots | [metadata-og.md](metadata-og.md) | static |

## Not mapped

Every user-facing route has a file. What is left is API surface with no page of
its own, verified through the feature that consumes it:

- `/api/isochrone` and `/api/rt/*` - rewrites to the Rust service, driven from
  [karta-isochrone.md](karta-isochrone.md), [bajs.md](bajs.md) and
  [statistika.md](statistika.md)
- `/api/adrese`, `/api/search-index`, `/api/geocode`, `/api/reverse` - driven
  from [home-imenik.md](home-imenik.md) and [adresa.md](adresa.md)
- `/api/poi`, `/api/district-context`, `/api/vehicles` - driven from the map
- `/api/health` - covered by `doctor.sh`
- `/api/open-data` - linked from the footer, checked in
  [o-projektu.md](o-projektu.md)

Add a file when one of these grows a page, and link it above.
