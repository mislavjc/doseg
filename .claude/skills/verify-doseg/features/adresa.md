# Address pages (`/adresa/[slug]`)

Per-street and per-address pages built from the DGU register (5,213 streets,
138k address points): what you reach from this doorstep, how often service
runs, how close the nearest stop and bajs station are, and the handoff into the
map.

Static tier.

## Sub-features

- **Hero** - the whole-Zagreb dither hero zoomed to the address.
- **Headline** - h1 `Savska cesta 25` and a comparison hook such as
  `Tri stanice prije nego što prosjek grada uopće stigne...`.
- **Service** - `Svakih ~9 minuta u špici, od 4:10 do 0:43.`
- **Bajs proximity** - `Bajs ti je bliže nego stanica: 75 metara.`
- **POI walk times** - `Škola na minutu, park na četiri, bolnica na devet.`
- **Map handoff** - `Točan doseg s ove adrese je na karti.` with the
  `Otvori kartu s ove adrese` link into `/karta?lat&lon`.
- **Slugs** - a plain street slug (`savska-cesta`) or street plus house number
  (`savska-cesta-25`); non-Zagreb streets carry a naselje suffix.

## How to get to it (user POV)

Homepage search: typing three or more characters appends address rows under
the line and stop hits, and each row links here. The homepage suggestion chips
`Savska cesta 25` and `Ilica 5` land here too.

## Driving it with agent-browser

```bash
source .claude/skills/verify-doseg/scripts/session.sh

.claude/skills/verify-doseg/scripts/snap.sh /adresa/savska-cesta-25 --wait "Savska cesta 25" --full

ab open https://doseg.localhost/adresa/savska-cesta-25
ab eval '[...document.querySelectorAll("h1,h2")].map(e=>e.textContent.trim()).slice(0,6)'

# The handoff must carry coordinates into the map.
ab eval 'document.querySelector("a[href*=\"/karta?\"]")?.getAttribute("href")'
ab find role link click --name "Otvori kartu s ove adrese"
ab wait --url "**/karta**"

# Reached the way a user does, from search.
ab open https://doseg.localhost/
ab find role combobox fill "Savska cesta 25" --name "Pretraži adrese, linije i stanice"
ab wait 1500 && ab snapshot -i -c

# A street-only slug and a non-Zagreb street exercise the other slug shapes.
.claude/skills/verify-doseg/scripts/snap.sh /adresa/savska-cesta --wait "Savska cesta"
```

## Gotchas

- **The slug must round-trip.** `resolveAdresaSlug` accepts a candidate only if
  re-slugifying the street (with one of its house numbers) reproduces the slug
  exactly, so a near-miss 404s rather than falling back to the street. Verify
  both shapes after touching slug logic.
- Address rows in search come from `/api/adrese` and are throttled by the
  in-flight request. Wait after typing.
- Numbers on the page derive from the same precomputed reach data as the stop
  and kvart pages, so they will not match a live `/karta` reading exactly.
- The hero is a zoomed crop of the shared dither map, not a per-address image;
  a wrong-looking crop points at the zoom math, not a missing asset.
- These pages are pSEO surfaces: title, description and canonical matter as
  much as the body.
