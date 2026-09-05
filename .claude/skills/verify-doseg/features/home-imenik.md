# Homepage imenik (`/`)

The landing page: a dithered Zagreb hero, one search field over addresses,
lines and stops, a karta banner, and a directory of the busiest lines plus the
A-Ž stop index. Every search row is a plain link, so the input has exactly one
verb.

Static tier is enough.

## Sub-features

- **Search** - `Pretraži adrese, linije i stanice`. Digits match line numbers;
  text matches stop names, colloquial aliases (`kvatrić` to Kvaternikov trg),
  line terminals, and DGU addresses from `/api/adrese`.
- **Suggestion chips** - `Savska cesta 25`, `Ilica 5`, `kvaternikov trg`, `107`,
  `15` under the field.
- **Karta banner** - `Koliko grada dosegneš za 30 minuta?` with `otvori kartu`.
- **Directory** - `Tramvajska mreža.` / `Autobusna mreža.` line rows with
  headways, `Svaka stanica ima svoju stranicu.` A-Ž strip, `Ljudi upravo traže.`
- **Nav** - statistika, linije, kvartovi, stanice, bajs, promjene, o projektu.
- **Redirect** - `/?lat=..&lon=..` 301s to `/karta`.

## How to get to it (user POV)

The site root, and the destination of the `Doseg doseg.hr` wordmark in every
header.

## Driving it with agent-browser

```bash
source .claude/skills/verify-doseg/scripts/session.sh
ab open https://doseg.localhost/

# Search by line number: type, then read the listbox.
ab find role combobox fill "107" --name "Pretraži adrese, linije i stanice"
ab wait 1000
ab snapshot -i -c          # listbox with option "107 RT Jankomir - Žitnjak-okr."
ab find role option click --name "107 RT Jankomir - Žitnjak-okr."   # or: ab click @e5, ref from that snapshot
ab wait --url "**/linije/107"
ab find role heading text --name "Linija 107"   # "Linija 107: RT Jankomir - Žitnjak-okr.."

# Alias search (stop, not line).
ab open https://doseg.localhost/
ab find role combobox fill "kvatric" --name "Pretraži adrese, linije i stanice"
ab wait --text "Kvaternikov trg"

# Address search hits /api/adrese; rows land on /adresa/[slug].
ab find role combobox fill "Savska cesta" --name "Pretraži adrese, linije i stanice"
ab wait 1500 && ab snapshot -i -c

# Whole page, plus the console and network check.
.claude/skills/verify-doseg/scripts/snap.sh / --full --name home

# The old map URL must still redirect.
curl -skI "https://doseg.localhost/?lat=45.81&lon=15.98" | head -3   # 308/301 -> /karta
```

## Gotchas

- The line/stop index is **lazy-fetched on first focus** (`/api/search-index`,
  about 1200 stops). Fill and then wait; asserting immediately after `fill`
  races the fetch.
- Base UI's Autocomplete owns the keyboard model. `fill` works; if a custom
  input ever swallows keys, fall back to `ab focus` plus
  `ab keyboard inserttext`.
- Filtering is normalised (`lib/normalize.ts`), so `kvatric` and `kvatrić`
  both match. Test the unaccented form too.
- Desktop and mobile render **different** sections (`DesktopLineSection` vs
  `MobileLedger`). Verify both with `ab set device "iPhone 12"` when you touch
  either.
- Rows are links, not buttons: a search proof ends on the destination page, not
  on the dropdown.
