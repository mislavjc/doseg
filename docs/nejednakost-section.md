# Nejednakost — section plan

> Built from a 10-persona reader-interest brainstorm (`/workflows` run wf_a49c328c). A single tight section can carry **2 ideas + a kicker** — ranking matters more than coverage.

## Thesis
The transit network meant to *equalize* the city is more unequal than wages — and you pay the same fare for 7,4× less city.

## Opener (whole section)
> **Zagreb svima prodaje isti pola sata i istu kartu od 10 € — ali ne i isti grad.**
> *(Zagreb sells everyone the same half hour and the same ticket — but not the same city.)*

## What the section carries (proposed: 1 + 2 + 4 + caveat)

- [ ] **A · LEAD — the ticket as a receipt** *(rank 1, all 10 personas, asset already built)*
  - Hook: **Ista karta. Sedam puta manje grada.**
  - Visual: two identical 10 € ZET stubs side by side, each stamped with the reach it actually buys — fat blue cloud (Donji grad) vs thumbprint (Podsljeme). Flip caption to **€ per reach**.
  - Reframes bad transit as a hidden surcharge you already pay.

- [ ] **B · BACKBONE — reach is unequally shared (Lorenz/Gini)** ⚠️ *reframed — see below*
  - ⚠️ **VERIFIED FALSE:** real reach Gini = **0,26** (pop-weighted), not 0,31 — and it is **below** Croatia's income Gini (~0,29). The *"unequal as money"* line is dead. Reframe options:
    - (a) drop the income comparison; present Gini 0,26 + the Lorenz curve as "real but moderate."
    - (b) lead with the **Lorenz fact** instead (compute exact: *bottom half of people get ~X% of the reach*).
    - (c) swap in the **verified surprise** as the backbone: *Donji grad's worst quartile still out-reaches the average resident of every other district* (and only ~4% of the city lives with core-level reach).
  - Visual: Lorenz curve, shaded Gini **0,26**.

- [ ] **C · KICKER — most people, fewest reach (Sesvete)** *(rank 4, the screenshot stat)*
  - Hook: **Najviše ljudi, najviše stanica, skoro najmanje grada.** — *Sesvete: 70.800 ljudi, 313 stanica, 17/100.*
  - Visual: paired bars — population + stop-count spike, reach score flatlines. "more stops ≠ more reach", correlation ≈ 0.

- [ ] **D · FINE PRINT — the honest caveat** *(rank 7, credibility multiplier)*
  - One line: **Donji grad ne dosegne 7,4× više ljudi — nego 7,4× više karte.** Score counts 200 m cells; a Sljeme forest cell counts like a downtown block — *and the gap still holds after population-weighting.*

## Alternates (swap in if we change the mix)
- rank 3 — **Inequality starts before you board** (walk distance + transit desert; tactile, explains mechanism)
- rank 6 — **Same 30 minutes, not the same city** (time-poverty; bridges money↔distance)
- rank 5 — **The average is a lie** (pola Zagreba ispod prosjeka) — best as a caption on the ranking, not a module
- rank 8 — **The evening makes it worse** (unequal after-dark collapse) — expandable / deep-dive only

## Surprising takeaways (surface where they fit)
- Reach is more unequal than income (Gini 0,31 > ~0,29) — the equalizer is more unequal than wages.
- More stops ≠ more reach — Sesvete = most people + most stops, ranks 15/17.
- Even Donji-grad's *worst* quartile out-reaches the *average* resident of every other district.

## Data — VERIFIED against `data/district-scores.json` (200 m cells = 0,04 km²/cell)
- [x] **Gap 7,4×** ✓ — Donji grad 2391 cells = **95,6 km²** → Podsljeme 320 cells = **12,8 km²** (7,47×)
- [x] **Sesvete** ✓ — pop **70.800**, **313 stops**, score **17**, rank **15/17** (exact)
- [x] **Walk** ✓ — Donji grad **139 m** vs Podsljeme **645 m** (4,6×) · desert **1% vs 57%** · city desert **42%**
- [x] **City avg 42,6** · **6/17** > 50 · **11/17** below avg · **20,8%** of pop (~160k) in <25 districts ✓
- [x] **Evening drop** ✓ — Donji grad −17% vs NZ-istok −32 / Peščenica −30 / Donja Dubrava −28
- [x] **BAJS** ✓ — +43% Trešnjevka-sjever core vs +4–7% Sesvete/Brezovica/Podsljeme (regressive)
- [x] ⚠️ **Reach Gini = 0,26** (pop-weighted) — NOT 0,31, and BELOW income ~0,29 → kills the "unequal as money" line
- [ ] **Real ranking + names** (replaces my placeholder 94/88/83…): Donji grad **100** · Trnje 83 · Trešnjevka-sjever 62 · **Novi Zagreb-istok 56** · Gornji grad-Medveščak 52 · Trešnjevka-jug 52 · Donja Dubrava 42 · Stenjevec 41 · Maksimir 40 · Novi Zagreb-zapad 36 · Peščenica-Žitnjak 33 · Podsused-Vrapče 31 · Črnomerec 31 · Gornja Dubrava 20 · Sesvete 17 · Brezovica 17 · Podsljeme 13 — **update the ljestvica everywhere**
- [ ] still TODO: confirm Croatia income Gini figure from a real source (StatCroatia/Eurostat) before any income mention

## Design / build tasks
- [ ] Flatten the existing `Nejednakost` artboard (Lorenz/Gini + ticket) to the new flat/halftone language (mono labels, sharp corners, tabular numerals)
- [ ] Build the two-stub ticket comparison (reuse `ticket_eur.png`)
- [ ] Sesvete paired-bar kicker
- [ ] Drop the section onto the page between the ranking and the footer (TOC item `02 nejednakost`)
- [ ] Mobile pass
