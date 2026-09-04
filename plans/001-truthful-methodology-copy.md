# Plan 001: Make every methodology claim on /statistika and /stanice match the actual computation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 2936ac2..HEAD -- app/statistika app/stanice`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (truthfulness of published claims)
- **Planned at**: commit `2936ac2`, 2026-07-11

## Why this matters

This site's statistics will be sent to the Zagreb mayor's office. Three claims
on the page do not match the data behind them, and anyone cross-checking will
notice:

1. The copy says reachability is measured "s polaskom radnim danom u 08:00",
   but the data actually averages 5 departures across a 07:30-08:30 window
   (`departureWindow` field in the data file). A single-time snapshot and a
   window average are materially different methodologies.
2. The copy says "Donji grad je 100 po definiciji", but the score is
   normalized to whichever district has the highest reach - Donji grad happens
   to be it today. After a future regeneration another district could top the
   list and the sentence would silently become false.
3. On stop pages, lines whose peak headway could not be computed render a
   dotted leader that ends in nothing, right under a header promising "Brojke
   su tipičan razmak vozila radnim danom u špici". It reads as a rendering bug
   rather than an honest "no data".

## Current state

Files and the exact excerpts to change:

- `app/statistika/editorial/intro.tsx` - intro section. Lines 39-43:

  ```
  Svakom kvartu dodjeljujemo bod od 0 do 100 prema udjelu površine grada
  dostupnom u {maxMinutes} minuta, s polaskom radnim danom u 08:00. Veći
  bod znači da je iz tog kvarta dostupno više grada.
  ```

  The component signature (lines 19-24) currently takes only
  `maxMinutes?: number` and `districtCount?: number`. Note its doc comment
  already claims "departure time" is wired to live data - it is not; this plan
  makes the comment true.

- `app/statistika/editorial/metodologija.tsx` - methodology chips. Lines 8-15:

  ```ts
  const CHIPS = [
    "30 min",
    "raster 200 m",
    "radni dan 08:00",
    "OSM + GTFS",
    "ZET + HŽPP",
    "0–100",
  ]
  ```

  And the caveat at line 18:

  ```ts
  "bod je relativan: Donji grad je 100 po definiciji, ostali se mjere prema njemu.",
  ```

  The `Metodologija()` component takes no props.

- `app/statistika/stat-data.ts:190` - the correct value already exists:

  ```ts
  const displayDepartureTime = data.departureWindow ?? "08:00"
  ```

  It is returned from `computeHeadlineFacts()` (line 214) but never consumed
  by intro or metodologija. The data value is `"07:30-08:30"` (see
  `data/district-scores-wednesday.json`, key `departureWindow`).

- `app/statistika/page.tsx:50` and `:65` - where the components are mounted:

  ```tsx
  <Intro maxMinutes={data?.maxMinutes} districtCount={data?.districts.length} />
  ...
  <Metodologija />
  ```

  Check how `page.tsx` obtains `data` and `facts` (top of the file) - the
  facts object from `computeHeadlineFacts()` carries `displayDepartureTime`.

- The score normalization, for reference (do NOT modify): the Rust generator
  at `transit/src/main.rs:1076` computes
  `r.score = js_round(r.avg_reachable_cells as f64 / max_score as f64 * 100.0)`
  where `max_score` is the best district's reach. So "the best-connected
  district is 100 by definition"; Donji grad specifically is not.

- `app/stanice/sections.tsx:85-109` - `LinijaRow`. The headway span renders
  only when present:

  ```tsx
  {hw && (
    <span className="shrink-0 font-mono text-label text-ink-muted">{hw}</span>
  )}
  ```

  `hw` comes from `lineHeadway()` in `app/stanice/copy.ts:166-170`, which
  returns `null` when both `peakRangeMin` and `allDayHeadwayMin` are null
  (the Rust side returns no headway when fewer than 2 departures fall in the
  window - see `transit/src/route_stats.rs:443-461`).

Repo conventions that apply (from `AGENTS.md`):
- Croatian copy: the word is "kvart" never "četvrt"; no em-dashes anywhere
  (hyphens only); no all-caps; templated names stay in the nominative.
- Text styles: mono labels use `text-label` (12px); body text uses
  `text-body`. Never introduce a new size.
- Editorial pages compose from `app/statistika/editorial/primitives.tsx`.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `bun run typecheck` | exit 0              |
| Lint      | `bun run lint`      | exit 0              |
| Build     | `bun run build`     | exit 0, all pages generate |

## Scope

**In scope** (the only files you should modify):
- `app/statistika/editorial/intro.tsx`
- `app/statistika/editorial/metodologija.tsx`
- `app/statistika/page.tsx` (prop plumbing only)
- `app/stanice/sections.tsx` (the `LinijaRow` headway span only)

**Out of scope** (do NOT touch, even though they look related):
- `app/statistika/stat-data.ts` - `displayDepartureTime` already exists; no
  change needed there.
- `transit/src/**` - the Rust computation is correct; only the copy is wrong.
- `data/**` - committed data files are generated, never hand-edited.
- `app/statistika/editorial/facts.ts` - footer date precision is handled in
  plan 002 alongside the data refresh.

## Git workflow

- Branch: `advisor/001-truthful-methodology-copy`
- Commit style: conventional commits, e.g. `fix(statistika): copy states the real 07:30-08:30 departure window`
  (matches repo history: `fix(seo): ...`, `feat(stanice): ...`)
- Do NOT push or open a PR unless the operator instructed it.

### Step 1: Wire the departure window into Intro

In `app/statistika/page.tsx`, pass the departure window to `<Intro>`. The
facts object from `computeHeadlineFacts()` exposes `displayDepartureTime`
(format `"07:30-08:30"`). Add a prop:

```tsx
<Intro
  maxMinutes={data?.maxMinutes}
  districtCount={data?.districts.length}
  departureWindow={facts?.displayDepartureTime}
/>
```

(If `page.tsx` names the facts variable differently, use that name; it is the
return value of `computeHeadlineFacts`.)

In `app/statistika/editorial/intro.tsx`, extend the props:

```tsx
export function Intro({
  maxMinutes = 30,
  districtCount = 17,
  departureWindow = "07:30-08:30",
}: {
  maxMinutes?: number
  districtCount?: number
  departureWindow?: string
}) {
```

and change the sentence at lines 40-41 to state the window honestly. Target
copy (note "s polascima" plural, since 5 departures are averaged):

```
Svakom kvartu dodjeljujemo bod od 0 do 100 prema udjelu površine grada
dostupnom u {maxMinutes} minuta, s polascima radnim danom u prozoru
{departureWindow.replace("-", " do ")}. Veći bod znači da je iz tog kvarta
dostupno više grada.
```

Compute the `replace` result outside JSX if lint complains about complexity.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Fix the Metodologija chip and the "Donji grad" caveat

In `app/statistika/editorial/metodologija.tsx`:

1. Give the component an optional prop `departureWindow?: string` defaulting
   to `"07:30-08:30"`, and build the chips inside the component so the third
   chip reads `` `radni dan ${departureWindow}` `` instead of the static
   `"radni dan 08:00"`.
2. Change the first caveat (line 18) to be normalization-robust while keeping
   the concrete example. Target copy:

   ```
   "bod je relativan: najbolje povezani kvart (danas Donji grad) je 100, ostali se mjere prema njemu.",
   ```

3. Update the second caveat's "oko 8 h" phrasing only if it now contradicts
   the window; `"jutarnji špic"` alone is fine. Suggested:

   ```
   "jedan snimak: radni dan, jutarnji špic (07:30-08:30); navečer i vikendom slika je drukčija.",
   ```

In `app/statistika/page.tsx`, pass the same value:
`<Metodologija departureWindow={facts?.displayDepartureTime} />`.

**Verify**: `bun run typecheck && bun run lint` → both exit 0.

### Step 3: Honest placeholder for missing headways on stop pages

In `app/stanice/sections.tsx`, replace the conditional headway span in
`LinijaRow` so a null headway renders a muted placeholder instead of nothing:

```tsx
<span className="shrink-0 font-mono text-label text-ink-faint">
  {hw ?? "bez podataka o intervalu"}
</span>
```

Keep the existing `text-ink-muted` class for the has-data case if you prefer
a two-branch render; the requirement is: null headway shows the muted phrase
"bez podataka o intervalu", real headway keeps its current look.

**Verify**: `bun run build` → exit 0. Then confirm one affected page renders
the placeholder:
`bun run build 2>/dev/null && grep -o "bez podataka o intervalu" .next/server/app/stanice/ante-starcevica-45-a.html | head -1`
→ prints `bez podataka o intervalu` (that stop's data at
`data/stanice/ante-starcevica-45-a.json` has a line with both headway fields
null; if the file no longer exists, find another with
`grep -l '"peakHeadwayMin": null' data/stanice/*.json | head -1`).

### Step 4: Full verification

**Verify**: `bun run typecheck && bun run lint && bun run build` → all exit 0.

`grep -rn "u 08:00\|radni dan 08:00" app/statistika/` → no matches.

`grep -rn "Donji grad je 100 po definiciji" app/` → no matches.

## Test plan

No test infrastructure exists yet (plan 005 adds vitest). Verification here is
typecheck + lint + build plus the greps above. If plan 005 has already landed,
add one test to the copy test file asserting `lineHeadway` null-handling stays
null (the placeholder lives in JSX, not the helper).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run typecheck` exits 0
- [ ] `bun run lint` exits 0
- [ ] `bun run build` exits 0
- [ ] `grep -rn "radni dan 08:00" app/` returns no matches
- [ ] `grep -rn "Donji grad je 100 po definiciji" app/` returns no matches
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" don't match the live code (drift).
- `computeHeadlineFacts()` is not available in `app/statistika/page.tsx` or
  `displayDepartureTime` is absent from its return value.
- `data/district-scores-wednesday.json` has no `departureWindow` key (the
  fallback default `"07:30-08:30"` would then be a guess - report instead).
- Any change would require touching `stat-data.ts` or the Rust crate.

## Maintenance notes

- Plan 002 regenerates the district data; the window value flows from the
  data file, so a future methodology change (different window) updates the
  copy automatically once this plan lands.
- Reviewer should read the rendered Croatian sentences out loud - templated
  copy must stay grammatical ("s polascima ... u prozoru 07:30 do 08:30").
- Deliberately deferred: register consistency (informal "ti" on the homepage
  sidebar vs formal "vi" on /statistika). That is an editorial decision for
  the maintainer, not a bug.
