# Statistika — build plan (Paper → code)

> Port the new **editorial single-page** `/statistika` from Paper into the codebase, piece by piece.
> Design source: Paper file `01KT9PGV8516RES8Q0NVF9X168` ("Doseg — Statistika ideation").
> **Desktop artboard:** `1O2-0` "Hero v2 — karta gore, tekst dolje" (1440×6113).
> **Mobile artboard:** `21H-0` "Statistika — Mobile V2" (390×5941).
> Companion docs: [statistika-redesign.md](./statistika-redesign.md) (strategy/cuts), [design-system.md](./design-system.md) (locked tokens).

## What changes

The current `/statistika` is a **4-tab dashboard** (`StatSectionTabs` + 5 `SectionGroup`s, ~28 sub-sections). The new design is **one scrollable editorial story** — full-bleed map hero → ~620px article column with a few data break-outs. No tabs, no boxed KPI cards.

Two decisions (locked):
- **Maps = hybrid.** Hero = baked dither PNG (decorative). Choropleth (povezanost) + matrix map = **live interactive SVG** from `data/districts.geojson`, hover-linked. 3D score-terrain = baked iso render *or* faux-3D SVG (start flat, swap later).
- **Deep-dive sections → `/statistika/podaci`.** The ~28 cut sections (network structure, route stats, centrality, BAJS detail, matrix tables, per-route freq/speed, etc.) move to a new route, linked from the methodology note + footer. Nothing deleted.

### New page section order (desktop `1O2-0` = mobile `21H-0`)

| # | Section (Paper node) | Kind | Interactive? |
|---|---|---|---|
| 0 | **Map band** `1O3-0` — dither hero + contained nav + logo | hero | nav only |
| 1 | **Sadržaj** `1PB-0` — title, lead, "što znači bod", in-page nav | intro | anchor nav |
| 2 | **Povezanost** `1YV-0` — 17-row ranking board + score-terrain map + stats | data break-out | **hover-link** |
| 3 | **Nejednakost** `C83-0` — ZET ticket + "Ista karta. 7,4× manje grada." | editorial | no |
| 4 | **Anatomija jaza** `GD8-0` — kicker / transition | editorial | no |
| 5 | **Pristup** `CCT-0` — walk-to-stop comparison bars | data | no |
| 6 | **Matrica putovanja** `EDT-0` — from-district picker → travel times + choropleth | data break-out | **dynamic** |
| 7 | **Jutro vs. večer** `F3Y-0` — dumbbell, % evening drop | data | no |
| 8 | **Sesvete** `ELG-0` — example-district callout | editorial | no |
| 9 | **Zaključak** `GDD-0` — conclusion | editorial | no |
| 10 | **Metodologija** `FTO-0` — how-we-compute + chips + caveats | editorial | no |
| 11 | **Footer** `BXB-0` — izvori / preuzmi / doseg / ažurirano + logo | footer | links |

---

## Design system recap (from [design-system.md](./design-system.md))

- **Type — two families, ~two sizes.** `TeX Gyre Heros` (Regular 400 / Bold 700) for all prose, hooks, stat numbers — hierarchy from **weight + colour + space, not size**. `Geist Mono` (12px, tabular) for eyebrows, nav, labels, units, data cells. No serif, **no all-caps** ([[no-all-caps-text]]).
- **Colour.** ink `#0A0A0A` · body `#2A2F35` · muted `#6A7178` · faint `#9AA0A6` · ground `#FFFFFF` · hairline `#ECEEF0`/`#E4E7EA` · Zagreb blue `#0E51C9` · navy `#0E3FB0` · ranking ramp `#0E3FB0 → #F4F8FE` (navy→pale by score).
- **Sharp corners** on all data blocks (no border-radius). White space is the layout.
- **Spacing — 8px base.** Section vertical padding **80px**; article column **~620px**, data break-outs **~800px+**; page padding 64px desktop / 16px mobile; eyebrow→hook 8px; block→block 20px.

---

## Phase 0 — Tokens & fonts (foundation)

**Goal:** make Heros + Mono + the colour/space tokens available before any component is built.

1. **Fonts.** `TeX Gyre Heros` is **not** a Google font (GUST/URW, open licence) → self-host woff2 via `next/font/local`. `Geist Mono` via the `geist` package or `next/font/google`. Expose `--font-heros` and `--font-mono`; keep Inter as `--font-sans` fallback for the rest of the site.
   - Scope Heros to the statistika route first (route-group `layout.tsx` or a wrapper class), so the rest of the app is untouched until a deliberate site-wide rollout (the map + o-projektu redesigns will follow — see [map-redesign-spec.md](./map-redesign-spec.md)).
2. **Tokens.** Add the locked hex + spacing as CSS vars in `globals.css` (`--ink`, `--body`, `--muted`, `--faint`, `--zg-blue`, `--navy`, `--hairline`, `--rank-0…--rank-100` ramp) and map them into the Tailwind v4 `@theme` block (`text-ink`, `bg-zg-blue`, etc.). Add a `font-heros` / `font-mono` utility.
3. **Ranking ramp helper.** One `scoreColor(score: 0–100)` → ramp hex, shared by ranking board, choropleth, matrix. Put it in `lib/` next to `scoreColor` usages.

**Acceptance:** a throwaway page renders Heros bold + regular and Mono tabular at the right colours; `text-zg-blue`/`bg-hairline` resolve.

---

## Phase 1 — Editorial component system

**Goal:** the small primitive kit every section composes from. Build these **new** (do not mutate `stat-typography.tsx`/`stat-shared.tsx` — the old dashboard keeps running until cutover). Suggested home: `app/statistika/editorial/` (or `components/statistika/`).

| Primitive | Replaces / new | Notes |
|---|---|---|
| `Section` | new | id + `scroll-mt`, 80px rhythm, optional `wide` (800px) vs article (620px) width |
| `Eyebrow` | ~`StatOverline` | mono 12px lowercase faint (`povezanost · 17 četvrti`) |
| `Hook` | ~`StatModuleTitle` | Heros **bold** 16–18px ink — the section headline |
| `Body` / `BodyMuted` | ~`StatBody` | Heros regular 16px, body/muted colour |
| `MonoLabel` / `MonoValue` | new | Geist Mono 12px, `tabular-nums` |
| `Chip` | new | mono in a sharp hairline box (methodology tags) |
| `Hairline` | new | 1px `#E4E7EA` rule |
| `Anchor`/in-page nav | replaces `table-of-contents.tsx` | mono links: povezanost · nejednakost · promet danas · metodologija |

**Reuse:** `cn()`, `fmtHR`, `pct`, `fmtPop` from `stat-data.ts`. **Drop** the slate palette, rounded corners, gradient accents, `SectionGroup` numbering.

**Acceptance:** a Storybook-less scratch render of each primitive matches the Paper type/colour; eyebrow→hook→body spacing matches.

---

## Phase 2 — Page shell, nav & hero

**Goal:** the frame + the signature hero. Tracer bullet for the whole page.

1. **Shell.** New `EditorialShell` — full-bleed white, no gray card, no rounded container (replaces `Shell`). Page `max-width` content column centered; hero breaks full-bleed.
2. **Hero map band** (`1O3-0`): full-bleed baked **dither PNG** of central Zagreb (blue-on-white edge map; pipeline in [[zagreb-dither-map-pipeline]] — output to `public/`, e.g. `e_hero.png`). Bottom fade to white via the asset and/or a CSS gradient (`Cloud` frame `1O5-0`).
3. **Nav** (`1O6-0`): contained (~640px, text-column width), absolutely positioned over the hero, **ASCII corner brackets** `⌜ ⌝ ⌞ ⌟`, logo (3D halftone "D" mark) + mono links `karta · statistika · tramvaji · o projektu` (active = bold). Sticky behaviour TBD — start static-over-hero per mock.
4. **Mobile hero** (`21I-0`): 350px band; includes status bar (`get_guide topic:"mobile-status-bar"`), `Nav M` + `Nav M bar` ("izbornik").

**Data:** none (static asset + links).
**Acceptance:** hero renders full-bleed at 1440 and 390, nav legible over the map, fade reads clean, no layout shift.

---

## Phase 3 — Intro / "Sadržaj" (`1PB-0`)

**Goal:** title block + the score primer + the in-page section nav.

- Title `Statistika dostupnosti zagrebačkog prijevoza`, lead `Koliko je grada dostupno iz vaše četvrti u 30 minuta…`, sub-block **`Što znači bod`** + 2 paras incl. the hook `Razlika među četvrtima je golema: iz najbolje povezane… 7,4× …`.
- In-page nav row (mobile `BWU-0`): `povezanost · nejednakost · promet danas · metodologija` anchor links.

**Data:** `base.best`, `base.bestPct`, `base.worst`, and a **decimal ratio** (see Data wiring). `data.maxMinutes`.
**Acceptance:** copy + numbers match; anchors jump to sections 2/3/?/10.

---

## Phase 4 — Povezanost: ranking board + score-terrain (`1YV-0`, hover `6DO-0`)

The flagship data break-out. Two columns on desktop; stacked on mobile (`BSK-0`).

### 4a. Ranking board (`ljestvica`) — new `RankingBoard`
- **All 17** districts, sorted by score desc. Columns: `NN` rank (mono) · name (Heros) · **`raspon iznutra`** mini box-whisker · `bod` score (mono regular, tabular). Header row `ljestvica dosega / raspon iznutra / bod`.
- Box-whisker per row = within-district spread, normalised to the 0–100 score axis: whiskers `min…max`, box `p25…p75`, centre tick `median` — from `minReachableCells / p25ReachableCells / medianReachableCells / p75ReachableCells / maxReachableCells`.
- Row background = ramp by score; **top 2 rows** filled solid blue with white text (per mock). Sharp corners, mono tabular scores.

### 4b. Score-terrain map + stats (left)
- **Map:** interactive flat **SVG choropleth** from `districts.geojson`, ramp by score, hover-linked to the board (`6DO-0`: hovering a row highlights the polygon and vice-versa). *Faux-3D / baked iso render is an optional visual upgrade — ship flat-SVG first.*
- **Stat list (mono):** `iznad 50  6/17` · `prosjek  43/100` · `slab doseg  21%` · `ažurirano  lipanj 2026.`

**Data:** `data.districts` (score + reachable-cell percentiles), `base.goodDistricts.length` (6), city avg score (43), poor-pop `21%`, `base.generatedLabel`. Geometry: `data/districts.geojson` (reuse the projector logic from `scripts/build-district-map-svg.ts`).
**Reuse:** ramp `scoreColor` (Phase 0). **New:** `RankingBoard`, `DistrictChoropleth` (shared with Phase 6), a `useLinkedHover` context.
**Acceptance:** 17 rows in correct order with whiskers; hovering syncs map↔row both ways; mobile stacks map over board.

---

## Phase 5 — Easy static editorial sections (batch)

Low-risk, build together once Phase 1 primitives exist. Each = Eyebrow + Hook + Body, ~620px.

- **Nejednakost** (`C83-0`): ZET **ticket photo** (untouched asset, tilted `-2.5deg`, soft shadow) above `nejednakost` / **`Ista karta. 7,4× manje grada.`** / para with `95,6 km²` vs `12,8 km²` / muted Donji-grad-`4%` line. → asset needed: original ticket image to `public/`.
- **Anatomija jaza** (`GD8-0`): `anatomija jaza` / `Jaz nije samo bod.` / transition line. Pure static.
- **Sesvete** (`ELG-0`): `primjer · sesvete` / hook + 3 stat chips (population, stops, score/rank) + para. Data: `Sesvete` district lookup.
- **Zaključak** (`GDD-0`): `zaključak` / `Doseg je vrijeme, ne udaljenost.` + para (mobile adds `Bolji vozni red ne dodaje grad — vraća vrijeme.`).
- **Metodologija** (`FTO-0`): `metodologija` / `Kako računamo doseg` + para + **Chip row** `30 min · raster 200 m · radni dan 08:00 · OSM + GTFS · ZET + HŽPP · 0-100` + hairline + `uz oprez` caveat bullets + link to `/statistika/podaci`. Data: `maxMinutes`, `departureWindow`, cell size.

**Data:** km² = `avgReachableCells × 0.04` (200 m cell). Sesvete fields from `data.districts`.
**Acceptance:** copy/numbers match; ticket tilt + shadow read; chips sharp-cornered.

---

## Phase 6 — Pristup bars + Matrica explorer

### 6a. Pristup (`CCT-0`) — new `RangeBars`
- Three lollipop/range rows: `Donji grad 139 m` (blue), `prosjek grada 337 m` (gray), `Podsljeme 645 m` (blue); end-cap tick + value. Bar length ∝ metres. Caption `…4,6× dulja na rubu…`.
- **Data:** `desert.stopDistSorted` / `d.avgNearestStopM`; city avg; `4,6× = 645/139`.

### 6b. Matrica putovanja (`EDT-0`) — new `TravelMatrixExplorer` (client)
- `iz [Donji grad ▾]` select → ranked list of the **16 other** districts by travel time (min) ascending; row band ramp (closer = darker); header `do kvarta / min`; origin row pinned ("ovdje si"). Min/max axis ticks (`0 … 74`).
- Side **choropleth** shaded by **time from origin** (darker = closer), origin marker `○ ovdje si`, legend `tamnije = bliže`. Reuse `DistrictChoropleth` with a time ramp.
- Caption `Iz centra je gotovo cijeli grad unutar sata…`.
- **Data:** `travelMatrix.matrix[originIdx][*]`, `travelMatrix.districts`. Client component (`"use client"`) for the select + linked map.

**Acceptance:** changing origin re-sorts the list and recolours the map; selected origin marked; values match `travel-matrix.json`.

---

## Phase 7 — Jutro vs. večer dumbbell (`F3Y-0`)

- New `DumbbellChart`: per district a track with two dots — `jutro 8 h` (ink) and `večer 21 h` (blue) — connected by a line, sorted by **% drop** desc, `−NN%` label at right. Legend `● jutro 8 h  ● večer 21 h`. 17 rows (mobile abbreviates names).
- **Data:** `d.avgReachableCells` (morning) vs `d.eveningAvgReachableCells`, `d.peakOffpeakDrop`; dot x-position ∝ reachable area. Reuse `evening.eveningRankedByDrop`.

**Acceptance:** order + percentages match; dots/line align to a shared axis across rows (fixed-width lanes).

---

## Phase 8 — Footer (`BXB-0`)

- New `EditorialFooter`: 4 mono columns — **izvori** (`zet gtfs · gtfs-rt`, `openstreetmap`, `otp · dzs 2021`) · **preuzmi** (`rezultati.csv`, `izohrone.geojson`, `metoda.pdf`) · **doseg** (`karta`, `o projektu`, `github`) · **ažurirano** (`lipanj 2026.`). Hairline, then logo line `Doseg · statistika dostupnosti zagrebačkog javnog prijevoza`.
- Wire `karta`→`/`, `o projektu`→`/o-projektu`, downloads → real endpoints (csv/geojson export — confirm routes exist or stub). Mobile (`CC6-0`) = 2×2 columns.

**Acceptance:** links resolve or are clearly stubbed; columns align in mono lanes.

---

## Phase 9 — Deep-dive relocation `/statistika/podaci`

- New route `app/statistika/podaci/page.tsx`. Move the cut sections (network, route stats, centrality, BAJS detail, travel-matrix tables, peak/weekend, density, desert, variance, freq, line-speed, lorenz/gini, delay, fleet, occupancy) here, reusing the **existing** section components mostly as-is (keep `stat-shared`/`stat-typography` for this page, or restyle later).
- Keep `loadAllData()` — it already computes everything these need.
- Link from methodology + footer (`metoda.pdf` / "puna analiza").

**Acceptance:** `/statistika/podaci` renders the old content; no orphaned imports; old `/statistika` no longer imports the moved sections.

---

## Phase 10 — Cutover, mobile pass, QA

1. **Swap** `app/statistika/page.tsx` to compose the new sections; delete the tab nav usage. Old components now live only under `/podaci`.
2. **Mobile sweep** against `21H-0`: 80px rhythm, 16px padding, stacked povezanost, abbreviated dumbbell labels, 2×2 footer, status bar + `izbornik` nav.
3. **QA checklist:**
   - [ ] No all-caps anywhere ([[no-all-caps-text]]).
   - [ ] Heros/Mono load with no FOUT; `tabular-nums` on every number column.
   - [ ] Sharp corners on all data blocks; ramp colours match `scoreColor`.
   - [ ] Hover-link (povezanost) + dynamic recolour (matrica) work with keyboard + `prefers-reduced-motion`.
   - [ ] `revalidate`/metadata/OG carried over (`opengraph-image.tsx`; OG variants exist in Paper `GBV-0`).
   - [ ] `bun run typecheck` + `lint` clean; a11y: alt text on hero/ticket, anchor focus states, skip-link still works.
   - [ ] Numbers reconcile with live data (not hard-coded): ratio 7,4×, avg 43, 6/17, 21%, km² pair, 4,6×, evening %s.

---

## Data wiring — already-there vs. new

**Already in `loadAllData()` / `data.districts`:**
- Ranking + within-district spread → `score`, `min/p25/median/p75/maxReachableCells`.
- Choropleth/terrain geometry → `data/districts.geojson` (+ `public/district-emblems.json`, `build-district-map-svg.ts` projector).
- Matrix → `travel-matrix.json` (`matrix`, `districts`, `walkDistanceMatrix`).
- Evening drop → `eveningAvgReachableCells`, `peakOffpeakDrop` (`evening.eveningRankedByDrop`).
- Walk-to-stop → `avgNearestStopM` (`desert.stopDistSorted`).
- Equity → `giniData`; pop %s from `base`.
- Sesvete / methodology facts → `data.districts`, `maxMinutes`, `departureWindow`, `generatedLabel`.

**New small derivations:**
- **Decimal ratio** `7,4×` — `base.ratio` is `Math.round(best/worst)`. Add `ratioExact = best.avgReachableCells / worst.avgReachableCells`, format `fmtHR(_, 1)`.
- **km² conversion** — `avgReachableCells × 0.04` (200 m cell ⇒ 0.04 km²/cell). Add a `CELL_KM2` constant; verify `best ⇒ ~95,6`, `worst ⇒ ~12,8`.
- **Time ramp** for matrix choropleth (distinct from score ramp).

**New assets:** dither hero PNG ([[zagreb-dither-map-pipeline]]); ZET ticket photo; optional baked 3D iso terrain.

---

## Build order & open notes

**Order (tracer-bullet):** Phase 0 → 1 → 2 (hero end-to-end) → 3 → 5 (static batch, fast wins) → 4 (ranking + hover map) → 6 (matrix explorer) → 7 (dumbbell) → 8 → 9 (relocate) → 10 (cutover/QA). Phases 5 can run in parallel with 4 once primitives land.

**Open notes (resolve while building, not blocking):**
- **"promet danas"** appears in the in-page nav but has **no dedicated section** in `1O2-0`. Options: reuse the existing live punctuality strip as a small section, or drop the nav item. Decide at Phase 3.
- **3D terrain**: ship flat interactive SVG first; baked iso render is a visual-polish follow-up.
- **Fonts**: confirm TeX Gyre Heros woff2 self-host + licence; scope to `/statistika` before any site-wide rollout.
- **Sticky nav** behaviour over the hero — match mock (static) first, revisit if it feels off on long scroll.
