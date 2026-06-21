# /promjene notice-extraction eval

Goal: make the `/promjene` changelog trustworthy. The page's truth hinges on one
decision per ZET notice — **is this a permanent network change (keep + map it) or a
temporary diversion (drop it)?** The slug heuristic in `ingest-announcements.ts` gets
this wrong often (it punts 131/144 list-worthy notices to "review"), so we read the
actual archived article **body** with an LLM. This eval measures how well cheap gateway
models do that, against a hand-verified gold set.

## What's here

- `bodies.json` — 52 archived notice bodies (og:description + news-text), the real text
  the model reads. Built by `fetch-bodies.ts` (stratified: all 36 line-changes + 16
  date-spread stops, 2017-2026). Committed so the eval is reproducible.
- `bodies/<id>.txt`, `notices.json` — per-notice body + `{id, published}` index, the
  inputs the gold-building workflow consumes.
- `gold-parts/<id>.json` — one reconciled record per notice (the adjudicator's verdict +
  `permanenceEvidence` / `disagreements` / `needsReview`). Source of truth.
- `gold.json` — assembled clean records (the eval scores against this).
- `gold-review.json` — gold + evidence/flags, for audit.
- `zet-extract.eval.ts` — the evalite suite. `gen-gold.ts` — legacy gpt-5.5 baseline
  (superseded by the agent panel). `extract.ts` (parent dir) — the shared extraction
  module used by eval + production.

## How the gold was built (not one model's guess)

1. `fetch-bodies.ts` → archived bodies.
2. **3-lens agent panel** (`promjene-gold` workflow): per notice, three independent
   readers — *neutral*, *skeptic* (assume temporary), *literalist* (only what's stated) —
   each extract the record. An **adjudicator** reconciles them against the body, quotes
   the deciding phrase, and flags disagreement.
3. `assemble-gold.ts` → mirrors the pipeline's `categoryFromRoles`, writes gold.
4. **Human audit** (all 13 permanents + all 39 temporaries + 3 `needsReview` read against
   their bodies). Two prior known false-positives confirmed caught: `7705` ("Nova linija
   105a" → temporary works) and `9912` (curated/mapped/featured Zapruđe → temporary works).

## Gold composition (52)

13 permanent / 39 temporary. Categories: trasa 19, stajalište 16, produljena 8, nova 4,
skraćena 3, vozni red 1, ukinuta 1.

## Final leaderboard (52 items)

| model | permanence | category | line-roles | effectiveDate | title-faithful | overall | $/M (in/out) |
|---|---|---|---|---|---|---|---|
| **google/gemini-3-flash** | **100** | **100** | **100** | **100** | 98.1 | **99.6** | 0.50/3.00 |
| alibaba/qwen3-max | 100 | 100 | 99.4 | 98.1 | 100 | 99.5 | 1.20/6.00 |
| gemini-3.1-flash-lite | 98.1 | 98.1 | 95.5 | 100 | 98.1 | 98.0 | 0.25/1.50 |
| openai/gpt-5.4-nano | 84.6 | 100 | 93.3 | 100 | 100 | 95.6 | 0.20/1.25 |

**Backfill cost (144 notices, measured token usage):** gemini-3-flash **$0.51** ·
qwen3-max $0.30 · flash-lite $0.06 · gpt-5.4-nano $0.04 · gpt-5.5 (baseline) **$2.52**.
A one-time cost — re-runs only process new notices. gemini-3-flash's cost is higher than
its per-token price implies because it emits ~1027 "thinking" output tokens/notice (that
thinking is what makes it accurate); gpt-5.5 is ~5× the price for no accuracy gain.

**Decision: `google/gemini-3-flash`.** Perfect on permanence (the trust-critical
keep/drop call), category, line-roles, and date; one minor title overclaim (`7741`: called
removed line 105B "rerouted"). Ties qwen3-max on quality at <½ the price. The full
~144-notice backfill costs ~$0.14.

Newer/bigger tiers were checked and buy nothing — the task is saturated at the flash tier:
`gemini-3.5-flash` ($1.50/9.00, 3×) and `gemini-3.1-pro-preview` ($2/12, 4×) both tie at
100% permanence/category/date and are a hair *behind* on line-roles (99.4 vs 100, noise).
Note there is no plain text `gemini-3.1-flash` on the gateway — only `-lite` (the weakest of
the top group, 98.0) or `-image` (image generation). The `.1` generation bump does not beat
the tier gap: full-flash 3.0 > lite-3.1.

## What the bigger eval revealed (16 → 52 items)

- **It discriminates now.** On 16 items everything sat at 94-100% noise. On 52,
  gemini-3-flash/qwen3-max separate cleanly from flash-lite, and nano falls away.
- **flash-lite's only permanence miss is `9552`** — the one genuinely-ambiguous item
  (line 228 extended/renamed "tijekom izgradnje" the hospital, no end date; adjudicated
  temporary since the body offers no permanence claim). On every *clear* case it's perfect.
- **nano systematically under-calls permanence** (84.6%): it drops 7 clearly-permanent
  changes. Disqualifying — it would silently delete real changes.
- **The eval caught 2 gold errors.** All four models said `2025-06-23`/`2025-07-14` for
  `9710`/`9731`; gold said `2026`. Cause: the gold-building rule rolled the year forward
  off the **Wayback first-seen timestamp**, which is months later than the real publish
  date. Fixed in gold. **Lesson for the pipeline: trust the model's date** — gemini
  reasons about the year from date context (spans, "do" end-dates, publish timing) better
  than either deterministic heuristic. Do NOT wire `dateFromBody`'s month-rollover for
  wayback-sourced notices.

## Reproduce

```sh
bun scripts/promjene/eval/fetch-bodies.ts        # bodies (skips cached)
# Workflow: promjene-gold (3-lens panel) -> gold-parts/*.json
bun scripts/promjene/eval/assemble-gold.ts       # gold.json + gold-review.json
bunx evalite run scripts/promjene/eval           # leaderboard (needs AI_GATEWAY_API_KEY in .env.local)
```
