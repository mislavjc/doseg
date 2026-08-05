# AGENTS.md — working on doseg

Doseg is a Zagreb transit reachability site: an isochrone map (`/`), an
editorial statistics page (`/statistika`), and 154 statically generated line
pages (`/linije/[broj]`). Next.js App Router + Tailwind v4 on the front, a
Rust crate (`transit/`) for routing and data generation, OpenTripPlanner as
the GTFS source of truth.

## Styling — the rules that are actually enforced

**Two font sizes, period: text is always 16px, dropping to 12px only when
a mono label or data cell needs it.** The 16px voice is TeX Gyre Heros
(`font-heros`) via `text-head` (16/22, pair with `font-bold`) or `text-body`
(16/24). The 12px voice is Geist Mono (`font-mono`) via `text-label` (12/16):
eyebrows, labels, data cells, nothing else. No other size exists. Hierarchy
comes from weight (400/700), colour, and space, never from size. The
utilities are defined in the `@theme` block of `app/globals.css`.
The only sanctioned exception: one display numeral on OG cards (the "30:00"
convention). OG cards are a 600×315 layout shipped @2x, so on them the pair
is 32px Heros Bold / 24px Geist Mono.

**Tokens, not hex.** All colours live as CSS variables in `app/globals.css`
(`--ink`, `--ink-2`, `--ink-muted`, `--ink-faint`, `--ground`, `--hairline`,
`--zg-blue`, `--navy`, `--surface`, `--blue-wash`, `--blue-pale`,
`--ink-ghost`, …) and are mirrored as Tailwind colour utilities in the same
file (`text-ink`, `bg-zg-blue`, `border-hairline-strong`, …). Never hardcode
hex/rgba in components. Satori OG cards can't resolve CSS vars, so
`app/api/og/*.tsx` mirrors the values with a comment pointing back at
`:root` — keep them in sync.

**If you add a custom `text-*` utility to `@theme`, register it in
`lib/utils.ts`.** tailwind-merge can't tell custom sizes from colours; an
unregistered size gets silently dropped whenever `cn()` combines it with a
text colour. This bug once made the whole statistika page render labels at
16px. The `extendTailwindMerge` config in `lib/utils.ts` is the fix — extend
its `font-size` class group.

**Sharp corners everywhere.** No border-radius on boxes, chips, buttons,
rows. Circles (route dots, rail dots) are circles — that's geometry, not
rounding. **No all-caps or tracked-caps labels** — mono lowercase is the
label voice. Light mode only, white ground, one blue.

**Icons come from one Central bundle.** UI icons are
`@central-icons-react/square-outlined-radius-0-stroke-2` (square join +
radius 0 match the sharp design; stroke-2 holds its weight at the 12-20px
sizes the UI uses). Import per icon and colour via text utilities (icons
inherit `currentColor`):
`import { IconBus } from "@central-icons-react/square-outlined-radius-0-stroke-2/IconBus"`
then `<IconBus size={16} className="text-ink-muted" />`. Never add
`@central-icons-react/all` (bundles all 2017 icons in 30 variants) or a
second variant bundle, and prefer a Central glyph over hand-drawing a new
inline SVG. Name quirks: no IconTram or plain IconSearch; use
IconTrainFrontView, IconQuickSearch. The package's preinstall license check
wants `CENTRAL_LICENSE_KEY`, but bun blocks dependency scripts, so `bun
install` (locally, in CI, and in the Docker build) works without it.

**Copy rules (Croatian):** say *kvart*, never *četvrt* (SEO-locked,
masculine declensions). No em-dashes anywhere — hyphens. Templated copy on
pSEO pages keeps stop/terminal names in the nominative ("s terminala
Črnomerec", never "s Črnomerca") — automated declension of 300+ stop names
will embarrass you. Pluralisation goes through `plural()` in
`app/linije/copy.ts`.

## Component kit

`app/statistika/editorial/primitives.tsx` is the kit every editorial page
composes from: `EditorialShell`, `Section` (80px/56px vertical rhythm,
article=620px / wide=840px columns), `Eyebrow`, `Hook`/`PageTitle`, `Body`,
`BodyMuted`, `MonoLabel`, `MonoValue`, `Chip`, `Hairline`. The shared header
band is `editorial/hero.tsx` + `site-nav.tsx` (ASCII corner brackets);
line pages use their own `app/linije/line-hero.tsx` (dithered route-corridor
map with an SVG overlay). Reach for primitives before writing raw `<p
className=...>`.

## Design workflow

Design iterations happen **in Paper first** (file "Doseg — Statistika
ideation"), then get ported 1:1 to code. When porting, pull exact values via
the Paper MCP (`get_jsx`, `get_computed_styles`) — don't eyeball
screenshots. New artboards land on whatever page is open in the Paper app,
so check.

## Data and asset pipelines

- **Committed `data/*.json` comes from the Rust crate** (`transit/src/`),
  which queries OTP GraphQL — never parse the GTFS zip in TS. Line pages:
  `cargo run --release --bin transit-scorer -- --line-pages` (needs OTP on
  :8080 and the isochrone server on :3002; writes `data/linije/`). Types are
  exported to `lib/generated/` via ts-rs (`cargo test` regenerates them) —
  never hand-edit that directory.
- **Visual assets come from `scripts/*.ts`** (bun). Line hero maps:
  `bun scripts/build-line-heroes.ts` — CARTO tiles → building-footprint
  threshold (gray < 6 in the current CARTO dark style) → blue/white duotone
  PNGs in `public/linije/` + crop bounds in `data/linije/hero-meta.json`.
  Parameter signatures make re-runs incremental; tiles cache in `.cache/`.
- Regenerate both when the GTFS feed rolls (feed window is visible in
  `data/linije/index.json`), then commit the outputs — prod gets data and
  images via git → Docker, no upload step.
- **POI popup photos** come from `bun run build:poi-photos` — Overpass
  (POIs with a `wikidata` tag) → Wikidata P18 → Commons thumb URL + credit,
  written to `data/poi-photos.json` (keyed by OSM id, joined at runtime in
  `lib/overpass.ts`). ~25 notable POIs today. Re-run when the POI set
  changes and commit; it hits live APIs so it is never part of `build`.
- **`.dockerignore` allowlists `data/`** — if a page needs a new data file
  at build time, add it there or the server build fails while local builds
  pass.

## Verification before pushing

`bun run typecheck` and `bun run lint` must be clean (lint caps functions at
90 lines — split JSX into subcomponents). Rust: `cargo fmt -- --check` and
`clippy` run in CI. `bun run build` statically generates all line pages, so
it catches data/loader regressions. The dev server runs behind portless at
`https://doseg.localhost` (port 3000 is a different app). Deploys go through
GitHub Actions on push to main with health-check rollback.
