# Recall v2 status — post backend fixes (PR-04, PR-06, PR-03, PR-01)

## Headlines

| | v1 (before) | v2 (after 4 PRs) | Change |
|---|---:|---:|---:|
| shopping_agent pass-rate | 23% | **21%** | −2pp |
| creator_agent pass-rate | 15% | **17%** | +2pp |
| ZH bucket pass-rate | 1/13 (7.7%) | 1/13 (7.7%) | flat |

**Net: no recall lift.** All 4 backend PRs deployed correctly (verified in `/healthz` commit hash), but the catalog/seed cache layer is short-circuiting every previously-empty query before the new logic gets a chance.

## Why no lift

Each EMPTY bucket in v2 returns:

```
external_seed_skip_reason: "cache_hit"
external_seed_executed: false
internal_raw_count: 0
external_raw_count: 0
```

The cache layer (Aurora-side, upstream of PIVOTA-Agent) stored "0 products" entries from probe v1 / production traffic from before the fixes landed. Now every repeat of those queries hits cache and short-circuits the seed lookup that PR-04 / PR-03 / PR-01 were supposed to unblock.

This is **exactly** the failure mode FIX_PROPOSALS PR-02 was designed for: *"if `external_seed_cache_hit && external_seed_returned_count < min_recall_floor`, schedule an async refresh and return cache this turn."* But PR-02 was deferred because the cache write/invalidate path lives in the Aurora upstream service, not in `pengxu9-rgb/PIVOTA-Agent` — so the fix has to happen there, not here.

## What is verified working

- **PR-04 (ZH alias dict)** — code path executes (verified by reading the response query echo). It correctly expands `口红` → `口红 lipstick`, `卫衣` → `卫衣 hoodie sweatshirt`, etc. Once cache flushes for those queries, ZH should flip to PASS.
- **PR-03 (don't force strict_empty)** — the lipstick query now falls through with `strict_empty_reason: "no_candidates"` instead of `primary_irrelevant_no_fallback`. Locked-out fallback path is unblocked.
- **PR-06 (fail-open + entropy_ok)** — telemetry-only; no recall delta expected.
- **PR-01 (seed timeout 4.8s→8s)** — would matter if cache miss; right now we're not hitting the timeout.

## What's still needed (PR-02, blocked here)

A cache-side change in the Aurora upstream that does **either**:

1. **Invalidate stale "0 products" cache entries** when min_recall_floor isn't met. Forces re-fetch.
2. **Async-refresh on thin cache** — return cache value this turn AND fire an async re-fetch. Next user gets fresh data.

Either lives outside `pengxu9-rgb/PIVOTA-Agent`. Likely repos to look at:
- The Aurora cache service that backs `external_seed_cache_hit`
- Where `external_seed_returned_count` is computed/stored

## Two near-term options to verify the fixes do work

1. **Wait for cache TTL** (typical Aurora cache TTLs: 6h–24h). Re-run this probe in 24h and the cache should have flushed for queries that haven't been re-issued — those should now hit fresh logic and show PR-04/03/01 lift.

2. **Manual cache flush.** If the Aurora team has an admin endpoint to invalidate the seed cache for a query set, flush the corpus's queries and re-probe immediately.

## Re-run probe v2 with same corpus

```bash
cd pivota-agent-ui
EVAL_INVOKE_URL=https://agent.pivota.cc/api/gateway \
EVAL_RUN_ID=recall_v3_$(date +%s) \
EVAL_CONCURRENCY=2 \
node scripts/eval_corpus_recall_runner.mjs --source shopping_agent --entry chat \
  scripts/eval_corpus_recall_v1.jsonl
node scripts/eval_corpus_recall_runner.mjs --source creator_agent --entry pdp \
  scripts/eval_corpus_recall_v1.jsonl
node scripts/eval_corpus_recall_summarize.mjs recall_v3_<timestamp>
```

## TL;DR

4 backend PRs merged, all correctly deployed. Recall flat because cache is poisoning every previously-empty query. Fix the cache (PR-02 in the Aurora repo) and re-probe — the 4 PRs should then deliver the predicted lift.
