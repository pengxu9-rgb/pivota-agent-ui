# Recall investigation — final handoff

**Status:** investigation closed at **shopping_agent pass-rate 23%** (12 of 53 queries). Search-layer iteration is no longer moving the needle. Next move is the **PDP-as-canonical catalog migration** (separate plan, links below).

---

## TL;DR

| Probe | When | Pass-rate | Layer-C failure shape |
|---|---|---:|---|
| v1 | Pre-fix baseline | 23% | cache 12 / timeout 13 / seed_zero 11 / other 3 |
| v2 | Post-fix, cache poisoned | 21% | same — fixes dead-pathed by cache |
| v4 | Cache flushed | 23% | cache 0 / timeout 12 / seed_zero 18 / other 9 |
| v6 | After PR-1309 (clamp) | 23% | unchanged |
| v7 | After PR-292 (pivot stage) | 23% | unchanged |
| **v8** | **After PR-293 (agent_api stage)** | **23%** | cache 1 / timeout 12 / seed_zero 18 / other 8 |

**The total Layer-C failure count is invariant at 39 across every iteration.** PR-02 successfully eliminated cache short-circuits (12 → 0) but those queries fell into seed_zero — `external_product_seeds` simply has no rows for the gap categories.

**Smoking gun:** `bluetooth earbuds` query latency went 6.3s (v5) → 11.9s (v8) as we raised timeouts. The SQL got 12 seconds to scan the table and still returned **0 rows**. Timeouts were a symptom; data absence is the cause.

---

## What landed (9 backend PRs, all merged on main)

| PR | Repo | Change | Measured effect |
|---|---|---|---|
| PR-04 (#1302) | PIVOTA-Agent | ZH→EN query alias dict at `find_products_multi` entry | Code path executes (verified); query expansion works. Recall blocked by Layer C. |
| PR-06 (#1304) | PIVOTA-Agent | post_quality fail-open + entropy_ok cleanup on empty pool | Telemetry-only as expected. |
| PR-03 (#1305) | PIVOTA-Agent | Don't force `strict_empty` for category queries without brand | Removed `primary_irrelevant_no_fallback`; rerouted to natural fallback. |
| PR-01 (#1306) | PIVOTA-Agent | Bump `external_seed_direct` cap 4.8s → 8s | Cap raised; not the binding constraint. |
| PR-1307 | PIVOTA-Agent | Bump outer `find_products_multi` cap 10s → 15s | Outer budget grew. |
| PR-1309 | PIVOTA-Agent | Bump `clampLocalBeauty` external_seed cap 4.8s → 8s | Inner clamp no longer pre-shrinks. |
| **PR-02 (#288)** | **pivota-backend** | **Cache_hit refresh-on-thin trigger** | **C:cache 12 → 0 — the only PR with measurable lift** |
| PR-292 | pivota-backend | `pivot_query_service` stage_a/b 0.9s/1.6s → 1.5s/2.5s | Wrong code path for the failing route. |
| PR-293 | pivota-backend | `agent_api` stage_a/b 0.9s/1.4s → 2.0s/3.0s + parent 1.6s → 4.0s | Latency observed: 6s → 12s; SQL still returns 0. |

---

## Why pass-rate is flat at 23%

Probe results decomposed by failure layer (using the celestial pivot engine 5-layer model: A routing / B internal / C external_seed / D supplement / E semantic-retry). For shopping_agent, **every iteration shows 0 failures attributable to layers A/B/D/E**. All 39+ failures are at Layer C.

Within Layer C, the sub-modes shifted as fixes landed:

```
v2 (pre-fix):  cache=12  timeout=13  seed_zero=11  other=3   → 39
v4 (post-fix): cache=0   timeout=12  seed_zero=18  other=9   → 39
v8 (final):    cache=1   timeout=12  seed_zero=18  other=8   → 39
```

PR-02 worked, but the queries it unblocked fell into seed_zero (catalog has no data) and other_skip (cache_miss_sync_empty after fresh re-fetch returned 0). Bumping timeouts gave the SQL more time to confirm the table is empty for those terms — same 0 rows, just slower failure.

---

## What this means

**The recall problem is not a search-code bug.** It's a **catalog architecture gap**:

- `external_product_seeds` has no rows for non-skincare categories (lipstick, fragrance, electronics, home, fashion).
- The recall path text-LIKE scans `external_product_seeds` standalone; it does NOT JOIN `catalog_products` (the PDP layer where category/brand should be authoritative).
- Even when a seed has `attached_product_key` populated, the fallback query at `pivot_query_service.py:1013–1065` ignores the FK.

The right fix is architectural — migrate to **PDP as the canonical labeling root** with seeds and internal products as offers. See the plan file referenced at the bottom.

---

## What the 9 PRs are still worth

Even though they didn't move the headline number, none of them are wasted:

- **PR-04 (ZH alias)** — every Chinese category query now expands to EN tokens. Ready to deliver lift the moment catalog data exists.
- **PR-03 (no force strict)** — unblocks the natural fallback chain; without this, even a fully populated catalog wouldn't help category queries.
- **PR-02 (cache refresh-on-thin)** — prevents future cache poisoning. When categories get backfilled, this prevents stale-zero entries from blocking new data for hours.
- **Timeout bumps (PR-01 / 1307 / 1309 / 292 / 293)** — make sure the SQL has time to find data once it exists. Today they look like nil-ops; once catalog grows they'll matter.

---

## Probe harness (reusable tooling)

Built during the investigation and now available on main:

- `pivota-agent-ui/scripts/eval_corpus_recall_v1.jsonl` — 53-query corpus across 5 EN+ZH categories
- `pivota-agent-ui/scripts/eval_corpus_recall_runner.mjs` — JSONL → invoke driver, captures full backend metadata per query
- `pivota-agent-ui/scripts/eval_corpus_recall_summarize.mjs` — per-bucket pass/thin/empty matrix
- `pivota-agent-ui/scripts/eval_corpus_recall_layer_attribution.mjs` — tags each failing query with its responsible layer (A/B/C/D/E + sub-mode)

To re-probe after any change:

```bash
cd pivota-agent-ui
EVAL_INVOKE_URL=https://agent.pivota.cc/api/gateway \
EVAL_RUN_ID=recall_vN_$(date +%s) \
EVAL_CONCURRENCY=2 \
node scripts/eval_corpus_recall_runner.mjs \
  --source shopping_agent --entry chat \
  scripts/eval_corpus_recall_v1.jsonl
node scripts/eval_corpus_recall_layer_attribution.mjs <run_id>
```

Compare LAYER_ATTRIBUTION.md output against this report's headline table.

---

## Detailed reports (preserved on main)

- `reports/recall_v1/recall_v1_*/SUMMARY.md` + `FIX_PROPOSALS.md` — original 6-PR fix proposal list
- `reports/recall_v1/recall_v2_*/SHOPPING_AGENT_LAYER_REPORT.md` — first per-layer attribution
- `reports/recall_v1/recall_v2_*/CATALOG_GAP_MEMO.md` — the 11 queries flagged as data-bound after v2
- `reports/recall_v1/recall_v8_*/FINAL_DIAGNOSIS.md` — full intervention timeline
- `reports/recall_v1/recall_v8_*/LAYER_ATTRIBUTION.md` — final per-query layer attribution

---

## Next: PDP-as-canonical migration

Catalog labeling/enrichment proceeds via the plan at `~/.claude/plans/shimmying-soaring-ember.md`:

1. **Phase 1** — PDP-first SQL indexes (Codex, ~1 hr)
2. **Phase 2 / 2b** — `category_path` columns + regex backfill, then recall side wired to PDP-first (Codex + Claude, ~5 hrs)
3. **Phase 3A / 3B** — deterministic seed→PDP matcher + LLM tail (Codex + Claude API)
4. **Phase 4** — catalog enrichment agent fills missing PDPs, lipstick first (Claude API + codex routines)
5. **Phase 5** — re-probe per category lands

Per-category target lift after Phase 4 lands: lipstick → 30%, fragrance → 37%, electronics → 42%, home → 50%, fashion → 58%.

Search-layer iteration is **closed**. Pick this up with the PDP migration.
