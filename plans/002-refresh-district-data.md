# Plan 002: Refresh district statistics and keep them fresh (enable REGEN_DISTRICTS)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 2936ac2..HEAD -- scripts/regen-data.sh lib/district-scores.ts app/statistika/editorial/facts.ts scripts/regen-data-gate.py`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches the server data pipeline; a bad regen bakes wrong numbers)
- **Depends on**: none (001 recommended first so refreshed pages carry corrected copy)
- **Category**: bug (data freshness) + pipeline
- **Planned at**: commit `2936ac2`, 2026-07-11

## Why this matters

The site's flagship statistics are four months stale while its detail pages
are current, and the pages cross-link:

- `data/district-scores-wednesday.json` → `generatedAt: 2026-03-20`
- `data/district-scores.json` (legacy pooled build) → `generatedAt: 2026-03-21`
- `data/linije/index.json` and `data/stanice/index.json` → `generatedAt: 2026-06-24`

/statistika and /kvartovi render March numbers; the /linije and /stanice pages
they link to render June numbers. The /statistika footer discloses only
"ažurirano ožujak 2026" (month precision). For a submission to the mayor's
office, a reader comparing a kvart's headway against a linked line's headway
can hit contradictions, and "March" undermines the whole dataset's credibility
in July.

The infrastructure to fix this already exists but is switched off: the weekly
server-side regen (`scripts/regen-data.sh`) has a `REGEN_DISTRICTS=1` branch
that regenerates district/network/route stats and per-day scores, gated
fail-closed by `scripts/regen-data-gate.py`. It is off pending a dry run.
This plan does the dry run, fixes footer date precision, and hardens the
loader against silently serving the legacy pooled file.

## Current state

- `scripts/regen-data.sh:74-84` - the opt-in branch:

  ```bash
  # Heavier district/network/route + per-day scores need OSM + walk-graph (present
  # on the server). Off by default until the exact multi-day recipe is confirmed in
  # a dry-run; enable with REGEN_DISTRICTS=1.
  if [ "${REGEN_DISTRICTS:-0}" = "1" ]; then
    echo "==> Regenerating district/network/route stats + centrality"
    scorer --centrality
    for d in monday wednesday saturday; do
      echo "==> Regenerating district scores for $d"
      scorer --day "$d"
    done
  fi
  ```

  The script already stages `data/district-scores*.json`, `data/route-stats.json`,
  `data/network-stats.json`, `data/centrality-stats.json` (lines ~104-112),
  pins `GENERATED_AT` for determinism, refuses weekend runs, refuses a
  walk-only isochrone fallback, and runs the fail-closed gate. It runs ON THE
  SERVER in `/opt/doseg` after `scripts/refresh-gtfs.sh`.

- `lib/district-scores.ts:23-40` - `loadScores()` prefers
  `district-scores-wednesday.json` and **silently falls back** to the legacy
  pooled `district-scores.json` when the day build is missing:

  ```ts
  const day = readJsonCached<ScoreData>(join(dir, "district-scores-wednesday.json"))
  const base = readJsonCached<ScoreData>(join(dir, "district-scores.json"))
  if (!day) return base
  ```

  The file's own doc comment explains the pooled file produces a fake "~1 min"
  median headway and ~2x reach. Serving it silently would be worse than a 404.

- `app/statistika/editorial/facts.ts:94-97` - footer date drops the day:

  ```ts
  const updated = new Date(data.generatedAt).toLocaleDateString("hr-HR", {
    month: "long",
    year: "numeric",
  })
  ```

  Note `app/statistika/stat-data.ts:186-189` already formats a day-precise
  `generatedLabel` with `{ day: "numeric", month: "long", year: "numeric" }` -
  match that.

- Known gotcha from the project's history (treat as law): the LOCAL dev OTP
  runs an OLDER GTFS feed than the committed data. District regeneration must
  run on the production server pipeline, never from a local machine, and its
  output must never be committed from a local run.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `bun run typecheck` | exit 0              |
| Lint      | `bun run lint`      | exit 0              |
| Build     | `bun run build`     | exit 0              |
| Data date check | `python3 -c "import json;print(json.load(open('data/district-scores-wednesday.json'))['generatedAt'])"` | prints the generation date |

## Scope

**In scope**:
- `app/statistika/editorial/facts.ts` (date precision)
- `lib/district-scores.ts` (loud fallback)
- `scripts/regen-data.sh` and/or the invoking automation (flip the default,
  ONLY in step 4 after a verified dry run)
- Documentation of the server dry-run procedure (this plan is the record)

**Out of scope** (do NOT touch):
- `transit/src/**` - the scorer already supports `--day`; no Rust changes.
- `data/*.json` - never hand-edit; new data arrives only via the server regen
  branch + PR.
- `scripts/regen-data-gate.py` - the gate's thresholds are calibrated; widening
  them to make a regen pass is exactly the failure mode the gate exists to stop.
- `.github/workflows/deploy.yml`

## Git workflow

- Branch: `advisor/002-refresh-district-data`
- Commit style: conventional commits, e.g. `fix(statistika): day-precise footer date`,
  `feat(regen): enable district regeneration in the weekly roll`
- Do NOT push or open a PR unless the operator instructed it. Steps 3-4
  require the operator (server access) - this plan marks them explicitly.

### Step 1: Day-precise footer date

In `app/statistika/editorial/facts.ts` change the `updated` formatter to
include the day, matching `stat-data.ts:186-189`:

```ts
const updated = new Date(data.generatedAt).toLocaleDateString("hr-HR", {
  day: "numeric",
  month: "long",
  year: "numeric",
})
```

The existing comment about the trailing period ("hr-HR already renders the
year with a trailing period") stays true; adjust its wording only if needed.

**Verify**: `bun run typecheck && bun run build` → exit 0. The /statistika
footer in the build output shows e.g. "20. ožujka 2026." instead of
"ožujak 2026":
`grep -o "ažurirano" -A2 .next/server/app/statistika.html | head` shows a
day number (exact grep may need adapting to the HTML structure; the check is:
the rendered `updated` string contains a day).

### Step 2: Make the legacy-pooled fallback loud

In `lib/district-scores.ts`, when the wednesday build is missing and the
loader is about to serve the legacy pooled file, log an unmistakable warning
(server-side `console.error`) so a deploy with missing day data is visible in
logs rather than silently wrong:

```ts
if (!day) {
  if (base) {
    console.error(
      "district-scores: day-filtered build missing; serving LEGACY POOLED data with known-fake headways. Fix the data files."
    )
  }
  return base
}
```

Do not throw: /statistika degrading to legacy numbers with a screaming log is
preferable to the page 500ing for visitors.

**Verify**: `bun run typecheck && bun run lint` → exit 0.

### Step 3 (OPERATOR, on the server): dry-run district regen

This step needs production server access (`/opt/doseg`) and cannot be done by
a code-only executor. Procedure for the operator:

1. Confirm the isochrone is healthy and transit-backed:
   `docker compose exec -T isochrone curl -sf http://localhost:3001/health`
   must NOT contain `"fallback":true`.
2. Run the regen with districts enabled on a weekday (the script refuses
   weekends):
   `REGEN_DISTRICTS=1 scripts/regen-data.sh`
3. The gate (`scripts/regen-data-gate.py`) must pass. Inspect the branch it
   pushes (`update-gtfs-data` by default) and sanity-check the diff of
   `data/district-scores-wednesday.json`:
   - `generatedAt` is current,
   - `departureWindow` still `07:30-08:30`,
   - district count still 17,
   - median headways are plausible (minutes, not ~1),
   - top-district score is 100 and the ranking is broadly stable (large
     reshuffles need investigation, not merging).
4. Merge the data PR through the normal review flow; deploy happens on merge.

**Verify**: after deploy,
`curl -s https://doseg.hr/statistika | grep -o "ažurirano[^<]*"` shows the
new date.

### Step 4 (after step 3 succeeds once): make it the default

Only after one verified green run: enable districts in the weekly roll by
setting `REGEN_DISTRICTS=1` in whatever invokes `scripts/regen-data.sh` on the
server (check `scripts/refresh-gtfs.sh` and any systemd unit/cron on the host
for the call site), or change the script default from `:-0` to `:-1` and
update the comment at `scripts/regen-data.sh:74-76` to say districts are on by
default and why.

**Verify**: next scheduled Monday roll produces either "No material change" or
a data PR containing `data/district-scores-wednesday.json` alongside
`data/linije/` - the two families can no longer drift apart by months.

## Test plan

No unit tests apply (pipeline + formatting change). The gate script is the
regression net for data quality; steps 3-4 verification is operational.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run typecheck`, `bun run lint`, `bun run build` all exit 0
- [ ] Footer `updated` string includes a day number
- [ ] `lib/district-scores.ts` logs an error before serving the legacy file
- [ ] (Operator) `data/district-scores-wednesday.json` `generatedAt` is within
      7 days of the latest `data/linije/index.json` `generatedAt`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The gate fails during the server dry run - report the gate output verbatim;
  do NOT loosen the gate.
- District scores reshuffle dramatically vs March (top-3 changes or any
  district moves more than ~10 ranks): could be a real network change or a
  methodology bug - needs human review before publishing.
- The isochrone health endpoint reports `"fallback":true`.
- You are an automated executor without server access: complete steps 1-2,
  mark 3-4 BLOCKED (operator) in `plans/README.md`, and stop.

## Maintenance notes

- Once districts regen weekly, the "Donji grad is 100" copy fixed in plan 001
  stays robust to ranking changes.
- The legacy pooled `data/district-scores.json` still backfills day-independent
  spatial fields (`areaKm2`, BAJS density) in `loadScores()`. After a full
  regen where the day build carries those fields itself, a follow-up can
  delete the legacy file and the backfill block entirely - deferred because
  it needs the regenerated data first.
- Watch the first two automated rolls: byte-identical output on an unchanged
  feed should produce "No material change" (determinism holds for the district
  passes too - `GENERATED_AT` is pinned, but rayon-parallel float summation
  order is worth one observation).
