# Doseg — Interactive Map Redesign · Build Spec

Reconciles the homepage interactive map (`components/transit-map.tsx`) with the
editorial brand established in `/statistika` and `/o-projektu`: flat, sharp,
TeX Gyre Heros + Geist Mono, Zagreb blue, no glassmorphism. Design source:
Paper file `01KT9PGV8516RES8Q0NVF9X168`, page "Page 1" (artboard index at bottom).

The biggest single win, do this first → **recolor the reach** (`ISOCHRONE_COLORS`)
to the navy→pale ramp. Small change, transforms the live map immediately.

---

## 1. Design tokens

**Type** — two families, restrained sizes.
- `TeX Gyre Heros` — labels/values. Bold 700 for hooks/numbers, Regular for body.
- `Geist Mono` — eyebrows, all numerics that must align (tabular), captions, units.
- Map UI may step a focal number up (readout `30px`, summary `28–34px`); everything
  else stays 12–16px. Mono everywhere a column of numbers must line up.

**Color**
```
Ink            #0A0A0A   text primary
Ink-2          #2A2F35   text secondary
Muted          #6A7178   text tertiary
Faint          #9AA0A6   eyebrow / mono caption
Zagreb blue    #0E51C9   accent / active / links
Navy           #0E3FB0   reach near-end / dest marker
Hairline       #EFF1F4 / #E6E9ED   dividers / borders
Panel          #FFFFFF
Basemap tint   #EAEEF2 (light)  ·  #0B1020 (dark variant, optional)
```

**Reach ramp** (isochrone, near→far) — replaces the amber/red `ISOCHRONE_COLORS`:
```
#0E3FB0 → #335DBD → #6E90D6 → #94ABDF → #A4B8E4 → #C9D6F0 → #DBE4F7
```
Render: grid cells (200 m) filled, ~0.5–0.9 alpha by band, no hard outline. The
blocky edge is on-brand — it is literally the data unit. Validate legibility over
the basemap at z11–14; cap opacity so labels read through.

**Mode-color map** (LOCK — single source, key by GTFS route type):
```
walk   #9AA0A6   (dotted/dashed where it's a connector)
tram   #0E51C9
bus    #5B7FCF
vlak   #2BA88A
BAJS   #E8883C
```

**POI palette** (shared sidebar counts ↔ map markers):
```
bolnica #E05B4F   ·   škola #3D7BD9   ·   park #3FA76B
```

Spacing: 8-pt rhythm. Corners: sharp (0; chips/markers 4–5px max). Elevation: minimal —
1px hairline + a soft shadow only where it must read over the moving map
(`0 2px 12px rgba(15,23,42,.06)`); never glassmorphism/backdrop-blur.

---

## 2. Layout

- **Desktop** — persistent left **sidebar** (372px) = the instrument; map fills the rest.
- **Mobile** — **bottom sheet**; search is a top bar.
- Controls on the map: `Slojevi` (top-right), `polazak` time control (top-right group),
  zoom (bottom-left). Alerts banner top-center when present.

### Input anchoring (layout-stability rule — important)
```
eyebrow (fixed) → INPUT (anchored, top) → content (swaps below)
```
The origin/search field never changes position between states. Empty→reach it only
*fills* (placeholder → address). Reach→route the **destination row expands in place
below** the origin (origin never moves); content reflows under it. This kills the
search-jumping bug. The empty state must NOT put a title above the search.

---

## 3. Panel state machine

| State | Trigger | Sidebar / sheet content |
| --- | --- | --- |
| **empty** | load | eyebrow → search → "klikni" hint → skala dosega; map: radar-pulse |
| **loading** | click point | **skeleton** sized like the readout (km² block + `u dosegu` rows) + `računam…`; map: origin pin radar-pulse. No spinner, no overlay. |
| **reach** | isochrone ready | readout `96 km² · 62% · 11 četvrti`, 15/30/45, `u dosegu` (POI counts w/ dots), legend, stats-CTA (district rank) |
| **route** | click 2nd point inside reach | from→to (grew to 2 rows) + `28 min` summary + **journey strip** + **leg list**; map: route polyline |
| **out-of-reach** | dest beyond reach | calm message (`Izvan dosega za 30 min`, ~Nmin), `Probaj s 45 min →`. No red. |

Skeleton → loaded must morph in place (same layout), no reflow.

---

## 4. Components

- **Chip** (one component, reused): rounded 4–5px, mode bg, white mono-bold line number.
  Itinerary chip and **live-vehicle marker are the same chip** (vehicle gets a shadow
  to read as "live"). Node variants: hollow ring = walk/transfer; filled = ride;
  filled square (navy) = destination.
- **Journey strip**: horizontal flex, segments `flex:N` by minutes, mode colors,
  line number centered on transit segments. **Drop per-segment min labels above ~6
  legs**; keep numbers on transit only; walks stay unlabeled grey.
- **Leg list**: hairline-divided rows — chip · title(Heros 700 15) + sub(mono 12) ·
  duration(mono 13, right-aligned tabular). Locked itinerary = strip (glance) + list (detail).
- **Readout**: eyebrow(mono) · big number(Heros 700) + unit · sub · ramp legend.
- **Stats CTA** (in-panel, contextual): the clicked point's district → rank on the
  ljestvica spectrum (`Donji grad · #1 od 17`) → `Cijela statistika →`. Requires
  point-in-polygon of the click against `districts.geojson`.

---

## 5. Layers (`Slojevi`)

Control top-right; panel = flat toggles + legend. Layers (persist in URL like `bajs`/`poi`):
`Doseg` · `Ustanove` (POI) · `BAJS stanice` · `Vozila uživo` (live vehicles).

Markers, flat-brand:
- **POI** — 13px dot, category color + 2px white ring. Hover → tooltip
  (`KBC Rebro · bolnica · 8 min hoda`); click → popup (place + walk-time + `Ruta do ovamo →`).
- **BAJS** — 16px rounded chip, amber, white `B`. `Ne radi` = white fill / grey outline.
- **Vehicle** — the mode chip with line number + shadow. (Replaces amber blips.)

---

## 6. Departure-time picker (`polazak`)

Separate from the 15/30/45 *duration*. Control `polazak · sada · HH:MM` opens
`Kad krećeš?`: `Sada` (selected) + presets `Jutarnji špic 08:00 · Popodne · Večer 20:00
· Kasna večer`. Note ties to the data story: *"Doseg se mijenja kroz dan — navečer
istok gubi ~⅓."* The map `mrak` toggle is the express version. Drives the real GTFS
schedule → changes the isochrone. (`components/time-picker.tsx`.)

---

## 7. Search autocomplete (`components/address-input.tsx`)

Focused field (blue ring) → dropdown: `Moja lokacija` (geolocate) · `rezultati`
(rows: title + `quartier · type`, category dot, hover row tint `#F4F7FE`) · `nedavno`
(recent). Category dot matches POI palette.

---

## 8. Banners

- **Alerts** (`AlertsBanner`, top-center, when present): white, amber left-rule + `ZET`
  tag + message + dismiss. Calm, not red.
- **Stats nudge**: use the **in-panel contextual CTA** (§4), not a second top banner
  (don't stack two top banners). Corner-card variant only if a louder nudge is wanted.
- **Onboarding modal** (first visit, `OnboardingDialog`): centered over dimmed map,
  dithered tram in the header (the tram appears ONLY here), title + two-step explainer
  + `Kreni →`. `transform-origin: center` (modal).

---

## 9. Mobile bottom sheet

Snap points: **Peek ~14%** (summary only — `96 km²`; map dominant) · **Half ~52%**
(reach readout; default after click) · **Full ~88%** (full route / all steps; map stays
visible on top). Drag snaps; tap handle cycles peek↔half; routes support momentum-dismiss.
Search is the top bar (grows to 2 rows for routing, same anchor rule). See Vaul/the
existing gesture patterns; sheet content = the same components as desktop.

---

## 10. Motion (emil framework — under 300ms where frequent)

| Element | Spec |
| --- | --- |
| panel state change | body cross-fade + `translateY(6px)`, 220ms `cubic-bezier(0.23,1,0.32,1)` |
| itinerary legs enter | stagger 40ms |
| route line draw | `clip-path` left→right ~500ms |
| reach reveal (on load) | cells bloom from origin, stagger ~25ms, total <300ms; skeleton→values cross-fade ~200ms (blur-mask if it shimmers) |
| skeleton shimmer | highlight sweep ~1.2s linear loop |
| pin radar pulse | rings expand+fade ~1.6s loop; empty "klikni" pulse ~1.8s |
| buttons / swap / chips | `:active` `scale(0.97)`, 120–160ms ease-out |
| dest row expand (1→2) | height+opacity ~200ms ease-out |
| popovers (layers, time, autocomplete) | `transform-origin` = trigger, scale `0.97→1` + opacity, 150–200ms ease-out |
| sheet drag | spring/snap; never `scale(0)`; respect `prefers-reduced-motion` |

Use `transform`/`opacity` only; CSS transitions over keyframes for interruptible UI.

---

## 11. Data dependencies / open questions (validate in code)

- Reach ramp legibility across zooms + over basemap; opacity ceiling.
- Marker perf with vehicles + POI + reach + route simultaneously (clustering?).
- Stats-CTA needs point-in-polygon (click → district) against `districts.geojson`.
- All numbers in the mocks (km², %, counts, times) are placeholders → from API.
- Tiny-reach origins (Podsljeme) — confirm readout + small-blob rendering.
- Basemap: keep Carto Positron (`lib/map-styles.ts`) or cool/flatten it so the reach pops.

---

## 12. Paper artboard index (page "Page 1")

- Flow filmstrip: `Tok · 0–4` (onboarding → empty → loading → reach → route)
- Sidebar itinerary explorations: `Sidebar A/B/C` + locked combo on `V2 · ruta`
- Edge case: `V2 · ruta — edge (9 etapa)`
- States: `Prazno (klikni)` · `Učitavanje — skeleton` · `Stanje — doseg/izvan dosega/BAJS ruta`
- Layers: `Slojevi + oznake na karti`
- Time picker: `Polazak — odabir vremena`
- Banners/CTA: `Banneri — upozorenje + statistika CTA`
- Onboarding: `Korak 0 — onboarding modal`
- Input anchoring: `Sidebar — usklađen unos (bez pomaka)`
- Mobile: `M · prazno / doseg (peek) / doseg (otvoreno) / ruta / snap točke`
- Interactions: `Autocomplete + hover stanja`
- Direction comparison (desktop chrome): `V1 / V2 / V3 / V4`
- Assets generated in `/tmp`: `base_light/dark/osm`, `reach_light/dark`, `tram_*` dithers,
  `route_map`, `edge_route`.
