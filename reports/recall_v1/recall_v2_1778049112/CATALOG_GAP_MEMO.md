# Catalog gap — non-skincare external seed coverage

**Audience:** catalog / ingestion team owners.
**TL;DR:** 11 of 41 shopping_agent recall failures (27%) hit Layer C with
`external_seed_executed=true, external_raw_count=0` — the seed query
ran successfully but `external_product_seeds` returned no rows. This
is a data coverage gap, not a code or routing bug. No fix is possible
from the search side; the seed table needs entries for the listed
categories.

## How this was identified

Recall probe v2 ran 53 representative queries against
`/api/gateway` → `find_products_multi`. The metadata field
`external_seed_skip_reason` distinguishes three external-seed failure
modes:

- `cache_hit` — cache returned [], short-circuited (data exists somewhere
  but cache is poisoned; see PR-02 in `pengxu9-rgb/pivota-backend`)
- `query_timeout` — seed query started but didn't complete in budget
  (see outer-budget bump PR in `pengxu9-rgb/PIVOTA-Agent`)
- **(this memo)** — seed query completed, returned 0 rows: catalog gap

## Affected queries (11)

| Query | Lang | Bucket | Notes |
|---|---|---|---|
| `推荐口红` (recommend lipstick) | zh | makeup_lip_bare_noun | After PR-04 → expands to "推荐口红 lipstick"; seed table has no lipstick |
| `口红` (lipstick) | zh | makeup_lip_bare_noun | Same expansion; seed gap |
| `平价口红` (affordable lipstick) | zh | makeup_lip | Seed gap |
| `适合黄皮的口红` (lipstick for warm-yellow skin) | zh | makeup_lip | Seed gap |
| `哑光口红` (matte lipstick) | zh | makeup_lip | Seed gap |
| `lipstick` | en | makeup_lip_bare_noun | Bare-noun EN — seed gap |
| `matte lipstick under $30` | en | makeup_lip | Seed gap |
| `nude lipstick everyday` | en | makeup_lip | Seed gap |
| `red lipstick long-lasting` | en | makeup_lip | Seed gap |
| `木质香水` (woody perfume) | zh | fragrance | Seed gap |
| `小众淡香水` (niche light perfume) | zh | fragrance | Seed gap |

Earlier we also flagged electronics + home + fashion ZH/EN buckets as
zero-recall, but those failed with `query_timeout` or `cache_hit`, not
`returned_zero`. Once PR-Outer-Budget and PR-02 land, those should
flip to either PASS (if the seed has rows) or, if not, fall into
**this same memo** (then we'll list them too).

## What's needed

For each affected category, add curated `external_product_seeds` rows
with:
- `title` matching common buyer intent (English; the ZH→EN alias dict
  in `PIVOTA-Agent/src/findProductsMulti/zhEnQueryAliases.js` already
  rewrites the ZH terms to these EN equivalents)
- `merchant_id` / `platform_product_id` resolvable to a real Shopify
  / external listing
- Brand metadata if available, so brand-anchor queries can pass
  `brand_query_detected=true`

## Suggested next steps for catalog team

1. **Lipstick (top priority)** — 6 of 11 affected queries. Seeding even
   ~30 lipsticks across 5–10 brands would close all 6 lipstick rows.
2. **Fragrance** — 2 affected queries. Seed ~20 unisex / vanilla / woody
   perfume entries across 5+ brands.
3. **Probe v3 (scheduled for 2026-05-07T07:00:00Z)** will reveal the
   electronics / home / fashion buckets after the Layer-C code-side
   fixes deploy. If they show `returned_zero` rather than `cache_hit`
   or `query_timeout`, they'll need the same backfill treatment.

## Validation

After backfill, re-run probe:

```bash
EVAL_INVOKE_URL=https://agent.pivota.cc/api/gateway \
EVAL_RUN_ID=recall_post_seed_$(date +%s) \
node scripts/eval_corpus_recall_runner.mjs --source shopping_agent --entry chat \
  scripts/eval_corpus_recall_v1.jsonl
node scripts/eval_corpus_recall_layer_attribution.mjs <run_id>
```

Look for: `C:seed_zero` count drops; `Pass` count rises.
