# Recall probe summary — `recall_v1_1778046918`

Generated: 2026-05-06T06:02:59.051Z

Sources: creator_agent, shopping_agent

## Overall by source

| Source | Total | PASS | THIN | EMPTY | MONOCULTURE | FAIL | Pass-rate |
|---|---:|---:|---:|---:|---:|---:|---:|
| creator_agent | 53 | 8 | 4 | 21 | 0 | 20 | 15% |
| shopping_agent | 53 | 12 | 9 | 30 | 1 | 1 | 23% |

## creator_agent — by bucket

| Bucket | n | PASS | THIN | EMPTY | FAIL | Top failure reason |
|---|---:|---:|---:|---:|---:|---|
| electronics | 5 | 0 | 0 | 1 | 4 | transport:TIMEOUT (2) |
| fashion_dress | 2 | 0 | 0 | 0 | 2 | transport:TIMEOUT (1) |
| fashion_shoes | 3 | 0 | 0 | 0 | 3 | transport:TIMEOUT (2) |
| fashion_top | 2 | 0 | 1 | 0 | 1 | transport:fetch failed (1) |
| fragrance | 5 | 0 | 0 | 3 | 2 | no_candidates (3) |
| home | 4 | 0 | 0 | 2 | 2 | transport:fetch failed (2) |
| makeup_eye | 3 | 0 | 0 | 2 | 1 | primary_irrelevant_no_fallback (2) |
| makeup_eye_bare_noun | 2 | 0 | 1 | 0 | 1 | transport:TIMEOUT (1) |
| makeup_face | 5 | 0 | 0 | 4 | 1 | primary_irrelevant_no_fallback (4) |
| makeup_lip | 6 | 0 | 0 | 6 | 0 | primary_irrelevant_no_fallback (6) |
| makeup_lip_bare_noun | 3 | 0 | 1 | 2 | 0 | primary_irrelevant_no_fallback (2) |
| skincare_bare_noun | 4 | 2 | 0 | 0 | 2 | transport:fetch failed (2) |
| skincare_cleanser | 2 | 2 | 0 | 0 | 0 | n/a |
| skincare_moisturizer | 3 | 3 | 0 | 0 | 0 | n/a |
| skincare_serum | 2 | 0 | 1 | 1 | 0 | unknown (2) |
| skincare_sun | 2 | 1 | 0 | 0 | 1 | transport:fetch failed (1) |

## shopping_agent — by bucket

| Bucket | n | PASS | THIN | EMPTY | FAIL | Top failure reason |
|---|---:|---:|---:|---:|---:|---|
| electronics | 5 | 1 | 0 | 4 | 0 | query_timeout (4) |
| fashion_dress | 2 | 0 | 1 | 1 | 0 | cache_hit (1) |
| fashion_shoes | 3 | 0 | 1 | 2 | 0 | cache_miss_sync_filled (1) |
| fashion_top | 2 | 0 | 1 | 1 | 0 | query_timeout (1) |
| fragrance | 5 | 1 | 0 | 3 | 1 | no_candidates (3) |
| home | 4 | 0 | 0 | 4 | 0 | query_timeout (2) |
| makeup_eye | 3 | 0 | 1 | 2 | 0 | no_candidates (1) |
| makeup_eye_bare_noun | 2 | 0 | 0 | 2 | 0 | query_timeout (1) |
| makeup_face | 5 | 1 | 2 | 1 | 0 | cache_miss_sync_filled (3) |
| makeup_lip | 6 | 0 | 0 | 6 | 0 | no_candidates (6) |
| makeup_lip_bare_noun | 3 | 0 | 0 | 3 | 0 | no_candidates (3) |
| skincare_bare_noun | 4 | 2 | 2 | 0 | 0 | cache_miss_sync_filled (1) |
| skincare_cleanser | 2 | 2 | 0 | 0 | 0 | n/a |
| skincare_moisturizer | 3 | 3 | 0 | 0 | 0 | n/a |
| skincare_serum | 2 | 0 | 1 | 1 | 0 | unknown (2) |
| skincare_sun | 2 | 2 | 0 | 0 | 0 | n/a |

## Per-query detail

| Source | Bucket | Lang | Query | n | brands | merchants | verdict | strict_empty_reason | external_seed_skip | reason_code | latency_ms |
|---|---|---|---|---:|---:|---:|---|---|---|---|---:|
| creator_agent | electronics | en | `bluetooth earbuds` | 0 | 0 | 0 | FAIL | — | — | — | 30002 |
| creator_agent | electronics | zh | `电子阅读器` | 0 | 0 | 0 | FAIL | — | — | — | 3 |
| creator_agent | electronics | zh | `蓝牙耳机` | 0 | 0 | 0 | FAIL | — | — | — | 2 |
| creator_agent | electronics | en | `noise cancelling headphones under $200` | 0 | 0 | 0 | FAIL | — | — | — | 30002 |
| creator_agent | fashion_dress | en | `linen summer dress` | 0 | 0 | 0 | FAIL | — | — | — | 30006 |
| creator_agent | fashion_dress | zh | `亚麻连衣裙` | 0 | 0 | 0 | FAIL | — | — | — | 3 |
| creator_agent | fashion_shoes | en | `black leather sneakers` | 0 | 0 | 0 | FAIL | — | — | — | 30002 |
| creator_agent | fashion_shoes | zh | `跑鞋` | 0 | 0 | 0 | FAIL | — | — | — | 2 |
| creator_agent | fashion_shoes | en | `running shoes` | 0 | 0 | 0 | FAIL | — | — | — | 30001 |
| creator_agent | fashion_top | zh | `卫衣` | 0 | 0 | 0 | FAIL | — | — | — | 2 |
| creator_agent | fragrance | zh | `木质香水` | 0 | 0 | 0 | FAIL | — | — | — | 3 |
| creator_agent | fragrance | zh | `小众淡香水` | 0 | 0 | 0 | FAIL | — | — | — | 2 |
| creator_agent | home | zh | `加湿器` | 0 | 0 | 0 | FAIL | — | — | — | 2 |
| creator_agent | home | zh | `保温杯` | 0 | 0 | 0 | FAIL | — | — | — | 1 |
| creator_agent | makeup_eye | zh | `防水睫毛膏` | 0 | 0 | 0 | FAIL | — | — | — | 30002 |
| creator_agent | makeup_eye_bare_noun | zh | `睫毛膏` | 0 | 0 | 0 | FAIL | — | — | — | 30004 |
| creator_agent | makeup_face | zh | `控油遮瑕粉底液` | 0 | 0 | 0 | FAIL | — | — | — | 30001 |
| creator_agent | skincare_bare_noun | zh | `面霜` | 0 | 0 | 0 | FAIL | — | — | — | 6 |
| creator_agent | skincare_bare_noun | zh | `精华` | 0 | 0 | 0 | FAIL | — | — | — | 5 |
| creator_agent | skincare_sun | zh | `防晒霜` | 0 | 0 | 0 | FAIL | — | — | — | 5 |
| shopping_agent | fragrance | en | `vanilla perfume` | 0 | 0 | 0 | FAIL | — | — | — | 17519 |
| creator_agent | electronics | en | `kindle alternative e-reader` | 0 | 0 | 0 | EMPTY | fallback_not_better | not_attempted | no_candidates | 25370 |
| creator_agent | fragrance | en | `vanilla perfume` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 6641 |
| creator_agent | fragrance | en | `woody fragrance under $80` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 8380 |
| creator_agent | fragrance | en | `unisex fragrance for daily wear` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 7349 |
| creator_agent | home | en | `aroma diffuser` | 0 | 0 | 0 | EMPTY | fallback_not_better | seed_loader_error | no_candidates | 10539 |
| creator_agent | home | en | `insulated water bottle` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 8382 |
| creator_agent | makeup_eye | en | `neutral eyeshadow palette` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 6088 |
| creator_agent | makeup_eye | en | `waterproof volumizing mascara` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 6153 |
| creator_agent | makeup_face | en | `cushion foundation` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 6712 |
| creator_agent | makeup_face | zh | `气垫粉底` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 8400 |
| creator_agent | makeup_face | en | `full coverage foundation oily skin` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 6098 |
| creator_agent | makeup_face | en | `concealer for dark circles` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 6809 |
| creator_agent | makeup_lip | zh | `哑光口红` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 8561 |
| creator_agent | makeup_lip | en | `red lipstick long-lasting` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 7523 |
| creator_agent | makeup_lip | zh | `平价口红` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 10631 |
| creator_agent | makeup_lip | zh | `适合黄皮的口红` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 10836 |
| creator_agent | makeup_lip | en | `nude lipstick everyday` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 6583 |
| creator_agent | makeup_lip | en | `matte lipstick under $30` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 6778 |
| creator_agent | makeup_lip_bare_noun | zh | `推荐口红` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 13296 |
| creator_agent | makeup_lip_bare_noun | zh | `口红` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 13133 |
| creator_agent | skincare_serum | en | `salicylic acid serum for acne and pores` | 0 | 0 | 0 | EMPTY | — | — | — | 17006 |
| shopping_agent | electronics | en | `bluetooth earbuds` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 9490 |
| shopping_agent | electronics | zh | `电子阅读器` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 10860 |
| shopping_agent | electronics | zh | `蓝牙耳机` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 10579 |
| shopping_agent | electronics | en | `kindle alternative e-reader` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 5959 |
| shopping_agent | fashion_dress | zh | `亚麻连衣裙` | 0 | 0 | 0 | EMPTY | no_candidates | query_timeout | no_candidates | 12722 |
| shopping_agent | fashion_shoes | zh | `跑鞋` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 11942 |
| shopping_agent | fashion_shoes | en | `running shoes` | 0 | 0 | 0 | EMPTY | no_candidates | query_timeout | no_candidates | 9426 |
| shopping_agent | fashion_top | zh | `卫衣` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 5838 |
| shopping_agent | fragrance | zh | `木质香水` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 5769 |
| shopping_agent | fragrance | zh | `小众淡香水` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 5497 |
| shopping_agent | fragrance | en | `unisex fragrance for daily wear` | 0 | 0 | 0 | EMPTY | no_candidates | cache_hit | ok | 24582 |
| shopping_agent | home | zh | `加湿器` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 10594 |
| shopping_agent | home | en | `aroma diffuser` | 0 | 0 | 0 | EMPTY | — | seed_loader_error | no_candidates | 4069 |
| shopping_agent | home | en | `insulated water bottle` | 0 | 0 | 0 | EMPTY | — | cache_miss_sync_filled | ok | 4792 |
| shopping_agent | home | zh | `保温杯` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 10460 |
| shopping_agent | makeup_eye | zh | `防水睫毛膏` | 0 | 0 | 0 | EMPTY | no_candidates | query_timeout | no_candidates | 10238 |
| shopping_agent | makeup_eye | en | `neutral eyeshadow palette` | 0 | 0 | 0 | EMPTY | — | not_attempted | ok | 6493 |
| shopping_agent | makeup_eye_bare_noun | zh | `睫毛膏` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 5770 |
| shopping_agent | makeup_eye_bare_noun | en | `mascara` | 0 | 0 | 0 | EMPTY | — | cache_miss_sync_filled | ok | 4409 |
| shopping_agent | makeup_face | en | `concealer for dark circles` | 0 | 0 | 0 | EMPTY | — | cache_miss_sync_filled | ok | 6922 |
| shopping_agent | makeup_lip | zh | `哑光口红` | 0 | 0 | 0 | EMPTY | no_candidates | cache_hit | ok | 12314 |
| shopping_agent | makeup_lip | en | `red lipstick long-lasting` | 0 | 0 | 0 | EMPTY | no_candidates | cache_hit | ok | 15827 |
| shopping_agent | makeup_lip | zh | `平价口红` | 0 | 0 | 0 | EMPTY | no_candidates | cache_hit | ok | 10326 |
| shopping_agent | makeup_lip | zh | `适合黄皮的口红` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 11950 |
| shopping_agent | makeup_lip | en | `nude lipstick everyday` | 0 | 0 | 0 | EMPTY | no_candidates | cache_hit | ok | 16157 |
| shopping_agent | makeup_lip | en | `matte lipstick under $30` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 6662 |
| shopping_agent | makeup_lip_bare_noun | zh | `推荐口红` | 0 | 0 | 0 | EMPTY | no_candidates | cache_hit | ok | 11948 |
| shopping_agent | makeup_lip_bare_noun | en | `lipstick` | 0 | 0 | 0 | EMPTY | no_candidates | cache_hit | ok | 7120 |
| shopping_agent | makeup_lip_bare_noun | zh | `口红` | 0 | 0 | 0 | EMPTY | no_candidates | query_timeout | ok | 10954 |
| shopping_agent | skincare_serum | en | `salicylic acid serum for acne and pores` | 0 | 0 | 0 | EMPTY | — | — | — | 18799 |
| creator_agent | fashion_top | en | `oversized hoodie` | 4 | 2 | 1 | THIN | — | — | — | 16445 |
| creator_agent | makeup_eye_bare_noun | en | `mascara` | 2 | 1 | 1 | THIN | — | — | — | 5453 |
| creator_agent | makeup_lip_bare_noun | en | `lipstick` | 1 | 1 | 1 | THIN | — | — | — | 6440 |
| creator_agent | skincare_serum | en | `hyaluronic acid hydrating serum` | 2 | 1 | 1 | THIN | — | — | — | 10994 |
| shopping_agent | fashion_dress | en | `linen summer dress` | 5 | 2 | 2 | THIN | — | cache_hit | ok | 13296 |
| shopping_agent | fashion_shoes | en | `black leather sneakers` | 1 | 1 | 1 | THIN | — | cache_miss_sync_filled | ok | 10680 |
| shopping_agent | fashion_top | en | `oversized hoodie` | 1 | 1 | 1 | THIN | — | cache_hit | ok | 13620 |
| shopping_agent | makeup_eye | en | `waterproof volumizing mascara` | 2 | 1 | 1 | THIN | — | cache_miss_sync_filled | ok | 27167 |
| shopping_agent | makeup_face | zh | `控油遮瑕粉底液` | 2 | 1 | 1 | THIN | — | cache_miss_sync_filled | ok | 17506 |
| shopping_agent | makeup_face | zh | `气垫粉底` | 2 | 1 | 1 | THIN | — | cache_miss_sync_filled | ok | 17357 |
| shopping_agent | skincare_bare_noun | zh | `面霜` | 1 | 1 | 1 | THIN | — | cache_miss_sync_filled | ok | 10643 |
| shopping_agent | skincare_bare_noun | zh | `精华` | 1 | 1 | 1 | THIN | — | cache_hit | ok | 15434 |
| shopping_agent | skincare_serum | en | `hyaluronic acid hydrating serum` | 2 | 1 | 1 | THIN | — | — | — | 8458 |
| shopping_agent | makeup_face | en | `cushion foundation` | 11 | 1 | 1 | MONOCULTURE | — | cache_hit | ok | 20537 |
| creator_agent | skincare_bare_noun | en | `moisturizer` | 11 | 5 | 1 | PASS | — | cache_miss_sync_filled | ok | 13134 |
| creator_agent | skincare_bare_noun | en | `sunscreen` | 12 | 7 | 1 | PASS | — | — | — | 1075 |
| creator_agent | skincare_cleanser | en | `gentle cleanser` | 12 | 7 | 1 | PASS | — | cache_miss_sync_filled | ok | 17399 |
| creator_agent | skincare_cleanser | en | `acne cleanser` | 10 | 7 | 1 | PASS | — | — | — | 3603 |
| creator_agent | skincare_moisturizer | en | `lightweight gel moisturizer for acne-prone skin` | 10 | 4 | 1 | PASS | — | — | — | 1753 |
| creator_agent | skincare_moisturizer | en | `hydrating barrier moisturizer fragrance free` | 9 | 4 | 1 | PASS | — | — | — | 1321 |
| creator_agent | skincare_moisturizer | en | `barrier moisturizer` | 9 | 4 | 1 | PASS | — | — | — | 2805 |
| creator_agent | skincare_sun | en | `spf 50` | 12 | 7 | 1 | PASS | — | — | — | 1070 |
| shopping_agent | electronics | en | `noise cancelling headphones under $200` | 10 | 2 | 2 | PASS | — | cache_miss_sync_filled | ok | 14159 |
| shopping_agent | fragrance | en | `woody fragrance under $80` | 12 | 2 | 1 | PASS | — | seed_loader_error | ok | 21890 |
| shopping_agent | makeup_face | en | `full coverage foundation oily skin` | 10 | 3 | 1 | PASS | — | cache_miss_sync_filled | ok | 11532 |
| shopping_agent | skincare_bare_noun | en | `moisturizer` | 12 | 5 | 1 | PASS | — | cache_miss_sync_filled | ok | 9879 |
| shopping_agent | skincare_bare_noun | en | `sunscreen` | 12 | 7 | 1 | PASS | — | — | — | 1564 |
| shopping_agent | skincare_cleanser | en | `gentle cleanser` | 11 | 7 | 1 | PASS | — | cache_miss_sync_filled | ok | 14514 |
| shopping_agent | skincare_cleanser | en | `acne cleanser` | 10 | 7 | 1 | PASS | — | — | — | 3023 |
| shopping_agent | skincare_moisturizer | en | `lightweight gel moisturizer for acne-prone skin` | 10 | 4 | 1 | PASS | — | — | — | 3380 |
| shopping_agent | skincare_moisturizer | en | `hydrating barrier moisturizer fragrance free` | 9 | 4 | 1 | PASS | — | — | — | 4727 |
| shopping_agent | skincare_moisturizer | en | `barrier moisturizer` | 9 | 4 | 1 | PASS | — | — | — | 5514 |
| shopping_agent | skincare_sun | en | `spf 50` | 12 | 7 | 1 | PASS | — | — | — | 1217 |
| shopping_agent | skincare_sun | zh | `防晒霜` | 12 | 5 | 1 | PASS | — | — | — | 2102 |

## Cross-source diff (same query, different verdict)

| Query | creator_agent | shopping_agent |
|---|---|---|
| `bluetooth earbuds` | FAIL | EMPTY |
| `电子阅读器` | FAIL | EMPTY |
| `蓝牙耳机` | FAIL | EMPTY |
| `noise cancelling headphones under $200` | FAIL | PASS |
| `linen summer dress` | FAIL | THIN |
| `亚麻连衣裙` | FAIL | EMPTY |
| `black leather sneakers` | FAIL | THIN |
| `跑鞋` | FAIL | EMPTY |
| `running shoes` | FAIL | EMPTY |
| `卫衣` | FAIL | EMPTY |
| `vanilla perfume` | EMPTY | FAIL |
| `木质香水` | FAIL | EMPTY |
| `小众淡香水` | FAIL | EMPTY |
| `woody fragrance under $80` | EMPTY | PASS |
| `加湿器` | FAIL | EMPTY |
| `保温杯` | FAIL | EMPTY |
| `防水睫毛膏` | FAIL | EMPTY |
| `waterproof volumizing mascara` | EMPTY | THIN |
| `睫毛膏` | FAIL | EMPTY |
| `mascara` | THIN | EMPTY |
| `cushion foundation` | EMPTY | MONOCULTURE |
| `控油遮瑕粉底液` | FAIL | THIN |
| `气垫粉底` | EMPTY | THIN |
| `full coverage foundation oily skin` | EMPTY | PASS |
| `lipstick` | THIN | EMPTY |
| `面霜` | FAIL | THIN |
| `精华` | FAIL | THIN |
| `防晒霜` | FAIL | PASS |

## Failure heatmap by (bucket, lang) across all sources

| Bucket | Lang | Total probes | Failed | Fail rate |
|---|---|---:|---:|---:|
| electronics | zh | 4 | 4 | 100% |
| fashion_dress | en | 2 | 2 | 100% |
| fashion_dress | zh | 2 | 2 | 100% |
| fashion_shoes | en | 4 | 4 | 100% |
| fashion_shoes | zh | 2 | 2 | 100% |
| fashion_top | zh | 2 | 2 | 100% |
| fashion_top | en | 2 | 2 | 100% |
| fragrance | zh | 4 | 4 | 100% |
| home | zh | 4 | 4 | 100% |
| home | en | 4 | 4 | 100% |
| makeup_eye | zh | 2 | 2 | 100% |
| makeup_eye | en | 4 | 4 | 100% |
| makeup_eye_bare_noun | zh | 2 | 2 | 100% |
| makeup_eye_bare_noun | en | 2 | 2 | 100% |
| makeup_face | zh | 4 | 4 | 100% |
| makeup_lip | zh | 6 | 6 | 100% |
| makeup_lip | en | 6 | 6 | 100% |
| makeup_lip_bare_noun | zh | 4 | 4 | 100% |
| makeup_lip_bare_noun | en | 2 | 2 | 100% |
| skincare_bare_noun | zh | 4 | 4 | 100% |
| skincare_serum | en | 4 | 4 | 100% |
| electronics | en | 6 | 5 | 83% |
| fragrance | en | 6 | 5 | 83% |
| makeup_face | en | 6 | 5 | 83% |
| skincare_sun | zh | 2 | 1 | 50% |
| skincare_bare_noun | en | 4 | 0 | 0% |
| skincare_cleanser | en | 4 | 0 | 0% |
| skincare_moisturizer | en | 6 | 0 | 0% |
| skincare_sun | en | 2 | 0 | 0% |
