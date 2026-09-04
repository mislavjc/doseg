# Plan 003: Fix the district median-headway bias and document silent None/-1 stat conventions

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 2936ac2..HEAD -- transit/src/main.rs transit/src/route_stats.rs transit/src/network_stats.rs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (one-line math fix + comments + tests; changes published numbers slightly on next regen)
- **Depends on**: none (land before the plan-002 server regen so the fresh data carries the fix)
- **Category**: bug
- **Planned at**: commit `2936ac2`, 2026-07-11

## Why this matters

The Rust crate generates every statistic the site publishes. One computation
is measurably biased and two conventions are undocumented traps:

1. District median headway takes the upper element for even-length inputs
   instead of interpolating, even though a correct `median()` helper exists
   40 lines away in the same file. Published district headways are biased
   upward by up to half a gap.
2. `compute_headway()` returns `None` when fewer than 2 departures fall in
   the peak window - correct, but silent. This is the known source of null
   `peakHeadway` values on pages, and nothing in the code says so.
3. The pulse-hub `hourly_wait` vector encodes "no service this hour" as
   `-1.0` for JSON serialization with no comment or type-level hint;
   a consumer averaging the vector gets garbage.

## Current state

- `transit/src/main.rs:742-746` - the biased median:

  ```rust
  headways.sort_by(|a, b| a.partial_cmp(b).unwrap());
  let median_hw = if !headways.is_empty() {
      headways[headways.len() / 2]
  } else {
      0.0
  };
  ```

- `transit/src/main.rs:384-394` - the correct helper already in the file:

  ```rust
  fn median(sorted: &[f64]) -> f64 {
      if sorted.is_empty() {
          return 0.0;
      }
      let mid = sorted.len() / 2;
      if sorted.len() % 2 == 1 {
          sorted[mid]
      } else {
          (sorted[mid - 1] + sorted[mid]) / 2.0
      }
  }
  ```

  Check `median()`'s visibility: it may be `fn` (private to main.rs), in which
  case the fix is a straight call; if the call site is in another module,
  adjust visibility minimally.

- `transit/src/route_stats.rs:443-461` - `compute_headway`:

  ```rust
  pub(crate) fn compute_headway(
      departures: &[f64],
      start_sec: Option<f64>,
      end_sec: Option<f64>,
  ) -> Option<f64> {
      ...
      if filtered.len() < 2 {
          return None;
      }
      let total_gap: f64 = filtered.windows(2).map(|w| w[1] - w[0]).sum();
      Some(total_gap / (filtered.len() - 1) as f64 / 60.0)
  }
  ```

- `transit/src/network_stats.rs` around lines 1430-1434 - NaN → -1 encoding
  in pulse hub `hourly_wait` (locate with
  `grep -n "is_nan" transit/src/network_stats.rs`).

Conventions: CI runs `cargo fmt -- --check`, `cargo clippy -- -D warnings`,
and `cargo test` on `transit/` (see `.github/workflows/ci.yml`). The only
existing unit tests live in `transit/src/rt_store.rs` (two `#[test]` fns) -
use their placement style (a `#[cfg(test)] mod tests` at the bottom of the
file under test).

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Format    | `cargo fmt --manifest-path transit/Cargo.toml -- --check` | exit 0 |
| Lint      | `cargo clippy --manifest-path transit/Cargo.toml -- -D warnings` | exit 0 |
| Tests     | `cargo test --manifest-path transit/Cargo.toml` | all pass |

## Scope

**In scope**:
- `transit/src/main.rs` (median fix + tests for `median`/`percentile` if not present)
- `transit/src/route_stats.rs` (doc comment + tests for `compute_headway`)
- `transit/src/network_stats.rs` (comment on the -1 convention only)

**Out of scope** (do NOT touch):
- `data/*.json` - do NOT regenerate data locally; the local OTP feed is older
  than the committed data. New numbers arrive via the server regen (plan 002).
- `lib/generated/**` - ts-rs output; regenerating types is unnecessary here
  (no type shapes change).
- The variance/stddev computations that divide by `n`
  (`transit/src/main.rs:376-381`, `network_stats.rs` CV code): population
  variance over the full population of cells/departures is a defensible
  methodology choice - leave as is.
- `heap.rs`, `isochrone_server.rs` - server hot path, no changes.

## Git workflow

- Branch: `advisor/003-rust-stats-hygiene`
- Commit style: conventional commits, e.g. `fix(transit): interpolated median for even-length district headways`
- Do NOT push or open a PR unless the operator instructed it.

### Step 1: Use the median helper for district headways

In `transit/src/main.rs:742-746`, replace the manual indexing with the
existing helper (the vector is already sorted at that point):

```rust
headways.sort_by(|a, b| a.partial_cmp(b).unwrap());
let median_hw = median(&headways);
```

`median()` already handles the empty case (returns 0.0), so the
`if !headways.is_empty()` branch collapses.

**Verify**: `cargo clippy --manifest-path transit/Cargo.toml -- -D warnings` → exit 0.

### Step 2: Document compute_headway's None semantics

Add a doc comment to `compute_headway` in `transit/src/route_stats.rs`
stating: returns `None` when fewer than 2 departures fall inside the window;
this is why sparse lines and off-window services publish `peakHeadwayMin:
null`, which the frontend renders as an explicit "no data" placeholder
(see `app/stanice/copy.ts` `lineHeadway`). Comment only - no behavior change.

**Verify**: `cargo fmt --manifest-path transit/Cargo.toml -- --check` → exit 0.

### Step 3: Document the -1 hourly_wait convention

At the NaN-replacement site in `transit/src/network_stats.rs` (find with
`grep -n "is_nan" transit/src/network_stats.rs`), add a comment: `-1.0`
encodes "no arrivals this hour" because JSON has no NaN; consumers must
filter negatives before aggregating.

**Verify**: `cargo fmt --manifest-path transit/Cargo.toml -- --check` → exit 0.

### Step 4: Unit tests

Add a `#[cfg(test)] mod tests` (pattern: `transit/src/rt_store.rs` bottom of
file) covering:

- `median`: empty → 0.0; odd length `[1,2,3]` → 2.0; even length `[1,2,3,4]`
  → 2.5 (this is the regression this plan fixes at the call site).
- `percentile`: `p=100` on `[1.0, 2.0, 3.0]` → 3.0 (documents the existing
  `lo == hi` guard); `p=50` → 2.0. `percentile` is `pub(crate)` already.
- `compute_headway` in `route_stats.rs`: fewer than 2 departures in window →
  `None`; departures at 0s/600s/1200s with no window → `Some(10.0)` minutes.

If `median` is private and the test module lives in the same file, no
visibility change is needed.

**Verify**: `cargo test --manifest-path transit/Cargo.toml` → all pass,
including the new tests.

## Test plan

Covered in step 4. No TS-side changes, so `bun run` gates don't apply.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cargo fmt --manifest-path transit/Cargo.toml -- --check` exits 0
- [ ] `cargo clippy --manifest-path transit/Cargo.toml -- -D warnings` exits 0
- [ ] `cargo test --manifest-path transit/Cargo.toml` exits 0 with new tests
- [ ] `grep -n "headways\[headways.len() / 2\]" transit/src/main.rs` returns no matches
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at `main.rs:742-746` doesn't match the excerpt.
- `median()` cannot be called from the `median_hw` site without moving code
  between modules (visibility beyond adding `pub(crate)` to `median`).
- You feel tempted to "fix" the n-vs-(n-1) variance denominators - that is
  explicitly out of scope (methodology choice, changes many published stats).

## Maintenance notes

- The median fix shifts `median_headway_min` slightly for districts with an
  even number of headway samples on the NEXT server regen (plan 002). The
  data diff will show small headway changes - expected, not a regression.
- Follow-up worth a future investigation (not this plan): why central hub
  stops publish null `peakHeadway` despite many departures - trace one hub's
  departures array end to end through `stop_pages.rs` to see whether the
  peak-window filter or the per-line grouping empties the input.
