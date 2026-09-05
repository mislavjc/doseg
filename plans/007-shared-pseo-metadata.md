# Plan 007: One shared metadata builder for the three pSEO page families

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 2936ac2..HEAD -- "app/linije/[broj]/page.tsx" "app/stanice/[slug]/page.tsx" "app/kvartovi/[slug]/page.tsx"`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW-MED (SEO metadata regressions are silent; the done criteria
  include a byte-level before/after comparison to rule them out)
- **Depends on**: none (005 recommended first as general safety net, not a
  hard dependency - this plan carries its own output-equality gate)
- **Category**: tech-debt (reuse)
- **Planned at**: commit `2936ac2`, 2026-07-11

## Why this matters

The three statically generated page families (154 line pages, ~800 stop
pages, 17 kvart pages) each hand-roll `generateMetadata` with the same
OpenGraph shape: `title`, `description`, canonical alternate, `type`,
`url`, `siteName: "Doseg"`, `locale: "hr_HR"`, one 1200x630 image. Site-wide
metadata policies (a new OG parameter, twitter card, hreflang) currently mean
three edits that must not drift. Past SEO work (PRs #15, #17, #20) touched
exactly these blocks repeatedly. One builder ends the drift.

Note: the page SECTION components are already properly composed from the
editorial kit (`app/linije/sections.tsx:8` imports `PrevNext as KitPrevNext`
from `app/statistika/editorial/blocks.tsx` and wraps it) - do NOT
"consolidate" those; that was audited and found healthy.

## Current state

All three excerpts verified at commit `2936ac2`:

- `app/linije/[broj]/page.tsx:40-79` - loads data, builds mode-specific
  title, then:

  ```ts
  const ogVersion = loadLineIndex().serviceDates.radniDan
  return {
    title,
    description,
    alternates: { canonical: `/linije/${data.broj}` },
    openGraph: {
      title,
      description,
      type: "article",
      url: `/linije/${data.broj}`,
      siteName: "Doseg",
      locale: "hr_HR",
      images: [
        { url: `/api/og?linija=${data.broj}&v=${ogVersion}`, width: 1200, height: 630 },
      ],
    },
  }
  ```

  Two comments in that function are load-bearing documentation (GSC title
  keyword rationale; the `v` cache-buster rationale) - they must survive the
  refactor, attached to whatever code still expresses those decisions.

- `app/stanice/[slug]/page.tsx:31-57` - identical shape; `type: "article"`,
  image `/api/og?stanica=${data.slug}&v=${ogVersion}` with
  `ogVersion = loadStopIndex().serviceDates.radniDan`.

- `app/kvartovi/[slug]/page.tsx:52-77` - same shape with two real
  differences: `type: "website"` (not "article") and a static image
  `"/og.jpg"` (no `v` param, no per-kvart OG endpoint).

Repo conventions: shared server-side data helpers live in `lib/` (e.g.
`lib/page-data.ts`, `lib/line-data.ts`). Croatian copy strings stay in the
page/copy files, not in lib.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `bun run typecheck` | exit 0              |
| Lint      | `bun run lint`      | exit 0              |
| Build     | `bun run build`     | exit 0              |

## Scope

**In scope**:
- `lib/pseo-metadata.ts` (create)
- `app/linije/[broj]/page.tsx`, `app/stanice/[slug]/page.tsx`,
  `app/kvartovi/[slug]/page.tsx` (the `generateMetadata` bodies only)

**Out of scope** (do NOT touch):
- Titles and descriptions themselves - the Croatian strings and their
  keyword strategy are deliberate; this plan moves structure, not copy.
- `app/statistika/**`, index pages (`app/linije/page.tsx` etc.), `app/api/og/**`
- Section components and the editorial kit (verified healthy).
- JSON-LD builders.

## Git workflow

- Branch: `advisor/007-shared-pseo-metadata`
- Conventional commit, e.g. `refactor(seo): shared metadata builder for pSEO page families`
- Do NOT push or open a PR unless the operator instructed it.

### Step 1: Snapshot current metadata output (the equality gate)

Before changing anything, build and capture the head of one page per family:

```bash
bun run build
for p in linije/1 stanice/$(ls data/stanice | head -1 | sed s/.json//) kvartovi/donji-grad; do
  grep -o '<head>.*</head>' ".next/server/app/$p.html" 2>/dev/null | head -c 4000 > "/tmp/meta-before-$(echo $p | tr / -).html" || \
  python3 - "$p" <<'PY'
import re,sys,glob
p=sys.argv[1]
f=glob.glob(f".next/server/app/{p}.html")[0]
html=open(f,encoding="utf-8").read()
head=re.search(r"<head>.*?</head>",html,re.S).group(0)
metas=sorted(re.findall(r"<(?:meta|title|link)[^>]*>",head))
open(f"/tmp/meta-before-{p.replace('/','-')}.txt","w").write("\n".join(metas))
PY
done
```

(Adapt paths if the build output layout differs; the requirement is: a sorted
list of `<meta>/<title>/<link>` tags per sample page saved to /tmp.)

**Verify**: three non-empty `/tmp/meta-before-*` files exist.

### Step 2: Create the builder

`lib/pseo-metadata.ts`:

```ts
import type { Metadata } from "next"

/**
 * Shared OpenGraph/canonical shape for the pSEO families (linije, stanice,
 * kvartovi). Titles/descriptions stay in each page (keyword strategy is
 * per-family); this owns the structure so site-wide metadata changes are one
 * edit. The og image `v` param (where used) busts X/Telegram per-URL caches
 * when the feed rolls.
 */
export function pseoMetadata(opts: {
  title: string
  description: string
  path: string // e.g. `/linije/1`
  ogType: "article" | "website"
  ogImage: string // full path incl. any `v` cache-buster
}): Metadata {
  const { title, description, path, ogType, ogImage } = opts
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      type: ogType,
      url: path,
      siteName: "Doseg",
      locale: "hr_HR",
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
  }
}
```

**Verify**: `bun run typecheck` → exit 0.

### Step 3: Switch the three callers

Each `generateMetadata` keeps its data loading, notFound guard, title/
description construction, and rationale comments, and ends with a single
`return pseoMetadata({ ... })` call:

- linije: `path: `/linije/${data.broj}``, `ogType: "article"`,
  `ogImage: `/api/og?linija=${data.broj}&v=${ogVersion}``
- stanice: `path: `/stanice/${data.slug}``, `ogType: "article"`,
  `ogImage: `/api/og?stanica=${data.slug}&v=${ogVersion}``
- kvartovi: `path: `/kvartovi/${data.slug}``, `ogType: "website"`,
  `ogImage: "/og.jpg"`

**Verify**: `bun run typecheck && bun run lint` → exit 0.

### Step 4: Prove output equality

`bun run build`, re-run the step-1 extraction into `/tmp/meta-after-*`, then:

```bash
for f in /tmp/meta-before-*; do diff "$f" "${f/before/after}"; done
```

**Verify**: every diff is empty. Any difference at all is a regression -
fix or STOP.

## Test plan

The byte-equality gate in step 4 is the test. If plan 005's vitest setup
exists, additionally add `lib/pseo-metadata.test.ts` asserting the returned
object shape for one article-type and one website-type input.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run typecheck`, `bun run lint`, `bun run build` all exit 0
- [ ] Step-4 diffs are all empty (metadata byte-identical per sample page)
- [ ] `grep -c "siteName" app/linije/\[broj\]/page.tsx app/stanice/\[slug\]/page.tsx app/kvartovi/\[slug\]/page.tsx` → 0 per file (shape now lives in one place)
- [ ] The GSC-keyword and v-param comments still exist somewhere reachable
      (`grep -rn "GSC demand\|busts X/Telegram" app/ lib/` → ≥ 2 matches)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step-4 diffs are non-empty after one fix attempt - report the exact tag
  diff; do not ship "close enough" metadata.
- The build output layout has changed such that step 1 cannot locate the
  rendered HTML (report where the SSG output actually lives).
- You find yourself wanting to also unify titles/descriptions or JSON-LD -
  out of scope, note it and move on.

## Maintenance notes

- Future site-wide metadata additions (twitter cards, hreflang) now happen in
  `lib/pseo-metadata.ts` once. Index pages and /statistika still own their
  metadata - extend the helper to them only if their shapes actually converge.
- Reviewer: the only acceptable diff on the three pages is mechanical
  (call-site swap); any copy change is scope creep.
