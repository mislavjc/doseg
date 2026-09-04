# Plan 004: Harden API error responses, geocode CQL escaping, and the CSP

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 2936ac2..HEAD -- app/api Caddyfile`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S (steps 1-2) + M (step 3, needs live verification)
- **Risk**: MED - an over-tight CSP can break the map in production; steps are
  ordered so each is independently shippable
- **Depends on**: none
- **Category**: security (defensive maintenance)
- **Planned at**: commit `2936ac2`, 2026-07-11

## Why this matters

Three defensive gaps, none currently exploited but all cheap to close before
the site gets institutional attention:

1. API routes echo internal exception messages to clients. Messages from the
   GTFS-RT/BAJS fetch stack can reveal upstream URLs, timeouts, and library
   internals - useful reconnaissance, useless to visitors.
2. The DGU geocoder builds a CQL `ILIKE` filter by string interpolation.
   Single quotes are escaped (so there is no filter breakout), but `%` and
   `_` wildcards pass through, letting a caller turn a bounded prefix search
   into pathological wildcard scans against the upstream WFS service.
3. The Content-Security-Policy allows `'unsafe-eval'` in `script-src`.
   Next.js production bundles and MapLibre GL do not need eval; carrying it
   voids much of the CSP's value against injected scripts.

## Current state

- `app/api/bajs/route.ts:20-24` and `app/api/vehicles/route.ts:14-18` - the
  leak pattern (identical shape in both):

  ```ts
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error"
    return Response.json({ error: message }, { status: 502 })
  }
  ```

  (vehicles uses status 500.) Check for the same pattern elsewhere:
  `grep -rn "err.message" app/api/` and treat every hit the same way.

- `app/api/geocode/route.ts:167-191`:

  ```ts
  function toWildcardPattern(q: string): string {
    return q.replace(/'/g, "''").replace(/[cszdCSZD]/g, "_")
  }
  ...
  const escaped = street.replace(/'/g, "''")
  ...
  function buildDGUCql(pattern: string, house?: string): string {
    let cql = `ulica ILIKE '%${pattern}%' AND BBOX(geometry,${ZAGREB_BBOX},'EPSG:4326')`
    if (house) cql += ` AND kucni_broj = '${house}'`
    return cql
  }
  ```

  Note: `toWildcardPattern` INTENTIONALLY inserts `_` for c/s/z/d letters
  (diacritics-insensitive matching) - that behavior must be preserved. The
  problem is only user-typed literal `%`/`_` characters surviving into the
  pattern. `house` is already constrained upstream by
  `parseQuery`'s regex `/^(.+?)\s+(\d+\s*[a-zA-Z]?)$/` (digits + one letter).

- `Caddyfile:13` - current CSP (one line):

  ```
  Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://plausible.io; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https://gbfs.nextbike.net https://overpass-api.de https://*.maplibre.org https://*.maptiler.com wss://*.maplibre.org https://*.cartocdn.com https://*.basemaps.cartocdn.com https://plausible.io; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'"
  ```

Conventions: API routes go through `jsonResponse` from `lib/api-response.ts`
for successful responses - read that file before editing so error responses
stay stylistically consistent.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `bun run typecheck` | exit 0              |
| Lint      | `bun run lint`      | exit 0              |
| Build     | `bun run build`     | exit 0              |
| Caddyfile syntax | `docker run --rm -v "$PWD/Caddyfile:/etc/caddy/Caddyfile" caddy:2 caddy validate --config /etc/caddy/Caddyfile` | "Valid configuration" |

## Scope

**In scope**:
- `app/api/bajs/route.ts`, `app/api/vehicles/route.ts`, plus any other
  `app/api/*` route the `err.message` grep surfaces
- `app/api/geocode/route.ts` (escaping only - no behavior change to
  diacritics matching)
- `Caddyfile` (script-src only)

**Out of scope** (do NOT touch):
- `transit/src/isochrone_server.rs` - its `eprintln!` logging is server-side
  only, not client-facing; fine as is.
- `lib/api-response.ts` - shared success-path helper; changing it risks every
  endpoint.
- Any other Caddyfile directive (compression, routing, other headers).
- Rate limiting, auth, or new dependencies.

## Git workflow

- Branch: `advisor/004-api-security-hardening`
- Commit per step; conventional commits, e.g. `fix(api): generic client errors, log details server-side`
- Do NOT push or open a PR unless the operator instructed it.

### Step 1: Generic client errors, detailed server logs

In each affected route, log the real error server-side and return a fixed
string:

```ts
} catch (err) {
  console.error("bajs route error:", err)
  return Response.json({ error: "Upstream service unavailable" }, { status: 502 })
}
```

Keep the existing status codes (502 for bajs, 500 for vehicles). Repeat for
every hit of `grep -rn "err.message" app/api/` that flows into a Response.

**Verify**: `grep -rn "err.message" app/api/` → no matches that reach a
`Response.json` body. `bun run typecheck && bun run lint` → exit 0.

### Step 2: Escape literal wildcards in the geocode CQL pattern

In `app/api/geocode/route.ts`, strip or escape user-typed `%` and `_` BEFORE
the existing transformations, in both paths (`escaped` and
`toWildcardPattern`). The DGU WFS CQL ILIKE has no standard escape syntax
guarantee, so removal is the robust choice for a street-name search:

```ts
const sanitize = (q: string) => q.replace(/[%_]/g, " ")
```

Apply `sanitize(street)` once where `street` is first derived (after
`parseQuery`), so `escaped`, `wildcard`, and `exactCql` all inherit it. Do
NOT alter `toWildcardPattern`'s c/s/z/d → `_` replacement - that is the
deliberate diacritics feature.

**Verify**: `bun run typecheck` → exit 0. Manual check with the dev server
up: `curl -sk "https://doseg.localhost/api/geocode?q=Ilica%205"` still
returns results (normal query unaffected), and
`curl -sk "https://doseg.localhost/api/geocode?q=%25%25%25"` returns `[]`
or a normal empty result, not an upstream error.

### Step 3: Drop 'unsafe-eval' from script-src

In `Caddyfile:13`, remove `'unsafe-eval'` from `script-src`, leaving
`'unsafe-inline'` in place (Next.js inline bootstrap scripts require it
without a nonce infrastructure, which a static Caddy header cannot provide).

**Verify**:
1. Caddyfile validates (command table above).
2. Live check against the local stack (dev server bypasses Caddy, so this
   must be verified where Caddy fronts the app - if you cannot run the
   docker-compose stack locally, mark this step for operator verification in
   staging/production and say so in the status):
   load `/` (map renders, click produces an isochrone), `/statistika`
   (terrain view renders), `/linije/1` - with DevTools console open; there
   must be no CSP violation errors mentioning `eval`.

## Test plan

No unit test infrastructure for routes yet (plan 005 adds vitest for pure
logic; route handlers stay manually verified). The two curl checks in step 2
are the regression checks - record their outputs in the PR description.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run typecheck`, `bun run lint`, `bun run build` all exit 0
- [ ] `grep -rn "err.message" app/api/` shows no client-visible usages
- [ ] `grep -c "unsafe-eval" Caddyfile` → 0
- [ ] Caddy validate passes
- [ ] Map click still returns an isochrone through Caddy (or step 3 explicitly
      marked operator-verify)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Removing `'unsafe-eval'` produces CSP violations from first-party bundles
  (a dependency genuinely needs eval) - report which script, do not re-add
  silently.
- The geocode sanitization breaks diacritics matching for names like
  "Črnomerec" (test: `curl -sk "https://doseg.localhost/api/geocode?q=Crnomerec"`
  must still return the Črnomerec results).
- You find additional endpoints echoing raw errors outside `app/api/` - note
  them in the report; widening scope needs the maintainer's call.

## Maintenance notes

- If a future dependency needs eval (some WASM loaders do), prefer
  `'wasm-unsafe-eval'` over restoring full `'unsafe-eval'`.
- A nonce-based CSP that also removes `'unsafe-inline'` would require moving
  header emission from Caddy into Next middleware - deferred deliberately:
  larger blast radius, small marginal gain for a mostly-static site.
- Reviewer: check that no error-path change altered a success-path response
  shape - clients parse those.
