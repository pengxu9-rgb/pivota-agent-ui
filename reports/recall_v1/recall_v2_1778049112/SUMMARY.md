# Recall probe summary — `recall_v2_1778049112`

Generated: 2026-05-06T06:43:22.842Z

Sources: creator_agent, shopping_agent

## Overall by source

| Source | Total | PASS | THIN | EMPTY | MONOCULTURE | FAIL | Pass-rate |
|---|---:|---:|---:|---:|---:|---:|---:|
| creator_agent | 53 | 9 | 3 | 35 | 0 | 6 | 17% |
| shopping_agent | 53 | 11 | 8 | 33 | 1 | 0 | 21% |

## creator_agent — by bucket

| Bucket | n | PASS | THIN | EMPTY | FAIL | Top failure reason |
|---|---:|---:|---:|---:|---:|---|
| electronics | 5 | 0 | 0 | 4 | 1 | fallback_not_better (3) |
| fashion_dress | 2 | 0 | 0 | 0 | 2 | transport:TIMEOUT (2) |
| fashion_shoes | 3 | 0 | 0 | 0 | 3 | transport:TIMEOUT (2) |
| fashion_top | 2 | 0 | 1 | 1 | 0 | primary_irrelevant_no_fallback (1) |
| fragrance | 5 | 0 | 0 | 5 | 0 | no_candidates (5) |
| home | 4 | 0 | 0 | 4 | 0 | fallback_not_better (2) |
| makeup_eye | 3 | 0 | 0 | 3 | 0 | primary_irrelevant_no_fallback (3) |
| makeup_eye_bare_noun | 2 | 0 | 0 | 2 | 0 | primary_irrelevant_no_fallback (1) |
| makeup_face | 5 | 0 | 0 | 5 | 0 | primary_irrelevant_no_fallback (5) |
| makeup_lip | 6 | 0 | 0 | 6 | 0 | primary_irrelevant_no_fallback (6) |
| makeup_lip_bare_noun | 3 | 0 | 1 | 2 | 0 | primary_irrelevant_no_fallback (2) |
| skincare_bare_noun | 4 | 2 | 0 | 2 | 0 | primary_irrelevant_no_fallback (2) |
| skincare_cleanser | 2 | 2 | 0 | 0 | 0 | n/a |
| skincare_moisturizer | 3 | 3 | 0 | 0 | 0 | n/a |
| skincare_serum | 2 | 0 | 1 | 1 | 0 | unknown (2) |
| skincare_sun | 2 | 2 | 0 | 0 | 0 | n/a |

## shopping_agent — by bucket

| Bucket | n | PASS | THIN | EMPTY | FAIL | Top failure reason |
|---|---:|---:|---:|---:|---:|---|
| electronics | 5 | 1 | 0 | 4 | 0 | query_timeout (4) |
| fashion_dress | 2 | 0 | 1 | 1 | 0 | cache_miss_sync_filled (1) |
| fashion_shoes | 3 | 0 | 0 | 3 | 0 | no_candidates (2) |
| fashion_top | 2 | 0 | 1 | 1 | 0 | query_timeout (1) |
| fragrance | 5 | 0 | 0 | 5 | 0 | no_candidates (5) |
| home | 4 | 0 | 0 | 4 | 0 | query_timeout (2) |
| makeup_eye | 3 | 0 | 1 | 2 | 0 | no_candidates (1) |
| makeup_eye_bare_noun | 2 | 0 | 0 | 2 | 0 | query_timeout (1) |
| makeup_face | 5 | 1 | 2 | 1 | 0 | cache_hit (3) |
| makeup_lip | 6 | 0 | 0 | 6 | 0 | no_candidates (6) |
| makeup_lip_bare_noun | 3 | 0 | 0 | 3 | 0 | no_candidates (3) |
| skincare_bare_noun | 4 | 2 | 2 | 0 | 0 | cache_hit (2) |
| skincare_cleanser | 2 | 2 | 0 | 0 | 0 | n/a |
| skincare_moisturizer | 3 | 3 | 0 | 0 | 0 | n/a |
| skincare_serum | 2 | 0 | 1 | 1 | 0 | unknown (2) |
| skincare_sun | 2 | 2 | 0 | 0 | 0 | n/a |

## Per-query detail

| Source | Bucket | Lang | Query | n | brands | merchants | verdict | strict_empty_reason | external_seed_skip | reason_code | latency_ms |
|---|---|---|---|---:|---:|---:|---|---|---|---|---:|
| creator_agent | electronics | en | `kindle alternative e-reader` | 0 | 0 | 0 | FAIL | — | — | — | 20000 |
| creator_agent | fashion_dress | en | `linen summer dress` | 0 | 0 | 0 | FAIL | — | — | — | 20006 |
| creator_agent | fashion_dress | zh | `亚麻连衣裙` | 0 | 0 | 0 | FAIL | — | — | — | 20001 |
| creator_agent | fashion_shoes | en | `black leather sneakers` | 0 | 0 | 0 | FAIL | — | — | — | 20002 |
| creator_agent | fashion_shoes | zh | `跑鞋` | 0 | 0 | 0 | FAIL | — | — | — | 18319 |
| creator_agent | fashion_shoes | en | `running shoes` | 0 | 0 | 0 | FAIL | — | — | — | 20001 |
| creator_agent | electronics | en | `bluetooth earbuds` | 0 | 0 | 0 | EMPTY | fallback_not_better | not_attempted | no_candidates | 7095 |
| creator_agent | electronics | zh | `电子阅读器` | 0 | 0 | 0 | EMPTY | fallback_not_better | not_attempted | no_candidates | 7338 |
| creator_agent | electronics | zh | `蓝牙耳机` | 0 | 0 | 0 | EMPTY | fallback_not_better | not_attempted | no_candidates | 8032 |
| creator_agent | electronics | en | `noise cancelling headphones under $200` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 7882 |
| creator_agent | fashion_top | zh | `卫衣` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 5027 |
| creator_agent | fragrance | en | `vanilla perfume` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 7568 |
| creator_agent | fragrance | zh | `木质香水` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 7146 |
| creator_agent | fragrance | zh | `小众淡香水` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 7206 |
| creator_agent | fragrance | en | `woody fragrance under $80` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 8466 |
| creator_agent | fragrance | en | `unisex fragrance for daily wear` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 7014 |
| creator_agent | home | zh | `加湿器` | 0 | 0 | 0 | EMPTY | fallback_not_better | not_attempted | no_candidates | 5951 |
| creator_agent | home | en | `aroma diffuser` | 0 | 0 | 0 | EMPTY | fallback_not_better | seed_loader_error | no_candidates | 10386 |
| creator_agent | home | en | `insulated water bottle` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 7229 |
| creator_agent | home | zh | `保温杯` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 5537 |
| creator_agent | makeup_eye | zh | `防水睫毛膏` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 5991 |
| creator_agent | makeup_eye | en | `neutral eyeshadow palette` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 6848 |
| creator_agent | makeup_eye | en | `waterproof volumizing mascara` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 6850 |
| creator_agent | makeup_eye_bare_noun | zh | `睫毛膏` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 6205 |
| creator_agent | makeup_eye_bare_noun | en | `mascara` | 0 | 0 | 0 | EMPTY | — | cache_miss_sync_filled | ok | 6350 |
| creator_agent | makeup_face | en | `cushion foundation` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 8661 |
| creator_agent | makeup_face | zh | `控油遮瑕粉底液` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 6758 |
| creator_agent | makeup_face | zh | `气垫粉底` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 7525 |
| creator_agent | makeup_face | en | `full coverage foundation oily skin` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 6386 |
| creator_agent | makeup_face | en | `concealer for dark circles` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 8587 |
| creator_agent | makeup_lip | zh | `哑光口红` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 6359 |
| creator_agent | makeup_lip | en | `red lipstick long-lasting` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 7420 |
| creator_agent | makeup_lip | zh | `平价口红` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 6547 |
| creator_agent | makeup_lip | zh | `适合黄皮的口红` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 6393 |
| creator_agent | makeup_lip | en | `nude lipstick everyday` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 7094 |
| creator_agent | makeup_lip | en | `matte lipstick under $30` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 7464 |
| creator_agent | makeup_lip_bare_noun | zh | `推荐口红` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 6716 |
| creator_agent | makeup_lip_bare_noun | zh | `口红` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 6667 |
| creator_agent | skincare_bare_noun | zh | `面霜` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 6705 |
| creator_agent | skincare_bare_noun | zh | `精华` | 0 | 0 | 0 | EMPTY | primary_irrelevant_no_fallback | — | — | 6904 |
| creator_agent | skincare_serum | en | `salicylic acid serum for acne and pores` | 0 | 0 | 0 | EMPTY | — | — | — | 15824 |
| shopping_agent | electronics | en | `bluetooth earbuds` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 6554 |
| shopping_agent | electronics | zh | `电子阅读器` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 5823 |
| shopping_agent | electronics | zh | `蓝牙耳机` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 5071 |
| shopping_agent | electronics | en | `kindle alternative e-reader` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 5608 |
| shopping_agent | fashion_dress | zh | `亚麻连衣裙` | 0 | 0 | 0 | EMPTY | no_candidates | query_timeout | no_candidates | 5230 |
| shopping_agent | fashion_shoes | en | `black leather sneakers` | 0 | 0 | 0 | EMPTY | no_candidates | query_timeout | no_candidates | 5946 |
| shopping_agent | fashion_shoes | zh | `跑鞋` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 5248 |
| shopping_agent | fashion_shoes | en | `running shoes` | 0 | 0 | 0 | EMPTY | no_candidates | query_timeout | no_candidates | 5870 |
| shopping_agent | fashion_top | zh | `卫衣` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 4941 |
| shopping_agent | fragrance | en | `vanilla perfume` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 6106 |
| shopping_agent | fragrance | zh | `木质香水` | 0 | 0 | 0 | EMPTY | no_candidates | cache_hit | ok | 9741 |
| shopping_agent | fragrance | zh | `小众淡香水` | 0 | 0 | 0 | EMPTY | no_candidates | cache_hit | ok | 9818 |
| shopping_agent | fragrance | en | `woody fragrance under $80` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 7098 |
| shopping_agent | fragrance | en | `unisex fragrance for daily wear` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 5732 |
| shopping_agent | home | zh | `加湿器` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 8916 |
| shopping_agent | home | en | `aroma diffuser` | 0 | 0 | 0 | EMPTY | — | seed_loader_error | no_candidates | 4372 |
| shopping_agent | home | en | `insulated water bottle` | 0 | 0 | 0 | EMPTY | — | cache_miss_sync_filled | ok | 5931 |
| shopping_agent | home | zh | `保温杯` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 5701 |
| shopping_agent | makeup_eye | zh | `防水睫毛膏` | 0 | 0 | 0 | EMPTY | no_candidates | query_timeout | no_candidates | 6253 |
| shopping_agent | makeup_eye | en | `neutral eyeshadow palette` | 0 | 0 | 0 | EMPTY | — | not_attempted | no_candidates | 3934 |
| shopping_agent | makeup_eye_bare_noun | zh | `睫毛膏` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 5562 |
| shopping_agent | makeup_eye_bare_noun | en | `mascara` | 0 | 0 | 0 | EMPTY | — | cache_miss_sync_filled | ok | 4530 |
| shopping_agent | makeup_face | en | `concealer for dark circles` | 0 | 0 | 0 | EMPTY | — | cache_miss_sync_filled | ok | 8078 |
| shopping_agent | makeup_lip | zh | `哑光口红` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 6343 |
| shopping_agent | makeup_lip | en | `red lipstick long-lasting` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 9384 |
| shopping_agent | makeup_lip | zh | `平价口红` | 0 | 0 | 0 | EMPTY | no_candidates | cache_hit | ok | 10087 |
| shopping_agent | makeup_lip | zh | `适合黄皮的口红` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 6835 |
| shopping_agent | makeup_lip | en | `nude lipstick everyday` | 0 | 0 | 0 | EMPTY | no_candidates | cache_hit | ok | 12055 |
| shopping_agent | makeup_lip | en | `matte lipstick under $30` | 0 | 0 | 0 | EMPTY | no_candidates | cache_hit | ok | 11839 |
| shopping_agent | makeup_lip_bare_noun | zh | `推荐口红` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 6002 |
| shopping_agent | makeup_lip_bare_noun | en | `lipstick` | 0 | 0 | 0 | EMPTY | no_candidates | cache_hit | ok | 7435 |
| shopping_agent | makeup_lip_bare_noun | zh | `口红` | 0 | 0 | 0 | EMPTY | no_candidates | cache_hit | ok | 11107 |
| shopping_agent | skincare_serum | en | `salicylic acid serum for acne and pores` | 0 | 0 | 0 | EMPTY | — | — | — | 18830 |
| creator_agent | fashion_top | en | `oversized hoodie` | 4 | 2 | 1 | THIN | — | — | — | 18046 |
| creator_agent | makeup_lip_bare_noun | en | `lipstick` | 1 | 1 | 1 | THIN | — | — | — | 7145 |
| creator_agent | skincare_serum | en | `hyaluronic acid hydrating serum` | 2 | 1 | 1 | THIN | — | — | — | 5977 |
| shopping_agent | fashion_dress | en | `linen summer dress` | 4 | 1 | 1 | THIN | — | cache_miss_sync_filled | ok | 12147 |
| shopping_agent | fashion_top | en | `oversized hoodie` | 1 | 1 | 1 | THIN | — | cache_hit | ok | 14867 |
| shopping_agent | makeup_eye | en | `waterproof volumizing mascara` | 2 | 1 | 1 | THIN | — | cache_miss_sync_filled | ok | 10952 |
| shopping_agent | makeup_face | zh | `控油遮瑕粉底液` | 2 | 1 | 1 | THIN | — | cache_hit | ok | 15847 |
| shopping_agent | makeup_face | zh | `气垫粉底` | 2 | 1 | 1 | THIN | — | cache_hit | ok | 15607 |
| shopping_agent | skincare_bare_noun | zh | `面霜` | 1 | 1 | 1 | THIN | — | cache_hit | ok | 19151 |
| shopping_agent | skincare_bare_noun | zh | `精华` | 1 | 1 | 1 | THIN | — | cache_hit | ok | 15411 |
| shopping_agent | skincare_serum | en | `hyaluronic acid hydrating serum` | 2 | 1 | 1 | THIN | — | — | — | 6199 |
| shopping_agent | makeup_face | en | `cushion foundation` | 11 | 1 | 1 | MONOCULTURE | — | cache_hit | ok | 18431 |
| creator_agent | skincare_bare_noun | en | `moisturizer` | 11 | 5 | 1 | PASS | — | cache_miss_sync_filled | ok | 15053 |
| creator_agent | skincare_bare_noun | en | `sunscreen` | 12 | 7 | 1 | PASS | — | — | — | 2946 |
| creator_agent | skincare_cleanser | en | `gentle cleanser` | 12 | 7 | 1 | PASS | — | cache_miss_sync_filled | ok | 12781 |
| creator_agent | skincare_cleanser | en | `acne cleanser` | 10 | 7 | 1 | PASS | — | — | — | 1951 |
| creator_agent | skincare_moisturizer | en | `lightweight gel moisturizer for acne-prone skin` | 10 | 4 | 1 | PASS | — | — | — | 1003 |
| creator_agent | skincare_moisturizer | en | `hydrating barrier moisturizer fragrance free` | 9 | 4 | 1 | PASS | — | — | — | 1315 |
| creator_agent | skincare_moisturizer | en | `barrier moisturizer` | 9 | 4 | 1 | PASS | — | — | — | 2391 |
| creator_agent | skincare_sun | en | `spf 50` | 12 | 7 | 1 | PASS | — | — | — | 1228 |
| creator_agent | skincare_sun | zh | `防晒霜` | 12 | 5 | 1 | PASS | — | — | — | 1983 |
| shopping_agent | electronics | en | `noise cancelling headphones under $200` | 10 | 2 | 2 | PASS | — | cache_miss_sync_filled | ok | 12763 |
| shopping_agent | makeup_face | en | `full coverage foundation oily skin` | 10 | 3 | 1 | PASS | — | cache_miss_sync_filled | ok | 12310 |
| shopping_agent | skincare_bare_noun | en | `moisturizer` | 12 | 5 | 1 | PASS | — | cache_miss_sync_filled | ok | 10801 |
| shopping_agent | skincare_bare_noun | en | `sunscreen` | 12 | 7 | 1 | PASS | — | — | — | 1820 |
| shopping_agent | skincare_cleanser | en | `gentle cleanser` | 11 | 7 | 1 | PASS | — | cache_miss_sync_filled | ok | 15853 |
| shopping_agent | skincare_cleanser | en | `acne cleanser` | 10 | 7 | 1 | PASS | — | — | — | 3259 |
| shopping_agent | skincare_moisturizer | en | `lightweight gel moisturizer for acne-prone skin` | 10 | 4 | 1 | PASS | — | — | — | 2686 |
| shopping_agent | skincare_moisturizer | en | `hydrating barrier moisturizer fragrance free` | 9 | 4 | 1 | PASS | — | — | — | 1751 |
| shopping_agent | skincare_moisturizer | en | `barrier moisturizer` | 9 | 4 | 1 | PASS | — | — | — | 1771 |
| shopping_agent | skincare_sun | en | `spf 50` | 12 | 7 | 1 | PASS | — | — | — | 1996 |
| shopping_agent | skincare_sun | zh | `防晒霜` | 12 | 5 | 1 | PASS | — | — | — | 2622 |

## Cross-source diff (same query, different verdict)

| Query | creator_agent | shopping_agent |
|---|---|---|
| `noise cancelling headphones under $200` | EMPTY | PASS |
| `kindle alternative e-reader` | FAIL | EMPTY |
| `linen summer dress` | FAIL | THIN |
| `亚麻连衣裙` | FAIL | EMPTY |
| `black leather sneakers` | FAIL | EMPTY |
| `跑鞋` | FAIL | EMPTY |
| `running shoes` | FAIL | EMPTY |
| `waterproof volumizing mascara` | EMPTY | THIN |
| `cushion foundation` | EMPTY | MONOCULTURE |
| `控油遮瑕粉底液` | EMPTY | THIN |
| `气垫粉底` | EMPTY | THIN |
| `full coverage foundation oily skin` | EMPTY | PASS |
| `lipstick` | THIN | EMPTY |
| `面霜` | EMPTY | THIN |
| `精华` | EMPTY | THIN |

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
| fragrance | en | 6 | 6 | 100% |
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
| makeup_face | en | 6 | 5 | 83% |
| skincare_bare_noun | en | 4 | 0 | 0% |
| skincare_cleanser | en | 4 | 0 | 0% |
| skincare_moisturizer | en | 6 | 0 | 0% |
| skincare_sun | en | 2 | 0 | 0% |
| skincare_sun | zh | 2 | 0 | 0% |
