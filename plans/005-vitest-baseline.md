# Plan 005: Stand up vitest and characterize the Croatian copy templates and pure logic

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 2936ac2..HEAD -- app/linije/copy.ts app/stanice/copy.ts lib/format.ts lib/score-color.ts lib/chart-utils.ts lib/zagreb-time.ts package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (purely additive - config + test files)
- **Depends on**: none (but should land BEFORE any refactor of the copy
  templates, including plan 007)
- **Category**: tests
- **Planned at**: commit `2936ac2`, 2026-07-11

## Why this matters

The repo has zero TypeScript tests. `vitest` sits in devDependencies,
unconfigured and unused. Meanwhile the most embarrassment-prone logic in the
project is pure, deterministic, and trivially testable: the Croatian
pluralization and templated-copy functions that stamp text onto 154 line
pages and ~800 stop pages. One wrong paucal form ("2 polazaka" instead of
"2 polaska") ships to hundreds of indexed pages read by, soon, the mayor's
office. Characterization tests make every future copy or data-shape change
safe, and they are the prerequisite the consolidation refactor (plan 007)
should not proceed without.

## Current state

- `package.json` - `vitest: ^4.1.9` in devDependencies; no `test` script; no
  `vitest.config.*` anywhere. There is one evalite file
  (`scripts/promjene/eval/zet-extract.eval.ts`) - unrelated, leave it alone.
- CI (`.github/workflows/ci.yml`) runs `bun run typecheck` and `bun run lint`
  in the `typecheck` job - the test run slots in there.
- Test targets (all pure functions, no DOM, no mocks needed):
  - `app/linije/copy.ts` - `plural()` (Croatian 1/2-4/5+ forms with the
    11-14 exception), `numberWord()`, `serviceHistogram()`, `peakRange()`,
    intro/copy template builders.
  - `app/stanice/copy.ts` - `lineHeadway()` (null when both headway fields
    null - the honest-placeholder behavior from plan 001 depends on this),
    `dosegCopy()` (templated "dosegneš N stanica" strings), `lineModeNoun()`.
  - `lib/format.ts` - formatting helpers, `pickPreferredRoute()`.
  - `lib/score-color.ts` - `scoreColor()` clamps 0-100, returns 7-char hex;
    `isDarkScore()` boundary.
  - `lib/chart-utils.ts` - `computeXTicks()`.
  - `lib/zagreb-time.ts` - Zagreb-local time helpers (pin dates in tests;
    beware DST boundaries - test one winter and one summer date).
- Path alias: the app imports via `@/` (see `tsconfig.json` `paths`). The
  vitest config must resolve it identically.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `bun run typecheck` | exit 0              |
| Lint      | `bun run lint`      | exit 0              |
| Tests     | `bun run test`      | all pass (after this plan: script exists) |

## Scope

**In scope**:
- `vitest.config.ts` (create, repo root)
- `package.json` (add `"test": "vitest run"` script only)
- `.github/workflows/ci.yml` (add `bun run test` step to the `typecheck` job)
- New test files, colocated: `app/linije/copy.test.ts`,
  `app/stanice/copy.test.ts`, `lib/format.test.ts`, `lib/score-color.test.ts`,
  `lib/chart-utils.test.ts`, `lib/zagreb-time.test.ts`

**Out of scope** (do NOT touch):
- Any source file under test - these are CHARACTERIZATION tests: they pin
  current behavior. If a test reveals what looks like a bug, write the test
  asserting CURRENT behavior with a `// BUG?` comment and list it in your
  final report - do not fix it in this plan.
- `scripts/promjene/eval/**` (evalite, separate system)
- React components, API routes, anything needing jsdom - keep the config
  `environment: "node"`.

## Git workflow

- Branch: `advisor/005-vitest-baseline`
- Conventional commits, e.g. `test: vitest baseline for copy templates and pure lib logic`
- Do NOT push or open a PR unless the operator instructed it.

### Step 1: Config and script

Create `vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["app/**/*.test.ts", "lib/**/*.test.ts"],
  },
})
```

Add to `package.json` scripts: `"test": "vitest run"`.

**Verify**: `bun run test` → "no test files found" exit behavior is
acceptable at this step ONLY; if vitest errors on config parsing, fix before
proceeding.

### Step 2: Croatian pluralization tests (the crown jewels)

`app/linije/copy.test.ts`. Read `plural()`'s signature first (argument order
of the three forms). Cover at minimum, using real words from the codebase:

- 1 → singular: `plural(1, "minuta", "minute", "minuta")` → `"minuta"`
- 2, 3, 4 → paucal: 2 → `"minute"`
- 5, 6, 11, 12, 13, 14 → genitive plural: 11 → `"minuta"` (the 11-14
  exception must NOT take the paucal even though 11 % 10 === 1)
- 21, 22 → back to singular/paucal by last digit: 21 → `"minuta"`, 22 → `"minute"`
- 101, 102, 111 → same rules at three digits
- 0 → genitive plural: `"minuta"`
- Repeat one full set with "polazak"/"polaska"/"polazaka" and
  "stanicu"/"stanice"/"stanica" (the forms used in `app/stanice/copy.ts`).

Also characterize `numberWord()` (and `numberWordF` if exported from either
copy module) for 1-10 and one value beyond its word range, and `peakRange()`
/ `serviceHistogram()` with small synthetic inputs (read the functions to
build minimal valid inputs; if an input shape requires large fixtures, test
only the boundary logic reachable with small ones).

**Verify**: `bun run test` → all pass.

### Step 3: Stop-page copy tests

`app/stanice/copy.test.ts`:

- `lineHeadway`: both fields null → `null`; `peakRangeMin` present → string
  starting `"svakih "`; only `allDayHeadwayMin: 7.4` → `"svakih 7 min"`
  (verify rounding against the implementation).
- `dosegCopy`: reach with `stations30: 1` → hook contains `"1 stanicu"`;
  `stations30: 2` → `"2 stanice"`; `stations30: 5` → `"5 stanica"`;
  `reach: null`-ish input → `null` (match the actual guard).
- `lineModeNoun`: `"tram"` → `"tramvaj"`, anything else → `"autobus"`.

Construct minimal `StopLine`/`StopPageData` objects with `as` casts limited
to the fields the functions read - inspect the type in
`lib/generated/` or the import in `app/stanice/copy.ts` first.

**Verify**: `bun run test` → all pass.

### Step 4: lib pure-logic tests

- `lib/format.test.ts`: each exported function - happy path + one boundary
  (empty `routeNames` → `""` for `pickPreferredRoute`; negative/zero/large
  values for delay formatting; verify Croatian decimal comma where the
  implementation uses `hr-HR` locale).
- `lib/score-color.test.ts`: `scoreColor(0)` → `"#f4f8fe"` (case-insensitive
  compare), `scoreColor(100)` → `"#0e3fb0"`, `scoreColor(-5)` and
  `scoreColor(150)` clamp to those same endpoints, result always matches
  `/^#[0-9a-f]{6}$/i`. `isDarkScore` flips somewhere between 0 and 100 -
  pin the actual threshold.
- `lib/chart-utils.test.ts`: `computeXTicks()` with a small range, a
  single-point range, and an empty range (whatever the signature allows).
- `lib/zagreb-time.test.ts`: pinned instants - one CET winter date, one CEST
  summer date - asserting the Zagreb-local output; no `new Date()` without
  arguments in tests.

**Verify**: `bun run test` → all pass. `bun run typecheck && bun run lint` →
exit 0 (test files are linted too; keep functions under the 90-line lint cap).

### Step 5: CI wiring

In `.github/workflows/ci.yml`, add `- run: bun run test` after
`- run: bun run lint` in the `typecheck` job.

**Verify**: YAML parses (`python3 -c "import yaml,sys;yaml.safe_load(open('.github/workflows/ci.yml'))"`).

## Test plan

This plan IS the test plan. Target: every listed function has at least its
boundary cases pinned; total suite runs in under ~5 seconds.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run test` exits 0 with ≥ 6 test files, all passing
- [ ] The 11-14 Croatian exception is asserted (grep: `grep -rn "plural(11" app/linije/copy.test.ts` matches)
- [ ] `bun run typecheck` and `bun run lint` exit 0
- [ ] CI workflow contains `bun run test`
- [ ] No source file modified (`git status` shows only new files + package.json + ci.yml + vitest.config.ts)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A characterization test reveals `plural()` actually mishandles a case
  (e.g. 11-14): pin CURRENT behavior with `// BUG?`, report it prominently -
  fixing it changes hundreds of live pages and needs the maintainer's eyes.
- vitest cannot resolve the `@/` alias or chokes on a `lib/generated` import
  chain after two config attempts.
- Any function under test imports server-only modules (`node:fs` data
  loaders) transitively in a way that breaks the node environment - exclude
  that one file and report, don't mock.

## Maintenance notes

- Plan 007 (pSEO consolidation) must run AFTER this suite exists - it is the
  safety net for that refactor.
- When the GTFS feed rolls and copy templates gain new branches, extend these
  tests in the same commit - reviewers should treat copy.ts changes without
  test updates as incomplete.
- Deliberately deferred: component/route tests (need jsdom/msw - different
  cost profile), Rust-side tests (plan 003 adds those).
