# Promjene (ZET changelog) — plan & handoff

A "what changed in ZET" changelog page (`/promjene`): new/removed lines, route changes,
stop changes — each with a **before/after map** (the unique value nobody else makes).

## STATUS — tracer shipped 2026-06-16

The announcement-driven `/promjene` is **live** (proto promoted; `app/promjene-proto` deleted;
added to `SiteNav` LINKS). What exists now:
- **Page**: `app/promjene/page.tsx` (announcement-first cards, reverse-chronological, source links,
  per-line before/after maps + stats) + `app/promjene/diff-map.tsx` (the kept MapLibre component).
- **Data**: `data/promjene/entries.json` (curated spine — 3 verified entries: 101→Šestine,
  145+147 ukinute, with real ZET source URLs), `data/promjene/geom/diff-<line>.json` + `index.json`.
- **Generators** (TS, port to Rust later): `scripts/promjene/build-geometry.ts <oldDir> <newDir>`
  (announcement-keyed geometry — picks the most-stops trip per dir; draws stop-connected when GTFS
  has no shape; labels tips by headsign), `scripts/promjene/ingest-announcements.ts` (RSS + live
  listing + **Wayback CDX backfill of every izmjene-u-prometu article since 2017** →
  `data/promjene/candidates.json`, classified permanent/review/temporary).
- **Page is a single reverse-chronological timeline**: ~156 `listWorthy` notices as compact rows
  (date · category tag · title→ZET source · line chips), year-grouped 2017→2026; verified `entries.json`
  ones expand inline with their before/after map. Temporary roadworks/events filtered out.
- **Feed-bracketing pipeline**: recovered **24 shapes-bearing feeds (Wayback, ~monthly 2024-10→2026-04)**
  → `/tmp/feeds/registry.json` (rebuild: `/tmp/fetch-feeds.ts` + `build-registry.ts`). HARD FLOOR: GTFS
  shapes don't exist before 2024-10 (older feeds have no `shapes.txt`). `build-geometry.ts` now
  auto-brackets each change (removed=latest-feed-with-line, new=earliest, diff=transition-search for the
  feed pair with the biggest stop-change near the date — announcement date ≠ GTFS change date). Geom keyed
  `<id>-<line>`; page auto-features any change with geometry + generates a clean Croatian headline.
- **Maps = 6** (101, 145, 147, 207, 6, 228). HONEST CEILING: that's ~all the GTFS supports — lowering the
  diff threshold adds nothing (skipped = no-diff or pre-2024-10). The 156-item list is mostly stop moves +
  temporary changes; real route changes are a handful/year. The pipeline auto-maps future feed rolls.
- **Next** (other "best ever" pillars): cinematic maps (prije/poslije wipe slider, auto-zoom to the
  changed segment); per-change `/promjene/<slug>` pages + baked before/after OG cards; dashboard/filters.
  Going beyond 2024-10 for maps needs OSM route-relation history (GTFS shapes don't exist that far back).

Original prototype/handoff notes below (kept for the hard-won lessons).

## THE decision (read this first)

**Architecture: announcement-driven, GTFS-illustrated.** Do NOT treat a GTFS feed-diff as
the source of truth. ZET's official announcements are the spine; GTFS only draws the
before/after map and confirms the change landed.

Why: we spent a long session proving that **deriving "what permanently changed" from two
GTFS feeds is unreliable, full stop.** Every data-only signal got fooled. Only ZET's own
words gave correct answers.

### What does NOT work (don't redo these)
- **Shape-diff / "dominant pattern" per line** — a line has many shapes (full route, short-turns,
  depot runs, works diversions). The "most common" one flips between feeds → phantom changes.
  This produced a fake "Tramvaj 2 produžen" (it never changed: long_name + headsigns identical).
- **Headsign per direction** is better but still fooled: line **217** flipped on a literal
  244-vs-244 trip-count tie (two-branch line).
- **Calendar-permanence** (is the pattern active across the whole feed window?) is fooled by
  **long roadworks**: a months-long diversion looks permanent inside one feed.
- **The baseline feed itself can be a disrupted snapshot.** The 2025-04 feed had line **149**
  temporarily split for roadworks (→ 149 Kuniščak–Vidovčica + temp line **152** Vidovčica–Vrhovec,
  from 8.9.2025). Diffing against it manufactured a fake "149 produžen" and "152 ukinuta."
- An 8-agent adversarial workflow + RSS still rated 149/152 "high confidence" — **only
  cross-referencing ZET's website/news caught them.**

### Verified-real changes for the 2025-04 → 2026-03 roll (the ONLY ones that cleared official sources)
- **101**: Britanski trg – Gornje Prekrižje → **Britanski trg – Šestine** (od 16.2.2026; +Šestinski vrh/vijenac/centar). Confirmed by ZET's line PDF.
- **145** (Vrapčanska aleja–Oranice) and **147** (–Dolec) **ukinute** od 8.12.2025 (low ridership; function moved to line 143). Confirmed by news.
- Dropped as fake/temporary: 2, 3, 6, 149, 152, 162, 207, 217, 295.

## How to build it (announcement-driven pipeline)

1. **Ingest ZET announcements** → one record per change: { lines[], date, permanent|temporary, title, body, url }.
   - RSS: `https://www.zet.hr/rss_promet.aspx` (traffic changes) + `rss_novosti.aspx` (news).
   - Archive: `https://www.zet.hr/aktualnosti/izmjene-u-prometu/31` (paginated). Wayback those pages for history.
   - Extract line numbers via `linij[ae]?\s*(\d+)` (NOT bare numbers — titles contain dates like "15. lipnja").
   - Classify temporary if body matches `privremeno|zbog radova|obustav` etc.
2. **For each PERMANENT announcement**, pull the affected lines' before/after geometry from the
   feed just-before and just-after the change date → the diff payload (old/new shape, stops, terminals).
3. **Render** = the announcement (headline, why, source link) + the MapLibre before/after map.
   ZET's text IS the description (correct Croatian, the why) — no template/LLM needed.

**Optional GTFS backstop:** snapshot every feed forward; flag a line only when its canonical
state (headsign + served stop_ids) **transitions and holds across several feeds** (persistence).
A held transition with no announcement = "review." A blip that reverts = ignore. This catches
under-announced changes without being the spine.

A **workflow** fits: fan out over announcements → parse/classify each → fetch geometry for
permanent ones → emit entries.

## Data assets

- **Current feed**: `data/gtfs/zet.zip` (v000385, valid from 2026-03-11). `zet.hr/gtfs-scheduled/latest`.
- **Historical feeds (Wayback, free) — only some have `shapes.txt`:**
  - 2025-04 v000368: `https://web.archive.org/web/20250406111856id_/https://zet.hr/gtfs-scheduled/latest` (has shapes)
  - 2026-05 v000388: `https://web.archive.org/web/20260509204133id_/...` (has shapes; newer than current)
  - 2023-03 v000334: `https://web.archive.org/web/20230310203201id_/...` (**NO shapes** — unusable for geometry)
  - Transitland has 88 archived ZET versions but historical downloads need a paid/Hobbyist-Academic plan.
- **Official line route/stop PDFs**: `https://www.zet.hr/UserDocsImages/Autobusne%20linije%20-%20rasporedi/<N>.pdf` (great per-line cross-reference).
- NOTE: the audit feeds lived in `/tmp/zold` (2025-04) and `/tmp/znew` (current) — **ephemeral**, re-download from Wayback if needed.

## Existing prototype & infra to reuse

- **`app/promjene-proto/page.tsx`** — the page (editorial layout, `SiteNav`, Croatian copy, "kako čitati kartu" key with Central icons, delta rows). Visually solid; data is from the BAD diff so the *entries are wrong*.
- **`app/promjene-proto/diff-map.tsx`** — the good part: live **MapLibre** (CARTO Positron) before/after map. Modes `diff|new|removed`; retired route = slate dotted ghost, current = blue; stations snapped onto the line; flag (`IconFlag1`) = new terminus, ban-sign (`IconCircleBanSign`) = discontinued; loop-line dedupe of coincident origin/terminus; cooperative scroll; homepage-matching `MapTile` zoom control. **Keep this; just feed it real data.**
- `scripts/proto/feed-diff.ts` — the BAD detector (shape-diff). Reference only / delete.
- `scripts/proto/detect-changes.ts` — robust-signal detector from the workflow (route_id + long_name + headsign + calendar). Better, but still not a source of truth — use as the GTFS backstop, not the spine.
- `scripts/proto/zet-notices.ts` — RSS ingest + line/date matcher (works; matched 295 to its notice).
- `scripts/proto/audit-changes.ts` — the long_name/headsign audit.
- Reuse: `lib/map-styles.ts` (Positron), `components/home/ui/controls.tsx` (MapTile/MapTileButton),
  `@central-icons-react/square-outlined-radius-0-stroke-2`, the line-page hero pipeline
  (`scripts/build-line-heroes.ts`, `app/linije/line-hero.tsx`) for baked OG cards.
- Design locks: 16px/12px only, no rounded corners, Zagreb-blue `#0E51C9`, ink `#0A0A0A`,
  muted `#6A7178`, slate(retired) `#565E68`, hairline `#E5E8EC`; Heros (display) + Geist Mono (labels).

## Open decisions for the fresh chat
1. Confirm announcement-driven spine (recommended) vs GTFS-diff-with-persistence.
2. Backfill scope: how far back to scrape ZET announcements (RSS+Wayback ~2–3 yrs).
3. Build the ingest → classify → geometry → render pipeline (a workflow fits).
4. Real route `/promjene` (add to `SiteNav` LINKS) vs keep `/promjene-proto`.
5. Generators belong in the Rust transit crate per repo convention (committed `data/*.json`).
