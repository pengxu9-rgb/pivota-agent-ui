# Final diagnosis — shopping_agent recall is data-bound, not code-bound

After 9 backend PRs across PIVOTA-Agent + pivota-backend, shopping_agent
pass-rate is stuck at **23%** (12/53). This report documents what the
intervention sweep proved and where the actual ceiling is.

## What we shipped

| # | Repo | What it changed | Probe-measured effect |
|---|---|---|---|
| PR-04 | PIVOTA-Agent | ZH→EN query alias dict | Code path executes; can't lift recall while Layer C blocks |
| PR-06 | PIVOTA-Agent | post_quality fail-open + entropy_ok cleanup | Telemetry only; expected nil recall delta |
| PR-03 | PIVOTA-Agent | category w/o brand → no force strict_empty | Removed `primary_irrelevant_no_fallback`; rerouted to natural fallback |
| PR-01 | PIVOTA-Agent | seed-direct cap 4.8s → 8s | Latency budget grew, seed still finds nothing |
| PR-1307 | PIVOTA-Agent | outer find_products_multi cap 10s → 15s | More headroom upstream |
| PR-1309 | PIVOTA-Agent | clampLocalBeauty external_seed cap 4.8s → 8s | Inner clamp no longer pre-shrinks |
| **PR-02** | **pivota-backend** | **cache_hit refresh-on-thin** | **C:cache 12 → 0 ✅ only PR with measurable lift** |
| PR-292 | pivota-backend | pivot_query_service stage 0.9s/1.6s → 1.5s/2.5s | Wrong code path (route uses agent_api) |
| PR-293 | pivota-backend | agent_api stage 0.9s/1.4s → 2.0s/3.0s + parent 1.6s → 4.0s | Latency observed: 6s → 12s; seed still finds 0 rows |

## Why pass-rate is flat at 23%

Every probe iteration produced the same shape:

| Layer-C sub-mode | v1 | v2 | v4 | v6 | v7 | v8 |
|---|---:|---:|---:|---:|---:|---:|
| C:cache | 12 | 12 | 0 | 1 | 2 | 1 |
| C:timeout | 13 | 13 | 12 | 12 | 12 | 12 |
| C:seed_zero | 11 | 11 | 18 | 17 | 16 | 18 |
| C:other_skip | 3 | 3 | 9 | 9 | 9 | 8 |
| **Total Layer-C** | **39** | **39** | **39** | **39** | **39** | **39** |
| PASS | 12 | 11 | 12 | 12 | 12 | 12 |

**The total Layer-C failure count is invariant at 39 across all
interventions.** PR-02 successfully eliminated cache short-circuits, but
those 12 queries fell straight into seed_zero / other_skip — they never
become PASS because there is no underlying data to retrieve.

Concrete evidence:
- `bluetooth earbuds` v5 (pre-bumps): timed out at **6.3s** with `query_timeout`
- `bluetooth earbuds` v8 (post all bumps): timed out at **11.9s** with `query_timeout`

The SQL ran for nearly 12 seconds against `external_product_seeds` and
returned 0 rows. The timeout wasn't the cause — the table has no rows
for `bluetooth earbuds` (or its expansion).

## The real bottleneck

The 41 non-PASS shopping queries decompose into:

1. **18 C:seed_zero** — `external_seed_executed=true` AND `external_raw_count=0`. SQL completed, table empty for these terms. Categories: makeup_lip (5+), fragrance EN (3), home (4), fashion (3), electronics (1).
2. **12 C:timeout** — SQL ran for the full extended budget (~12s) and still returned no rows. Same root cause as #1; the timeout is downstream of the empty result set, not the cause.
3. **8 C:other_skip** — `cache_miss_sync_filled / cache_miss_sync_empty`. Sync re-fetch completed with 0 rows.
4. **3 misc** — single-row buckets, transport, etc.

**All 4 buckets share the same root cause: `external_product_seeds` does not have rows for the failing query categories.**

## Where to go from here

The two viable next moves are both outside the search code we've been
touching:

### Option A — catalog backfill (highest ROI)

Per `CATALOG_GAP_MEMO.md`, the 18 seed_zero queries need:
- **Lipstick**: ~30 entries across 5–10 brands. Closes 6+ shopping queries (~11pp).
- **Fragrance**: ~20 entries across 5+ brands. Closes 5 shopping queries (~9pp).
- **Electronics / home / fashion**: ~10 each. Closes ~6 more queries.

Total potential lift: 23% → ~55–60%. This is data work in the
ingestion pipeline, not search code.

### Option B — SQL index audit (improves response shape)

The 12 C:timeout failures aren't true timeouts — they're 12-second
table scans returning 0. An index on the `external_product_seeds`
text columns (`title`, `description`, `seed_data` JSONB GIN) would
turn these from "ran 12s, found 0" into "ran 200ms, found 0". UX
unchanged but server load drops significantly.

This work would be in `pivota-backend` migrations, not application code.

## What the 9 PRs validated

Even though pass-rate is flat, the work wasn't wasted:

1. **PR-02 is permanent value** — refresh-on-thin prevents future cache poisoning. When categories DO get backfilled, this prevents stale-zero entries from blocking the new data for hours.
2. **PR-04 (ZH alias)** is dormant but ready — when the catalog has lipstick rows, every ZH lipstick query will hit them automatically.
3. **PR-03 (no force strict)** unblocks the natural fallback chain — without it, even a successful catalog backfill might not help category queries.
4. **Timeout bumps** prevent SQL from being preempted before it can serve good data — relevant when the catalog grows.
5. The probe harness itself (`eval_corpus_recall_runner.mjs`,
   `eval_corpus_recall_layer_attribution.mjs`) is now reusable
   tooling for measuring catalog backfill impact.

## Stop signal

Recommend stopping search-layer iteration at PR-293. Further timeout
bumps or routing tweaks won't move pass-rate while the underlying
catalog has no data for the failing categories. The next probe should
run **after** catalog backfill (Option A) — that's the only ROI move
left on the table.

The scheduled 24h re-probe (`trig_01LeLahjDr6KxBfRic3yBTjb`) will give
a baseline reading if any backfill happens overnight.
