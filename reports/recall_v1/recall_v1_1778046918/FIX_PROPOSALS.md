# Fix proposals — recall_v1_1778046918

Companion to `SUMMARY.md`. **No code is changed in this turn** — this is a PR
plan list keyed off the failure modes the probe surfaced. User picks which
to land in the next session.

> Probe hit `https://agent.pivota.cc/api/gateway` directly with the same
> `find_products_multi` invocation the production UI uses. 53 queries × 2
> sources (`shopping_agent`, `creator_agent`) = 106 probes.
> Headlines: shopping pass-rate **23%**, creator pass-rate **15%**. Almost all
> ZH queries (12/13) and most non-skincare buckets fail.

## Failure mode → fix mapping

The probe metadata cleanly groups failures into 6 distinct modes. Codex's
prior tests are heavy on EN skincare (which still passes) and miss every
other bucket. Each mode below has a smallest-change PR plan.

---

### F1 — External-seed query timeout swallows electronics / home / fragrance

**What we saw**

- `electronics`: 4/5 shopping queries returned 0 with `external_seed_skip_reason: "query_timeout"` and `external_seed_executed: true`.
- `home`: 4/4 → same shape.
- `fragrance/en`: 3/5 same.
- `internal_raw_count: 0` and `external_raw_count: 0` — the catalog has nothing native; the external seed lookup is the only path, and it times out ~30s before returning.

**Fix proposal — PR-01**: *Backend — increase external_seed query timeout floor + add stale-cache fallback when timeout fires*

- Repo: `pengxu9-rgb/PIVOTA-Agent`
- File: `src/findProductsBeautyDiscoveryLocalMainline.js` (around the seed-direct branch that raises `external_seed_direct_local_timeout` at line **863**), plus the seed timeout constant near `EXTERNAL_SEED_QUERY_TIMEOUT_MS` env in `src/server.js`.
- Change:
  1. Bump `EXTERNAL_SEED_QUERY_TIMEOUT_MS` floor from current value (likely 8–10s based on observed 30s upstream wrapper) to a 2-tier setup: a fast attempt (~6s) + a longer warm path that can return up to 20s.
  2. When a `query_timeout` is recorded and a *stale* cache row exists (any age, even past TTL), serve it with `external_seed_cache_status: "served_stale_on_timeout"`. Today timeout = 0 results.
- Expected impact: electronics, home, fragrance buckets flip THIN/EMPTY → PASS for queries with prior cache hits; queries with no cache fall back to "we're searching, refine" UX rather than silent strict_empty.
- Risk: stale-on-timeout could surface very-out-of-stock products. Gate the "served_stale" path on `staleness_ms < 24h`.

---

### F2 — External-seed cache returns short set; no refresh trigger

**What we saw**

- `linen summer dress` → 5 products, `external_seed_cache_hit: true`, `external_seed_returned_count: 4`, `external_seed_executed: false`.
- `oversized hoodie`, `black leather sneakers` → THIN with `cache_miss_sync_filled` (the sync fill path also returns thin).

**Fix proposal — PR-02**: *Backend — refresh trigger when cache hit < target-recall*

- Repo: `pengxu9-rgb/PIVOTA-Agent`
- File: `src/findProductsInvokeSearchSupplements.js` (cache-hit short-circuit) + `src/findProductsInvokeDecisionContext.js:176` (where `cache_hit` decision flag is set).
- Change: if `external_seed_cache_hit && external_seed_returned_count < min_recall_floor` (suggest 6), schedule an **async refresh job** for that query and return the cache result this turn. Today the cache hit short-circuits unconditionally, so users keep seeing the same 4 dresses forever.
- Expected impact: fashion_dress, fashion_shoes, fashion_top buckets flip THIN→PASS within a refresh cycle; **no UX latency hit on the first request**.
- Risk: low — refresh runs out-of-band.

---

### F3 — Makeup lip / category queries: zero internal + zero external + no fallback

**What we saw**

- `lipstick` (en), `推荐口红` (zh), `nude lipstick everyday`, `red lipstick long-lasting` etc.: **all** report `internal_raw_count: 0`, `external_raw_count: 0`, `strict_empty_reason: "no_candidates"` (shopping) or `"primary_irrelevant_no_fallback"` (creator).
- `search_decision`: `query_class: "category"`, `brand_query_detected: false`, `pq_entropy_ok: false`.
- 6/6 makeup_lip queries returned 0 across both sources.

**Fix proposal — PR-03**: *Backend — bare-noun beauty category queries must trigger external_seed even without ingredient/brand intent*

- Repo: `pengxu9-rgb/PIVOTA-Agent`
- File: `src/findProductsInvokePrimaryException.js` (line **30+** where `reason: 'primary_exception_no_fallback'` is set) and `src/findProductsInvokePrimaryFallback.js:225–245, 374` (the `primary_irrelevant_no_fallback` branch).
- Change: when `query_class === 'category'` AND `brand_query_detected === false` AND `internal_raw_count === 0`, **force-enter the external_seed path** (currently skipped because `primary_quality_gate_passed: false` aborts the pipeline). The current logic is the inverse: it skips external seed when primary is irrelevant, which is exactly when external seed is most needed.
- Expected impact: makeup_lip + makeup_eye + skincare_serum bare-noun queries flip from EMPTY → at least THIN. Probably PASS once F1 also lands.
- Risk: medium — need to ensure external_seed budget guard still prevents runaway. Gate the new force-enter behind `MIN_INTERNAL_RAW_COUNT_FOR_SKIP_EXTERNAL = 1` env so we can toggle.

---

### F4 — ZH bare-noun queries collapse to 0 (except 防晒霜)

**What we saw**

- ZH probes — 1 PASS / 12 EMPTY-or-FAIL out of 13. Only `防晒霜` (sunscreen) survived because the ZH→EN bridge already exists for that one term in the catalog backfill.
- 口红 → 0, 卫衣 → 0, 跑鞋 → 0, 加湿器 → 0, etc.
- No `lang` field on the request alters routing — the backend just sees an opaque token it doesn't index.

**Fix proposal — PR-04**: *Backend — add ZH→EN query expansion at the retrieval entry*

- Repo: `pengxu9-rgb/PIVOTA-Agent`
- File: `src/server.js` `find_products_multi` operation entry (where `payload.search.query` is first read, ~ line 30000 area).
- Change:
  1. Add a `normalizeQueryForRetrieval(query)` function that, if `query` contains CJK characters and matches a known beauty/fashion/electronics noun, expands into `{ original, en_alias }` and queries both.
  2. Backfill an alias dictionary in `src/lib/queryAliases/zh_en.json` covering the top 200 Chinese category nouns (口红=lipstick, 卫衣=hoodie, 跑鞋=running shoes, etc.). This is data, not modeling.
- Expected impact: every ZH category query in the corpus flips EMPTY→PASS once the alias hits a backfilled English term in the catalog.
- Risk: low if alias dict is curated; medium if auto-translated. Stage by manually curating top 50 first.

---

### F5 — Same query, different verdict by `metadata.source`

**What we saw**

- `lipstick` → shopping=EMPTY (`no_candidates`), creator=THIN with 1 product.
- `cushion foundation` → shopping=PASS (11), creator=EMPTY.
- `vanilla perfume` → shopping=FAIL HTTP502, creator=EMPTY.
- The backend forks routing on `metadata.source` somewhere, applying different strictness.

**Fix proposal — PR-05**: *Backend — audit + unify source-based gating in primary fallback*

- Repo: `pengxu9-rgb/PIVOTA-Agent`
- File: `src/findProductsInvokePrimaryFallback.js:225–245` (the `forceStrictEmptyControlledRecall` branch) plus any source-conditioned gates in `src/strictFindProductsResponseNormalization.js`.
- Change: list every `if (source === 'shopping_agent')` / `if (isShoppingSource(...))` branch and decide whether each is intentional or accidental drift. Where the difference is unintentional, collapse to one shared path; where intentional, document the divergence.
- Expected impact: cross-source diff table (in SUMMARY.md, last section) shrinks; creator gets at least the same coverage as shopping for shared categories.
- Risk: low — this is mostly clean-up, but each gate change needs a fixture to lock in expected behavior.

---

### F6 — `pq_entropy_ok: false` blocks bare-noun lipstick recall, fail-open never engages

**What we saw**

- `lipstick`: `search_decision.post_quality.entropy_ok: false`, `context_fail_open_applied: false`.
- The post-quality gate is computed against an empty result set (`candidates: 0`) and concludes "entropy not OK" — which is meaningless for an empty pool, but the gate still blocks the fail-open.

**Fix proposal — PR-06**: *Backend — fail-open post_quality gate when candidate set is empty*

- Repo: `pengxu9-rgb/PIVOTA-Agent`
- File: location of the `post_quality` decision (likely inside `src/findProductsInvokeDecisionContext.js` or `src/strictFindProductsResponseNormalization.js`; precise line found by grepping `context_fail_open_applied`).
- Change: in the post-quality evaluator, when `candidates === 0` skip the entropy gate entirely and set `context_fail_open_applied: true` so downstream supplement / external_seed paths still execute. Today an empty pool incorrectly fails the entropy check (`entropy_ok: false`) and short-circuits recovery.
- Expected impact: complementary to PR-03 — together they ensure that "0 results so far" never short-circuits the supplement chain.
- Risk: low.

---

## Probe-tooling note (not a backend bug)

Creator-agent run had 20 transport `FAIL` records with `latency_ms` in the **2–6 ms range** and `error: "fetch failed"`. This is **not** a backend issue — Node `fetch` socket pool exhaustion after multiple 30s timeouts at concurrency=3. Treat those rows as "no signal", not as recall failures. To re-probe creator cleanly:

```bash
EVAL_CONCURRENCY=1 EVAL_TIMEOUT_MS=15000 \
node scripts/eval_corpus_recall_runner.mjs --source creator_agent --entry pdp \
  scripts/eval_corpus_recall_v1.jsonl
```

(Could optionally land **PR-Probe-01**: add an exponential backoff + serial fallback on `fetch failed` to `eval_corpus_recall_runner.mjs`. Trivial; can come with the next probe pass.)

---

## Suggested merge order

1. **PR-04 (ZH alias dict)** — biggest pass-rate lift, lowest risk, no code logic change.
2. **PR-06 (fail-open on empty pool)** — unblocks PR-03's supplement reach.
3. **PR-03 (force external_seed on bare-noun category)** — restores makeup_lip, makeup_eye, fragrance.
4. **PR-01 (seed timeout floor + stale-on-timeout)** — restores electronics, home.
5. **PR-02 (cache refresh trigger)** — finishes fashion buckets.
6. **PR-05 (source-gating audit)** — last; pure consistency.

Re-run the probe after each PR; expect pass-rate to climb 23% → 50% → 70% → 85%+.

## Re-running this probe

```bash
cd pivota-agent-ui
EVAL_INVOKE_URL=https://agent.pivota.cc/api/gateway \
EVAL_RUN_ID=recall_v2_$(date +%s) \
EVAL_CONCURRENCY=2 EVAL_TIMEOUT_MS=20000 \
node scripts/eval_corpus_recall_runner.mjs --source shopping_agent --entry chat \
  scripts/eval_corpus_recall_v1.jsonl
node scripts/eval_corpus_recall_runner.mjs --source creator_agent --entry pdp \
  scripts/eval_corpus_recall_v1.jsonl
node scripts/eval_corpus_recall_summarize.mjs recall_v2_<timestamp>
```
