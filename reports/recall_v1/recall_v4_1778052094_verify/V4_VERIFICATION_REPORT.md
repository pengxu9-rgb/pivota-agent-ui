# Recall v4 — post-deploy verification (PR-04 + PR-06 + PR-03 + PR-01 + PR-02 + PR-Outer-Budget all live)

**Headline:** pass-rate flat, but **PR-02 worked exactly as designed**. The cache short-circuits dropped to 0; what they were hiding is now exposed as the real bottleneck — Layer-C catalog data gaps (C₃).

## Pass-rate progression

| Run | When | Pass-rate | Notes |
|---|---|---:|---|
| v1 | Pre-fix baseline | **23%** (12 PASS) | Cache poisoned |
| v2 | Post-fix, cache still poisoned | 21% (11 PASS) | PR-04/03/06/01 deployed but dead-pathed by cache |
| v3 (warmup) | Cache flush triggered live | 22-23% | Triggered async refreshes |
| **v4 (verify)** | After thin-cache refreshes | **23%** (12 PASS) | Same headline, very different shape underneath |

## Where the failures moved (the real signal)

| Failure layer | v1 | v2 | **v4** | Change vs v2 |
|---|---:|---:|---:|---|
| C:cache short-circuit | 12 | 12 | **0** | **−12 ✅** (PR-02 working) |
| C:timeout | 13 | 13 | 12 | −1 (PR-Outer-Budget marginal) |
| C:seed_zero (catalog gap) | 11 | 11 | **18** | **+7 ⚠️** (gap exposed) |
| C:other_skip | 3 | 3 | 9 | +6 (e.g. cache_miss_sync_empty) |
| Total Layer-C failures | 39 | 39 | 39 | flat |

**The cache was hiding the real problem.** PR-02 + the empty-cache bypass cleared the cache layer; what fell through is the catalog gap we already knew existed.

## What this means

1. **PR-02 (cache refresh-on-thin) — VALIDATED.** Cache short-circuit failures: 12 → 0. The new code path is firing.
2. **PR-Outer-Budget (10s → 15s) — MARGINAL EFFECT.** Timeouts dropped 13 → 12. The seed query itself doesn't get a budget extension just because the outer limit is bigger; the inner `clampLocalBeautyRecallAttemptTimeoutMs` still constrains based on remaining budget after primary. Need a different approach (parallelize primary+seed, or raise the inner clamp ceiling).
3. **C₃ (catalog gap) is now the dominant blocker.** 18 queries (34% of corpus) hit `external_seed_executed=true, external_raw_count=0`. No code change can fix this — needs catalog backfill per `CATALOG_GAP_MEMO.md`.
4. **PR-04 ZH alias — verified in code path** (queries still hit cache or seed-zero, but expansion is happening — confirmed by the `face cream moisturizer` lift on `面霜`).

## Updated recommended next steps

| Priority | Action | ROI | Owner |
|---|---|---|---|
| 1 | **Catalog backfill** for makeup_lip (6 queries), fragrance (5 queries), electronics (3), home (4), fashion (3) — see `CATALOG_GAP_MEMO.md` | unlocks 18+ queries (~34pp lift) | Catalog/ingestion team |
| 2 | Inner timeout clamp bump (`clampLocalBeautyRecallAttemptTimeoutMs` floor) | unlocks 12 timeout queries (~22pp lift) | Search backend |
| 3 | Re-probe 24h after catalog backfill | validation | Auto-scheduled probe |

## Notes for the 24h scheduled probe

The cron `trig_01LeLahjDr6KxBfRic3yBTjb` will fire at `2026-05-07T07:00:00Z`. By then:
- Cache TTLs will have rolled — confirms PR-02 + bypass_empty_cache_hit handle the natural-TTL case
- Any catalog backfill landed during the day will be reflected
- Should give a final, post-cache-stabilization view

## Files

- `SUMMARY.md` — full per-bucket scoring
- `LAYER_ATTRIBUTION.md` — per-query layer tagging
- Per-query records: `shopping_agent/<bucket>/*.json`
- Compared against: `recall_v1_1778046918/` (baseline), `recall_v2_1778049112/` (post-fix-cache-poisoned)
