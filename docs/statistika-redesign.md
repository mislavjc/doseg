# Statistika — redesign plan (locked)

> Goal: cut the current `/statistika` from **~28 sections** down to **one focused, scannable story**.
> Keep the signature visuals; push the deep technical analysis into an optional deep‑dive / expandables.
> Designed in Paper first (file: "Doseg — Statistika ideation"), then ported to React.

## Design system (locked)
- **Type:** TeX Gyre Heros — Regular (400) + Bold (700) only. Hierarchy from weight + one gray, low size variance. **No all‑caps** (except the LED board, which is imagery).
- **Color:** white `#FFFFFF` ground · ink `#0A0A0A` · gray `#6A7178` / `#9AA0A6` · accent **Zagreb blue `#0E51C9`** · LED amber `#FF7308` (departure board only).
- **Signatures:** (1) blue **dithered/edge map of central Zagreb** as the hero (blue lines on white, pixel‑cloud fade into content); (2) **ZET amber dot‑matrix departure board** for the district ranking.
- **Layout:** full‑width map hero → nav pill (matched width) → centered ~600px article column with the **TOC floating left**. Data viz can break out wider/dark.
- **Mono:** Geist Mono for small data labels; Silkscreen for the LED board.

## Current page (observed live, doseg.localhost/statistika)
- Nav = **4 pill tabs**: `Trenutno stanje` · `Mreža i dostupnost` · `Mikromobilnost` · `Dodatno` — the ~70 headings hide under these.
- Clean but **heavily boxed**: centered white card on gray, big sans title, KPI grid of stat cards.
- Real numbers to reuse (not placeholders): city average **43/100**; **6 of 17** četvrti score >50; **~21%** of population in low‑access (<25) četvrti; best↔worst reach gap ≈ **7×** (morning).
- Lots of all‑caps eyebrows (`TOČNOST POLAZAKA`, `NAJVEĆI PAD NAVEČER`, …) → drop per the no‑caps rule.

## New page outline — KEEP & design (in order)
1. **Hero** — dithered Zagreb map, pill nav, headline built on the **7,4× reach gap** (best vs worst četvrt). ✅ designed
2. **Intro + TOC** — left TOC (≤5 items), 600px article ("Što znači bod"). ✅ designed
3. **Ranking** — district scores as the **LED departure board** (all 17). Desktop horizontal dot‑bars; mobile stacked **segmented** bars. ⏳ needs all 17 + final mobile bar lock
4. **Choropleth** — map of the 17 gradske četvrti shaded by score (blue ramp), hover = score + name. 🔲 to design
5. **Nejednakost (equity)** — the core argument: Gini/Lorenz curve + transit‑desert callout + the **ZET ticket** (same 10 € everywhere, reach depends on district). Ticket ✅, rest 🔲
6. **Promet danas (optional)** — tiny live punctuality strip ("radi li promet danas?"), GTFS‑RT. 🔲 to design or cut
7. **Metodologija + podaci** — short note + open‑data downloads + link to full deep‑dive. 🔲 minimal

## CUT / DEFER (→ optional `/statistika/podaci` deep‑dive or expandables)
- Network structure: centrality, density scatter, network stats, tortuosity, stop spacing
- Service detail: route stats tables, fleet deployment, occupancy
- Travel matrix 17×17
- BAJS detail (utilization, impact) → one small callout, or its own page
- Per‑route: frequency, line speed, variance, delay propagation, alerts
- Peak/off‑peak, weekend ratio, HŽ train, tram frequency → fold a single line into ranking/methodology, else cut

## Design task checklist
- [x] **Ranking + Choropleth COMBINED into one "Povezanost kvartova" section** (option A): sticky 3D map (height=score) + colour legend + 7,4× gap on the left, full 17‑row amber LED board on the right; linked hover (district lights on map + row together). On the live page, desktop + mobile. ✅
- [x] Choropleth — built as a 3D extruded map (three.js, `/tmp/render3d.js`), stylized flat‑iso + edges + shadow
- [x] LED board: all 17 rows (`/tmp/ledboard2.py`, no‑bar `board17.png`; `HILITE` arg highlights a row)
- [x] Equity "Nejednakost": Lorenz/Gini chart (Gini 0,31) + the **ticket** (fairness: same 10 €, 7,4× reach). Built, not yet on page.
- [ ] Methodology / footer (downloads)
- [ ] Live‑status strip (or cut)
- [ ] TOC reduced to the kept sections
- [ ] Integrate Nejednakost onto the page; full top‑to‑bottom review
- [ ] Then: port to code (LED board = canvas component, 3D map, `loadScores()`)

## Implementation notes (when porting from Paper)
- **Map** = generated raster (CARTO `dark_nolabels` → edge‑detect → Bayer dither → blue/white duotone) OR a styled MapLibre layer; pixel‑cloud fade = a generated PNG overlay.
- **LED board** = a client `<canvas>` component (rasterize text → grid → dots + glow), live data from `loadScores()`, responsive (mobile drops the bar column / stacks). NOT a baked PNG.
- Data already loaded in `app/statistika` via `loadScores()` / `loadAllData()`.
