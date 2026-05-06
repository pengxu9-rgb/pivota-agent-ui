# Shopping-agent recall — per-layer attribution + next actions

**TL;DR.** 95% of the 41 shopping_agent failures collapse at **Layer C (External Seed)**. The four backend PRs we already merged correctly target Layer A/B but never get to fire because Layer C shorts out first. Further recall lift requires action on Layer C, not more Layer A/B fixes.

## Failure breakdown — shopping_agent (53 queries, 12 PASS / 41 fail)

| Layer | Sub-mode | Count | % of failures |
|---|---|---:|---:|
| **C — External Seed** | cache_short_circuit (executed=false, skip=cache_hit) | **12** | 29% |
| **C — External Seed** | timeout (executed=true, skip=query_timeout) | **13** | 32% |
| **C — External Seed** | seed_ran_returned_zero (executed=true, raw=0) | **11** | 27% |
| **C — External Seed** | other skip reason (cache_miss_sync_filled etc.) | 3 | 7% |
| Layer A primary routing | — | 0 | 0% |
| Layer B internal catalog | — | 0 | 0% |
| Layer D supplement | — | 0 | 0% |
| Layer E semantic retry | — | 0 | 0% |
| unknown / transport | — | 2 | 5% |

## What this means in plain terms

- **Layer A / B are not the bottleneck.** Internal catalog + primary routing are giving up correctly when nothing matches; they're not the reason recall is bad.
- **Every failing shopping query is dying inside Layer C.** External seed is the system's bridge from "the catalog has nothing" to "but we know about products elsewhere". When that bridge is broken, the rest of the pipeline can't recover.
- **Within Layer C there are three distinct failure shapes**, each needing a different fix.

## Per-mode root cause + fix

### C₁ — Cache short-circuit (12 queries)

Queries whose previous run produced 0 products got cached as `external_seed_returned_count: 0`. Subsequent runs see `external_seed_skip_reason: cache_hit`, set `external_seed_executed: false`, and return the cached zero.

PR-04 / PR-03 / PR-01 changes never run for these queries until the cache invalidates. They're correctly deployed, but not exercised.

**Fixes (pick one):**
- (a) **Wait** — typical Aurora seed cache TTL is hours. Re-probe in 6–24h; queries that haven't been re-issued by users will re-fetch and hit the new code paths.
- (b) **Cache refresh trigger** (FIX_PROPOSALS PR-02) — when `cache_hit && returned_count < min_recall_floor`, schedule async refresh and return cache this turn. Lives upstream of `pengxu9-rgb/PIVOTA-Agent`. Likely repo: `pengxu9-rgb/pivota-backend` (Python; serves `/agent/v1/products/search` which is where the cache_hit flag originates).
- (c) **Manual flush** — `pivota-backend/routes/admin_merchant_reset.py` has POST `/admin/merchants/reset-all?scope=cache_only` (requires confirmation phrase "DELETE ALL MERCHANT DATA"). Destructive at merchant level — wipes the merchant's products_cache entirely. **Don't do this without thinking** — it's a real data loss, not just a cache invalidate.

### C₂ — External seed timeout (13 queries — electronics, home, fragrance EN, some makeup)

Queries reach `external_seed_executed: true` but time out before returning. Probe latency for these is ~6–7s, hitting the seed timeout.

PR-01 raised the inner cap from 4.8s → 8s, but the actual timeout used is `min(requested, clampLocalBeautyRecallAttemptTimeoutMs(...))` — and the clamp is bounded by the **remaining request budget**, not just the inner cap. If the outer request has spent 5s on primary search before reaching seed, only 1–2s is left for seed regardless of the cap.

**Fix needed (next PR):**
- Bump the OUTER request budget for `find_products_multi`, OR
- Reorder the pipeline so seed runs in parallel with primary instead of after, OR
- Implement seed-with-stale-cache fallback so timeout returns last-known-good rather than 0.

The right fix is parallelization (concurrent seed + primary), but that's a bigger architectural change. The shorter path is bumping the outer budget — let me know if you want me to scope that PR.

### C₃ — Seed ran, returned zero (11 queries — fragrance ZH, electronics ZH, fashion ZH, makeup_lip)

Queries where seed executed successfully but `external_raw_count: 0` and `external_seed_returned_count: 0`. Not a timeout — the seed actually finished and had nothing to return.

**This is a catalog/data-coverage gap, not a code bug.** The external_product_seeds table doesn't have rows that match these queries. Even if PR-04 expands `口红` → `lipstick`, the seed table needs to have lipstick entries to find. Same for `蓝牙耳机` → `bluetooth earbuds`, `跑鞋` → `running shoes`, etc.

**Fix needed (data, not code):**
- Backfill the external seed catalog for the missing categories — makeup_lip, electronics, fashion, fragrance.
- This is a job for the catalog/ingestion pipeline owners, not the shopping agent.

## Creator agent — different pattern, parked for v2

Creator-agent failures (44/53) decompose differently:
- **D-supplement blocked: 23** — supplement layer doesn't run when source=creator_agent (likely a creator-specific gate that doesn't exist for shopping_agent)
- **C-seed_zero: 10** — same catalog gap as shopping
- **unknown / transport: 9** — local probe-side socket issues, not backend

The D-supplement gap is creator-specific and worth its own PR investigation (FIX_PROPOSALS PR-05 territory). Parked per scope decision.

## Recommended next action (in order)

1. **Decide on cache strategy** — wait, refresh-trigger PR in Aurora repo, or accept cache poisoning risk and do nothing for now.
2. **Bump outer request budget** for find_products_multi if you want to unblock C₂ timeouts. ~10 lines, low risk if done with env override.
3. **Talk to catalog team** about C₃ backfill — without seeded data for non-skincare categories, no amount of routing fix will help.
4. **Re-probe in 24h** to see if cache TTL alone closes the C₁ gap (validates that PR-04 / PR-03 / PR-01 are actually doing what we predicted).

## Where the data lives

- Per-query records: `reports/recall_v1/recall_v2_1778049112/shopping_agent/<bucket>/*.json`
- Layer attribution detail: `LAYER_ATTRIBUTION.md` in same dir
- Probe runner: `scripts/eval_corpus_recall_runner.mjs`
- Layer attribution analyzer: `scripts/eval_corpus_recall_layer_attribution.mjs`
- Architecture map (5 layers, every telemetry field): see Phase 1 explore output in this conversation; tracking doc TBD
