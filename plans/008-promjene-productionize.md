# Plan 008: Productionize the live /promjene changelog (commit the WIP refactor, repo-contained pipeline, weekly ingest automation)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 58b9341..HEAD -- scripts/promjene scripts/lib app/promjene data/promjene docs/promjene-changelog-plan.md .github/workflows/update-data.yml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt (pipeline hygiene) + dx
- **Planned at**: commit `58b9341`, 2026-07-17

## Why this matters

The `/promjene` page (announcement-driven ZET network changelog with
before/after GTFS maps) is already live on production: `app/promjene/` is
committed, the route is in the sitemap (`app/sitemap.ts:22`) and in the nav
(`app/statistika/editorial/site-nav.tsx:17`). But the pipeline that feeds it
is half in the working tree and half in `/tmp`: a library refactor of the
generator scripts is uncommitted, the plan document itself is untracked, and
the GTFS feed registry the geometry generator needs lives at
`/tmp/feeds/registry.json`, built by scripts that are not in the repo at all.
The candidates list also goes stale: nothing re-runs the announcement ingest,
so new ZET notices never appear on the page without a manual local run. This
plan makes the pipeline reproducible from the repo and keeps the timeline
fresh automatically.

## Current state

Relevant files:

- `app/promjene/page.tsx`, `timeline.tsx`, `diff-map.tsx`, `lib.ts` - the
  live page (committed, working). Do not modify.
- `scripts/promjene/build-geometry.ts` - geometry generator; **modified in
  the working tree** (refactored to import from `scripts/lib/gtfs-feed.ts`).
  Reads the feed registry:
  - `build-geometry.ts:23`: `const REGISTRY = "/tmp/feeds/registry.json" // [{version, validFrom, dir, hasShapes}], sorted by validFrom`
  - `build-geometry.ts:47`: `if (!registry.length) throw new Error("no feeds in registry — run /tmp/fetch-feeds.ts first")`
- `scripts/promjene/ingest-announcements.ts` - announcement scraper (RSS +
  live listing + Wayback CDX); **modified in the working tree** (refactored
  to import from `scripts/promjene/rss.ts`). Writes
  `data/promjene/candidates.json`.
- Untracked new files that the modified scripts import:
  - `scripts/promjene/rss.ts` - RSS parsing + classification primitives
  - `scripts/lib/gtfs-feed.ts` - GTFS feed loader + genDiff/genOneSided
  - `scripts/lib/gtfs-csv.ts` - CSV parsing (splitCsv, readCsv, streamCsv)
  - `scripts/lib/geo-line.ts` - projection/simplify/snap geometry helpers
  - `docs/promjene-changelog-plan.md` - the feature's design doc (untracked!)
- `scripts/promjene/extract.ts` - LLM extraction of notice bodies via Vercel
  AI Gateway; needs the `AI_GATEWAY_API_KEY` env var (secret, lives in
  `.env.local` - never commit or print its value).
- `scripts/promjene/eval/` - gold-standard eval corpus for the extractor
  (committed).
- `data/promjene/entries.json` - 3 curated, hand-verified entries;
  `candidates.json` - 717 scraped candidates (28 listWorthy);
  `geom/` - 6 geometry files + `index.json`.
- `.github/workflows/update-data.yml` - weekly feed roll (Mon 03:00 UTC):
  downloads GTFS, regenerates page data on the server, opens an
  `update-gtfs-data` PR.
- **Also untracked but OUT of scope**: `scripts/proto/`, `data/proto/`,
  `index.html`, `.paper-assets/`, `.agents/`, `AGENTS.md`, `skills-lock.json`
  and other working-tree noise. Do not commit these.

Registry provenance (from `docs/promjene-changelog-plan.md`, STATUS section):
24 shapes-bearing archived feeds (Wayback, ~monthly 2024-10 to 2026-04) were
downloaded by `/tmp/fetch-feeds.ts` and indexed by `/tmp/build-registry.ts`
into `/tmp/feeds/registry.json`. Those two scripts exist only in `/tmp` on
the maintainer's machine. GTFS shapes do not exist before 2024-10 (hard
floor for maps).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run lint` | exit 0 |
| Tests | `bun run test` | all pass |
| Ingest (network) | `bun scripts/promjene/ingest-announcements.ts` | rewrites `data/promjene/candidates.json`, count >= 717 |
| Geometry (needs registry) | `bun scripts/promjene/build-geometry.ts` | no error; geom files unchanged unless feeds changed |

## Scope

**In scope** (the only files you should modify/add):
- `scripts/promjene/*` (commit modified + untracked, add moved registry tools)
- `scripts/lib/gtfs-feed.ts`, `scripts/lib/gtfs-csv.ts`, `scripts/lib/geo-line.ts` (commit)
- `docs/promjene-changelog-plan.md` (commit, plus a short update noting the new paths)
- `.github/workflows/update-data.yml` (add ingest step)
- `data/promjene/candidates.json` (refreshed by ingest runs)

**Out of scope** (do NOT touch):
- `app/promjene/*` - the page is live and correct; no UI changes here.
- `data/promjene/entries.json` - human-curated; only the maintainer adds entries.
- `scripts/proto/`, `data/proto/` - unrelated experiments in the working tree.
- Per-change `/promjene/<slug>` pages, OG cards, wipe-slider maps - future
  work, listed in the design doc's "Next" section, deliberately not here.
- The Rust port of the generators ("port to Rust later" per the design doc).

## Git workflow

- Branch: `advisor/008-promjene-productionize`
- Conventional commits, e.g. `chore(promjene): commit shared gtfs/geo libs and script refactor`
  (match style of `git log --oneline`, e.g. `feat(adresa): ...`, `fix(stanice): ...`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Commit the refactor that is already in the working tree

`git add` exactly these paths and nothing else:
`scripts/promjene/build-geometry.ts`, `scripts/promjene/ingest-announcements.ts`,
`scripts/promjene/rss.ts`, `scripts/lib/gtfs-feed.ts`, `scripts/lib/gtfs-csv.ts`,
`scripts/lib/geo-line.ts`, `docs/promjene-changelog-plan.md`.

Before committing, confirm the refactor is coherent: the modified scripts
must import only from the new libs, and the libs must not import from
anything untracked outside this list.

**Verify**: `bun run typecheck` → exit 0. `git status --short` shows no
remaining `M scripts/promjene/*` lines and none of the out-of-scope paths
staged. `bun run test` → all pass.

### Step 2: Bring the feed-registry tooling into the repo

Check whether `/tmp/fetch-feeds.ts` and `/tmp/build-registry.ts` still exist
on this machine (`ls /tmp/fetch-feeds.ts /tmp/build-registry.ts`).

- If they exist: copy them to `scripts/promjene/fetch-feeds.ts` and
  `scripts/promjene/build-registry.ts`, update any hardcoded `/tmp` paths so
  the default registry location becomes `.cache/feeds/registry.json`
  (`.cache/` is already used for tile caches and is gitignored - confirm
  with `grep cache .gitignore` before relying on it), and change
  `build-geometry.ts:23` REGISTRY constant to read
  `process.env.FEEDS_REGISTRY ?? ".cache/feeds/registry.json"` with a clear
  error message pointing at `bun scripts/promjene/fetch-feeds.ts`.
- If they do NOT exist: STOP condition - report that the registry tooling is
  missing and only do the REGISTRY path parameterization (env var override),
  leaving the default at `/tmp/feeds/registry.json`.

**Verify**: `bun run typecheck` → exit 0. If a registry exists locally,
`bun scripts/promjene/build-geometry.ts` runs without "no feeds in registry".

### Step 3: Weekly announcement ingest in the feed-roll workflow

In `.github/workflows/update-data.yml`, after the existing data-regeneration
step and before the PR is opened, add a step that runs
`bun scripts/promjene/ingest-announcements.ts` and includes
`data/promjene/candidates.json` in the same `update-gtfs-data` PR (the
workflow already adds per-path files; follow the existing `git add` pattern
in that workflow exactly - it was a past bug source, see plans 012/013
history in `plans/README.md`).

Notes:
- The ingest needs only network access to zet.hr and web.archive.org, no
  secrets. Do NOT wire `AI_GATEWAY_API_KEY` into the workflow; LLM
  extraction stays a manual/local step.
- Geometry regeneration (`build-geometry.ts`) stays manual: it needs the
  archived-feeds registry, which CI does not have. State this in a comment
  in the workflow step.

**Verify**: `bunx yaml-lint .github/workflows/update-data.yml` or
`bun -e "const y=await Bun.file('.github/workflows/update-data.yml').text(); require('js-yaml')"`
is NOT available - instead verify with
`python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/update-data.yml'))"`
→ exit 0. Also run the ingest once locally:
`bun scripts/promjene/ingest-announcements.ts` → exit 0 and
`git diff --stat data/promjene/candidates.json` shows a plausible refresh
(candidate count must not shrink below 717; if it does, STOP - the scrape
regressed).

### Step 4: Update the design doc status

Append a short dated paragraph to the STATUS section of
`docs/promjene-changelog-plan.md`: libs extracted to `scripts/lib/`,
registry tooling location, weekly ingest automated, geometry still manual.
Keep the doc's existing voice; no em-dashes in any copy.

**Verify**: `git diff docs/promjene-changelog-plan.md` shows only the
appended paragraph and path updates.

## Test plan

- No new unit tests required for the workflow change.
- Add one vitest test file `scripts/promjene/rss.test.ts` covering
  `scripts/promjene/rss.ts` classification: (1) a permanent route-change
  title classifies as listWorthy/permanent, (2) a roadworks/temporary title
  classifies as temporary, (3) line-number extraction pulls `["101"]` from a
  realistic title. Model the test file structure after the existing vitest
  tests introduced by plan 005 (find them with `git grep -l "from \"vitest\"" -- '*.test.*'`).
- Verification: `bun run test` → all pass including the 3 new tests.

## Done criteria

- [ ] `bun run typecheck`, `bun run lint`, `bun run test` all exit 0
- [ ] `git status --short` shows no modified/untracked files under
      `scripts/promjene/`, `scripts/lib/gtfs-*`, `scripts/lib/geo-line.ts`,
      `docs/promjene-changelog-plan.md`
- [ ] `grep -n "/tmp/feeds" scripts/promjene/build-geometry.ts` returns no
      hardcoded-only path (env override + repo default in place, or the
      Step 2 STOP was reported)
- [ ] `.github/workflows/update-data.yml` contains an ingest step that adds
      `data/promjene/candidates.json` to the weekly PR
- [ ] None of: `scripts/proto/`, `data/proto/`, `index.html`, `AGENTS.md`,
      `.agents/`, `.paper-assets/`, `skills-lock.json` are staged or committed
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The modified `build-geometry.ts` / `ingest-announcements.ts` fail typecheck
  because they import symbols the untracked libs do not export (the refactor
  is incomplete - the maintainer must finish it).
- `/tmp/fetch-feeds.ts` or `/tmp/build-registry.ts` are missing (Step 2
  fallback applies; report it).
- The ingest run returns fewer than 717 candidates or errors on the Wayback
  CDX call.
- Editing `update-data.yml` would require restructuring the workflow's
  existing locking/PR logic rather than adding one step.

## Maintenance notes

- When the maintainer curates a new entry into `entries.json`, they run
  `build-geometry.ts` locally against the registry and commit the new
  `geom/` files; the page auto-features any entry with geometry.
- Future work recorded in the design doc's "Next" section: per-change
  `/promjene/<slug>` pages with baked OG cards, wipe-slider maps, Rust port.
  A follow-up plan should start from there.
- Archived feeds now also accumulate in R2 (`doseg-data-eu/gtfs/zet.zip` is
  uploaded by the backup workflow); a future registry rebuild can source
  from R2 instead of Wayback. Worth noting in the design doc when relevant.
