# Per-layer failure attribution — `recall_v5_1778052653_inner_clamp`

Generated: 2026-05-06T07:34:17.047Z

Total records: 53

## Layer attribution rules

Each EMPTY/THIN query is tagged with the **most likely failure layer** based on route_health metadata. Rules are mutually exclusive (first match wins):

- **C-external_seed / cache_short_circuit** — `external_seed_skip_reason=cache_hit` AND `external_seed_executed=false`
- **C-external_seed / timeout** — skip reason in {`query_timeout`, `external_seed_direct_local_timeout`}
- **C-external_seed / seed_ran_returned_zero** — seed executed but `external_raw_count=0`
- **C-external_seed / skipped (other)** — any other non-empty skip reason
- **E-semantic_retry / retry_zero_hits** — semantic retry ran but returned 0
- **D-supplement / blocked** — supplement not attempted, skip reason set
- **B-internal_catalog / internal_zero_no_other_layer** — internal=0 AND no seed/supplement engaged
- **A-primary_routing / primary_irrelevant_no_fallback** — strict force from primary fallback gate
- **unknown** — no clear signal

## shopping_agent — failure layer by bucket

| Bucket | Lang | n | Pass | C:cache | C:timeout | C:seed_zero | C:other_skip | D:blocked | B:internal_zero | A:primary | E:retry_zero | unknown |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| electronics | en | 3 | 1 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| electronics | zh | 2 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| fashion_dress | en | 1 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| fashion_dress | zh | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| fashion_shoes | en | 2 | 0 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| fashion_shoes | zh | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| fashion_top | en | 1 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| fashion_top | zh | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| fragrance | en | 3 | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| fragrance | zh | 2 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| home | en | 2 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| home | zh | 2 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| makeup_eye_bare_noun | en | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| makeup_eye_bare_noun | zh | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| makeup_eye | en | 2 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| makeup_eye | zh | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| makeup_face | en | 3 | 2 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| makeup_face | zh | 2 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 |
| makeup_lip_bare_noun | en | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| makeup_lip_bare_noun | zh | 2 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| makeup_lip | en | 3 | 0 | 2 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| makeup_lip | zh | 3 | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| skincare_bare_noun | en | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| skincare_bare_noun | zh | 2 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 |
| skincare_cleanser | en | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| skincare_moisturizer | en | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| skincare_serum | en | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| skincare_sun | en | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| skincare_sun | zh | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Dominant failure layer (across all buckets)

| Source | Total | Pass | C:cache | C:timeout | C:seed_zero | C:other | D | B | A | E | unknown |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| shopping_agent | 53 | 12 (23%) | 2 | 12 | 16 | 9 | 0 | 0 | 0 | 0 | 2 |

## Per-query detail (failures only)

| Source | Bucket | Lang | Query | n | Verdict | Layer | Detail | int_raw | ext_raw | seed_exec | seed_skip |
|---|---|---|---|---:|---|---|---|---:|---:|---|---|
| shopping_agent | electronics | en | `bluetooth earbuds` | 0 | EMPTY | C-external_seed | timeout (query_timeout) | 0 | 0 | true | query_timeout |
| shopping_agent | electronics | zh | `电子阅读器` | 0 | EMPTY | C-external_seed | timeout (query_timeout) | 0 | 0 | true | query_timeout |
| shopping_agent | electronics | zh | `蓝牙耳机` | 0 | EMPTY | C-external_seed | timeout (query_timeout) | 0 | 0 | true | query_timeout |
| shopping_agent | electronics | en | `kindle alternative e-reader` | 0 | EMPTY | C-external_seed | timeout (query_timeout) | 0 | 0 | true | query_timeout |
| shopping_agent | fashion_dress | en | `linen summer dress` | 5 | THIN | C-external_seed | skipped (cache_miss_sync_filled) | 1 | 4 | true | cache_miss_sync_filled |
| shopping_agent | fashion_dress | zh | `亚麻连衣裙` | 0 | EMPTY | C-external_seed | timeout (query_timeout) | 0 | 0 | true | query_timeout |
| shopping_agent | fashion_shoes | en | `black leather sneakers` | 1 | THIN | C-external_seed | skipped (cache_miss_sync_filled) | 0 | 1 | true | cache_miss_sync_filled |
| shopping_agent | fashion_shoes | zh | `跑鞋` | 0 | EMPTY | C-external_seed | timeout (query_timeout) | 0 | 0 | true | query_timeout |
| shopping_agent | fashion_shoes | en | `running shoes` | 0 | EMPTY | C-external_seed | timeout (query_timeout) | 0 | 0 | true | query_timeout |
| shopping_agent | fashion_top | zh | `卫衣` | 0 | EMPTY | C-external_seed | timeout (query_timeout) | 0 | 0 | true | query_timeout |
| shopping_agent | fashion_top | en | `oversized hoodie` | 1 | THIN | C-external_seed | skipped (cache_miss_sync_filled) | 0 | 1 | true | cache_miss_sync_filled |
| shopping_agent | fragrance | en | `vanilla perfume` | 0 | EMPTY | C-external_seed | seed_ran_returned_zero (executed=true, raw=0, returned=0) | 0 | 0 | true | cache_miss_sync_filled |
| shopping_agent | fragrance | zh | `木质香水` | 0 | EMPTY | C-external_seed | seed_ran_returned_zero (executed=true, raw=0, returned=0) | 0 | 0 | true | cache_miss_sync_filled |
| shopping_agent | fragrance | zh | `小众淡香水` | 0 | EMPTY | C-external_seed | seed_ran_returned_zero (executed=true, raw=0, returned=0) | 0 | 0 | true | cache_miss_sync_filled |
| shopping_agent | fragrance | en | `woody fragrance under $80` | 0 | EMPTY | C-external_seed | seed_ran_returned_zero (executed=true, raw=0, returned=0) | 0 | 0 | true | cache_miss_sync_filled |
| shopping_agent | fragrance | en | `unisex fragrance for daily wear` | 0 | EMPTY | C-external_seed | seed_ran_returned_zero (executed=true, raw=0, returned=0) | 0 | 0 | true | cache_miss_sync_filled |
| shopping_agent | home | zh | `加湿器` | 0 | EMPTY | C-external_seed | timeout (query_timeout) | 0 | 0 | true | query_timeout |
| shopping_agent | home | en | `aroma diffuser` | 0 | EMPTY | C-external_seed | skipped (seed_loader_error) | 0 | 0 | false | seed_loader_error |
| shopping_agent | home | en | `insulated water bottle` | 0 | EMPTY | C-external_seed | seed_ran_returned_zero (executed=true, raw=0, returned=0) | 0 | 0 | true | cache_miss_sync_filled |
| shopping_agent | home | zh | `保温杯` | 0 | EMPTY | C-external_seed | timeout (query_timeout) | 0 | 0 | true | query_timeout |
| shopping_agent | makeup_eye | zh | `防水睫毛膏` | 0 | EMPTY | C-external_seed | timeout (query_timeout) | 0 | 0 | true | query_timeout |
| shopping_agent | makeup_eye | en | `neutral eyeshadow palette` | 0 | EMPTY | C-external_seed | seed_ran_returned_zero (executed=true, raw=0, returned=0) | 0 | 0 | true | not_attempted |
| shopping_agent | makeup_eye | en | `waterproof volumizing mascara` | 2 | THIN | C-external_seed | skipped (cache_miss_sync_filled) | 0 | 2 | true | cache_miss_sync_filled |
| shopping_agent | makeup_eye_bare_noun | zh | `睫毛膏` | 0 | EMPTY | C-external_seed | timeout (query_timeout) | 0 | 0 | true | query_timeout |
| shopping_agent | makeup_eye_bare_noun | en | `mascara` | 0 | EMPTY | C-external_seed | seed_ran_returned_zero (executed=true, raw=0, returned=0) | 0 | 0 | true | cache_miss_sync_filled |
| shopping_agent | makeup_face | zh | `控油遮瑕粉底液` | 2 | THIN | C-external_seed | skipped (cache_miss_sync_filled) | 0 | 2 | true | cache_miss_sync_filled |
| shopping_agent | makeup_face | zh | `气垫粉底` | 2 | THIN | C-external_seed | skipped (cache_miss_sync_filled) | 0 | 2 | true | cache_miss_sync_filled |
| shopping_agent | makeup_face | en | `concealer for dark circles` | 0 | EMPTY | C-external_seed | seed_ran_returned_zero (executed=true, raw=0, returned=0) | 0 | 0 | true | cache_miss_sync_filled |
| shopping_agent | makeup_lip | zh | `哑光口红` | 0 | EMPTY | C-external_seed | seed_ran_returned_zero (executed=true, raw=0, returned=0) | 0 | 0 | true | cache_miss_sync_filled |
| shopping_agent | makeup_lip | en | `red lipstick long-lasting` | 0 | EMPTY | C-external_seed | seed_ran_returned_zero (executed=true, raw=0, returned=0) | 0 | 0 | true | cache_miss_sync_filled |
| shopping_agent | makeup_lip | zh | `平价口红` | 0 | EMPTY | C-external_seed | seed_ran_returned_zero (executed=true, raw=0, returned=0) | 0 | 0 | true | cache_miss_sync_filled |
| shopping_agent | makeup_lip | zh | `适合黄皮的口红` | 0 | EMPTY | C-external_seed | seed_ran_returned_zero (executed=true, raw=0, returned=0) | 0 | 0 | true | cache_miss_sync_filled |
| shopping_agent | makeup_lip | en | `nude lipstick everyday` | 0 | EMPTY | C-external_seed | cache_short_circuit (skip=cache_hit, executed=false) | 0 | 0 | false | cache_hit |
| shopping_agent | makeup_lip | en | `matte lipstick under $30` | 0 | EMPTY | C-external_seed | cache_short_circuit (skip=cache_hit, executed=false) | 0 | 0 | false | cache_hit |
| shopping_agent | makeup_lip_bare_noun | zh | `推荐口红` | 0 | EMPTY | C-external_seed | seed_ran_returned_zero (executed=true, raw=0, returned=0) | 0 | 0 | true | cache_miss_sync_filled |
| shopping_agent | makeup_lip_bare_noun | en | `lipstick` | 0 | EMPTY | C-external_seed | seed_ran_returned_zero (executed=true, raw=0, returned=0) | 0 | 0 | true | cache_miss_sync_filled |
| shopping_agent | makeup_lip_bare_noun | zh | `口红` | 0 | EMPTY | C-external_seed | seed_ran_returned_zero (executed=true, raw=0, returned=0) | 0 | 0 | true | cache_miss_sync_filled |
| shopping_agent | skincare_bare_noun | zh | `面霜` | 1 | THIN | C-external_seed | skipped (cache_miss_sync_filled) | 0 | 1 | true | cache_miss_sync_filled |
| shopping_agent | skincare_bare_noun | zh | `精华` | 1 | THIN | C-external_seed | skipped (cache_miss_sync_filled) | 0 | 1 | true | cache_miss_sync_filled |
| shopping_agent | skincare_serum | en | `salicylic acid serum for acne and pores` | 0 | EMPTY | unknown | — | — | — | false | — |
| shopping_agent | skincare_serum | en | `hyaluronic acid hydrating serum` | 2 | THIN | unknown | — | — | — | false | — |
