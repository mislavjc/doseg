# Plan 006: Design-system conformance sweep (font sizes) + dead-code removal

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 2936ac2..HEAD -- app/kvartovi/sections.tsx app/statistika/editorial/metodologija.tsx app/statistika/editorial/footer.tsx app/stanice/stop-hero.tsx components/district-map.tsx package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW-MED (visual changes; each is a 1px-4px size shift that needs a
  quick eyeball, not a redesign)
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `2936ac2`, 2026-07-11

## Why this matters

The repo's design system is unusually strict and documented in `AGENTS.md`:
exactly two text sizes exist - 16px (`text-head`/`text-body`, TeX Gyre Heros)
and 12px (`text-label`, Geist Mono); hierarchy comes from weight/color/space,
never size. A handful of components violate it with arbitrary sizes
(`text-[11px]`, `text-[15px]`, Tailwind default `text-xs`/`text-sm`), which
erodes the one rule that keeps every page looking like one product.
Separately, `components/district-map.tsx` is dead (zero importers) and
`shadcn` (a CLI) sits in runtime dependencies.

## Current state

Design rule, quoted from `AGENTS.md`: "Two font sizes, period: text is always
16px, dropping to 12px only when a mono label or data cell needs it. ... No
other size exists." And: "If you add a custom `text-*` utility to `@theme`,
register it in `lib/utils.ts`" (tailwind-merge drops unregistered sizes when
`cn()` merges them - see `lib/utils.ts:10-16`).

Violations to fix:

- `app/kvartovi/sections.tsx` - six `text-[11px]` occurrences (lines ~236,
  237, 250, 255, 262, 495) and one `text-[12px]` (line ~493), all on
  mono-voice labels. Excerpt (lines 236-237):

  ```tsx
  <MonoLabel className="text-[11px]">do kvarta</MonoLabel>
  <MonoLabel className="text-[11px]">min</MonoLabel>
  ```

  Note `MonoLabel` (from `app/statistika/editorial/primitives.tsx`) already
  renders `text-label` (12px); the `text-[11px]` override is the violation.
  `text-[12px]` at line ~493 is redundant with `text-label`.

- `app/statistika/editorial/metodologija.tsx:40`:

  ```tsx
  <MonoLabel className="text-[11px]">uz oprez</MonoLabel>
  ```

- `app/statistika/editorial/footer.tsx` - the brand line and updated stamp
  use Tailwind defaults `text-xs` (12px, acceptable size but should be
  `text-label` for line-height consistency) and `text-sm` (14px - a third
  size, violation):

  ```tsx
  <span className="font-mono text-xs leading-5 text-ink-faint">
  ...
  <span className="font-mono text-sm font-medium leading-tight tracking-[-0.01em]">
  ...
  <span className="font-heros text-xs leading-4 text-ink-faint">
  ```

- `app/stanice/stop-hero.tsx:150` - map label at 15px:

  ```tsx
  className="absolute z-[1] bg-zg-blue px-3 py-1 font-mono text-[15px] leading-5 text-white"
  ```

  Same file line ~145: `stroke="#fff"` hardcoded on the marker circle
  (tokens rule says no hardcoded hex in components; `#fff`/white is still a
  hex literal - use `var(--ground)` or the appropriate token from
  `app/globals.css`).

Dead code / packaging:

- `components/district-map.tsx` - zero importers
  (`grep -rn "components/district-map" app components lib --include="*.tsx" --include="*.ts"`
  finds only the file itself). It renders `/district-map.svg` with an alt
  text describing a green/purple color scheme that contradicts the
  one-blue design - a leftover from an earlier iteration.
- `package.json` - `shadcn: ^4.5.0` in `dependencies`. It is a code-gen CLI,
  imported nowhere (`grep -rn "from \"shadcn\"" .` → nothing outside
  node_modules). `components.json` (its config) stays - the CLI may still be
  used interactively.
- NOT dead, leave alone: `scripts/build-district-map-svg.ts` still runs in
  `dev`/`build` scripts and its SVG output is fetched at runtime by
  `app/statistika/editorial/terrain-view.tsx:188` and
  `app/statistika/editorial/matrica.tsx:192` (they parse shapes and ignore
  fills). `app/karta-tramvaja/` is deliberately hidden legacy - out of scope.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `bun run typecheck` | exit 0              |
| Lint      | `bun run lint`      | exit 0              |
| Build     | `bun run build`     | exit 0              |
| Install (after package.json edit) | `bun install` | lockfile updates cleanly |

## Scope

**In scope**:
- `app/kvartovi/sections.tsx`
- `app/statistika/editorial/metodologija.tsx`
- `app/statistika/editorial/footer.tsx`
- `app/stanice/stop-hero.tsx`
- `components/district-map.tsx` (delete)
- `package.json` + `bun.lock` (move `shadcn` to devDependencies)

**Out of scope** (do NOT touch):
- `app/karta-tramvaja/**` - hidden legacy page, many violations, deliberate
  quarantine; restyling it is wasted effort until its fate is decided.
- `app/api/og/**` - OG cards legitimately use raw values (satori cannot
  resolve CSS vars) and their own size scale (32px/24px) - documented
  exception.
- `scripts/build-district-map-svg.ts` - still a live build step.
- `app/globals.css`, `lib/utils.ts` - no new sizes are being added, so no
  @theme or tailwind-merge changes are needed.

## Git workflow

- Branch: `advisor/006-design-system-conformance`
- Conventional commits, e.g. `fix(design): remove off-system font sizes`,
  `chore: delete unused DistrictMap component`, `chore(deps): shadcn to devDependencies`
- Do NOT push or open a PR unless the operator instructed it.

### Step 1: Replace off-system sizes with text-label

- In `app/kvartovi/sections.tsx` and
  `app/statistika/editorial/metodologija.tsx`: delete the `text-[11px]` and
  `text-[12px]` overrides. `MonoLabel` already applies `text-label`; bare
  `span`s that had `text-[11px]` get `text-label` instead (keep their other
  classes: `tabular-nums`, `opacity-60`, etc.).
- In `app/statistika/editorial/footer.tsx`: `text-xs`/`text-sm` on mono spans
  → `text-label`; the `font-heros text-xs` tagline span → `text-label
  font-mono` OR `text-body` - pick `text-label font-mono` (it is a
  label-voice line). Remove `tracking-[-0.01em]` and `leading-tight` if the
  swap makes them redundant; keep layout classes.
- In `app/stanice/stop-hero.tsx:150`: `text-[15px] leading-5` → `text-label`
  (12/16). Also replace `stroke="#fff"` (line ~145) with
  `stroke="var(--ground)"`.

**Verify**: `bun run typecheck && bun run lint && bun run build` → exit 0.
`grep -rn "text-\[1[0-9]px\]\|text-xs\|text-sm" app/kvartovi/sections.tsx app/statistika/editorial/metodologija.tsx app/statistika/editorial/footer.tsx app/stanice/stop-hero.tsx` → no matches.

### Step 2: Visual spot-check

With the dev server up (`https://doseg.localhost`), load and eyeball:
- `/kvartovi/donji-grad` - travel-time board header labels and rank numbers
  still legible and aligned (the 11→12px change can widen the rank column;
  the `w-5` fixed width may need `w-6` - allowed, it's a layout class).
- `/statistika` footer - brand line still on one line.
- any `/stanice/[slug]` - the blue stop-name label on the hero map still fits
  (12px is smaller than 15px: verify it reads clearly; if it looks broken,
  see STOP conditions).

**Verify**: screenshots or a note per page in the PR description.

### Step 3: Delete dead component, fix packaging

- `git rm components/district-map.tsx`
- In `package.json`, move `"shadcn": "^4.5.0"` from `dependencies` to
  `devDependencies`, then `bun install` to sync `bun.lock`.

**Verify**: `bun run build` → exit 0.
`grep -rn "district-map\"" app components lib` → only the SVG path string
usages (`/district-map.svg`), no component imports.

## Test plan

No unit tests apply (visual + packaging). The build across all SSG pages is
the functional gate; step 2 is the visual gate.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run typecheck`, `bun run lint`, `bun run build` all exit 0
- [ ] `grep -rn "text-\[11px\]\|text-\[15px\]" app/ components/ --include="*.tsx" | grep -v karta-tramvaja` → no matches
- [ ] `components/district-map.tsx` no longer exists
- [ ] `shadcn` is not in `dependencies` (`python3 -c "import json;d=json.load(open('package.json'));print('shadcn' in d['dependencies'])"` → False)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The stop-hero name label at 12px is visually unacceptable on real pages
  (unreadable over the map). The alternatives - keeping 15px or introducing a
  new size token - are design decisions the maintainer must make. Report with
  a screenshot.
- Deleting `district-map.tsx` breaks the build (would mean a dynamic import
  this plan's grep missed - report the importer).
- `bun install` rewrites large unrelated parts of `bun.lock` (bun version
  drift) - commit only if the diff is scoped to shadcn's move.

## Maintenance notes

- Any future `text-[..px]` is a review flag; consider an eslint rule
  (no-restricted-syntax on the pattern) as a follow-up if violations recur.
- `karta-tramvaja` remains quarantined and off-system. When its fate is
  decided (revive or delete), that is the moment to restyle or remove it -
  tracked as a direction question, not debt.
- The district-map SVG's fill colors (green/purple palette inside
  `scripts/build-district-map-svg.ts`) are now provably decorative-only
  (all consumers parse shapes, ignore fills). If the script is ever slimmed,
  that palette can go - deferred as zero-user-impact.
