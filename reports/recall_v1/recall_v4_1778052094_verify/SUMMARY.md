# Recall probe summary — `recall_v4_1778052094_verify`

Generated: 2026-05-06T07:24:56.445Z

Sources: shopping_agent

## Overall by source

| Source | Total | PASS | THIN | EMPTY | MONOCULTURE | FAIL | Pass-rate |
|---|---:|---:|---:|---:|---:|---:|---:|
| shopping_agent | 53 | 11 | 9 | 31 | 1 | 1 | 21% |

## shopping_agent — by bucket

| Bucket | n | PASS | THIN | EMPTY | FAIL | Top failure reason |
|---|---:|---:|---:|---:|---:|---|
| electronics | 5 | 1 | 0 | 4 | 0 | query_timeout (4) |
| fashion_dress | 2 | 0 | 1 | 1 | 0 | cache_miss_sync_filled (1) |
| fashion_shoes | 3 | 0 | 1 | 2 | 0 | cache_miss_sync_filled (1) |
| fashion_top | 2 | 0 | 1 | 1 | 0 | query_timeout (1) |
| fragrance | 5 | 0 | 0 | 5 | 0 | no_candidates (5) |
| home | 4 | 0 | 0 | 4 | 0 | query_timeout (2) |
| makeup_eye | 3 | 0 | 1 | 2 | 0 | no_candidates (1) |
| makeup_eye_bare_noun | 2 | 0 | 0 | 2 | 0 | query_timeout (1) |
| makeup_face | 5 | 1 | 2 | 1 | 0 | cache_miss_sync_filled (4) |
| makeup_lip | 6 | 0 | 0 | 6 | 0 | no_candidates (6) |
| makeup_lip_bare_noun | 3 | 0 | 0 | 3 | 0 | no_candidates (3) |
| skincare_bare_noun | 4 | 2 | 2 | 0 | 0 | cache_miss_sync_filled (2) |
| skincare_cleanser | 2 | 2 | 0 | 0 | 0 | n/a |
| skincare_moisturizer | 3 | 3 | 0 | 0 | 0 | n/a |
| skincare_serum | 2 | 0 | 1 | 0 | 1 | transport:TIMEOUT (1) |
| skincare_sun | 2 | 2 | 0 | 0 | 0 | n/a |

## Per-query detail

| Source | Bucket | Lang | Query | n | brands | merchants | verdict | strict_empty_reason | external_seed_skip | reason_code | latency_ms |
|---|---|---|---|---:|---:|---:|---|---|---|---|---:|
| shopping_agent | skincare_serum | en | `salicylic acid serum for acne and pores` | 0 | 0 | 0 | FAIL | — | — | — | 30003 |
| shopping_agent | electronics | en | `bluetooth earbuds` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 5153 |
| shopping_agent | electronics | zh | `电子阅读器` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 5240 |
| shopping_agent | electronics | zh | `蓝牙耳机` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 6813 |
| shopping_agent | electronics | en | `kindle alternative e-reader` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 5515 |
| shopping_agent | fashion_dress | zh | `亚麻连衣裙` | 0 | 0 | 0 | EMPTY | no_candidates | query_timeout | no_candidates | 5434 |
| shopping_agent | fashion_shoes | zh | `跑鞋` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 5242 |
| shopping_agent | fashion_shoes | en | `running shoes` | 0 | 0 | 0 | EMPTY | no_candidates | query_timeout | no_candidates | 5340 |
| shopping_agent | fashion_top | zh | `卫衣` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 5605 |
| shopping_agent | fragrance | en | `vanilla perfume` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 4630 |
| shopping_agent | fragrance | zh | `木质香水` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 5407 |
| shopping_agent | fragrance | zh | `小众淡香水` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 4998 |
| shopping_agent | fragrance | en | `woody fragrance under $80` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 5257 |
| shopping_agent | fragrance | en | `unisex fragrance for daily wear` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 4285 |
| shopping_agent | home | zh | `加湿器` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 4796 |
| shopping_agent | home | en | `aroma diffuser` | 0 | 0 | 0 | EMPTY | — | seed_loader_error | no_candidates | 3635 |
| shopping_agent | home | en | `insulated water bottle` | 0 | 0 | 0 | EMPTY | — | cache_miss_sync_filled | ok | 4359 |
| shopping_agent | home | zh | `保温杯` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 4975 |
| shopping_agent | makeup_eye | zh | `防水睫毛膏` | 0 | 0 | 0 | EMPTY | no_candidates | query_timeout | no_candidates | 5202 |
| shopping_agent | makeup_eye | en | `neutral eyeshadow palette` | 0 | 0 | 0 | EMPTY | — | not_attempted | ok | 4712 |
| shopping_agent | makeup_eye_bare_noun | zh | `睫毛膏` | 0 | 0 | 0 | EMPTY | — | query_timeout | no_candidates | 5423 |
| shopping_agent | makeup_eye_bare_noun | en | `mascara` | 0 | 0 | 0 | EMPTY | — | cache_miss_sync_filled | ok | 4177 |
| shopping_agent | makeup_face | en | `concealer for dark circles` | 0 | 0 | 0 | EMPTY | — | cache_miss_sync_filled | ok | 6031 |
| shopping_agent | makeup_lip | zh | `哑光口红` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 4764 |
| shopping_agent | makeup_lip | en | `red lipstick long-lasting` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 4708 |
| shopping_agent | makeup_lip | zh | `平价口红` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 4730 |
| shopping_agent | makeup_lip | zh | `适合黄皮的口红` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 4697 |
| shopping_agent | makeup_lip | en | `nude lipstick everyday` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 5287 |
| shopping_agent | makeup_lip | en | `matte lipstick under $30` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 5214 |
| shopping_agent | makeup_lip_bare_noun | zh | `推荐口红` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 4873 |
| shopping_agent | makeup_lip_bare_noun | en | `lipstick` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 5168 |
| shopping_agent | makeup_lip_bare_noun | zh | `口红` | 0 | 0 | 0 | EMPTY | no_candidates | cache_miss_sync_filled | ok | 4596 |
| shopping_agent | fashion_dress | en | `linen summer dress` | 5 | 2 | 2 | THIN | — | cache_miss_sync_filled | ok | 10502 |
| shopping_agent | fashion_shoes | en | `black leather sneakers` | 1 | 1 | 1 | THIN | — | cache_miss_sync_filled | ok | 9432 |
| shopping_agent | fashion_top | en | `oversized hoodie` | 1 | 1 | 1 | THIN | — | cache_miss_sync_filled | ok | 11536 |
| shopping_agent | makeup_eye | en | `waterproof volumizing mascara` | 2 | 1 | 1 | THIN | — | cache_miss_sync_filled | ok | 10146 |
| shopping_agent | makeup_face | zh | `控油遮瑕粉底液` | 2 | 1 | 1 | THIN | — | cache_miss_sync_filled | ok | 10247 |
| shopping_agent | makeup_face | zh | `气垫粉底` | 2 | 1 | 1 | THIN | — | cache_miss_sync_filled | ok | 11300 |
| shopping_agent | skincare_bare_noun | zh | `面霜` | 1 | 1 | 1 | THIN | — | cache_miss_sync_filled | ok | 10464 |
| shopping_agent | skincare_bare_noun | zh | `精华` | 1 | 1 | 1 | THIN | — | cache_miss_sync_filled | ok | 9828 |
| shopping_agent | skincare_serum | en | `hyaluronic acid hydrating serum` | 2 | 1 | 1 | THIN | — | — | — | 9655 |
| shopping_agent | makeup_face | en | `cushion foundation` | 11 | 1 | 1 | MONOCULTURE | — | cache_miss_sync_filled | ok | 10930 |
| shopping_agent | electronics | en | `noise cancelling headphones under $200` | 10 | 2 | 2 | PASS | — | cache_miss_sync_filled | ok | 11584 |
| shopping_agent | makeup_face | en | `full coverage foundation oily skin` | 10 | 3 | 1 | PASS | — | cache_miss_sync_filled | ok | 9781 |
| shopping_agent | skincare_bare_noun | en | `moisturizer` | 12 | 5 | 1 | PASS | — | cache_miss_sync_filled | ok | 9894 |
| shopping_agent | skincare_bare_noun | en | `sunscreen` | 12 | 7 | 1 | PASS | — | — | — | 1235 |
| shopping_agent | skincare_cleanser | en | `gentle cleanser` | 11 | 6 | 1 | PASS | — | cache_miss_sync_filled | ok | 29484 |
| shopping_agent | skincare_cleanser | en | `acne cleanser` | 10 | 7 | 1 | PASS | — | — | — | 2244 |
| shopping_agent | skincare_moisturizer | en | `lightweight gel moisturizer for acne-prone skin` | 10 | 4 | 1 | PASS | — | — | — | 2036 |
| shopping_agent | skincare_moisturizer | en | `hydrating barrier moisturizer fragrance free` | 9 | 4 | 1 | PASS | — | — | — | 1854 |
| shopping_agent | skincare_moisturizer | en | `barrier moisturizer` | 9 | 4 | 1 | PASS | — | — | — | 8053 |
| shopping_agent | skincare_sun | en | `spf 50` | 12 | 7 | 1 | PASS | — | — | — | 1386 |
| shopping_agent | skincare_sun | zh | `防晒霜` | 12 | 5 | 1 | PASS | — | — | — | 2592 |

## Cross-source diff (same query, different verdict)

_Only one source probed; skipping diff._

## Failure heatmap by (bucket, lang) across all sources

| Bucket | Lang | Total probes | Failed | Fail rate |
|---|---|---:|---:|---:|
| electronics | zh | 2 | 2 | 100% |
| fashion_dress | en | 1 | 1 | 100% |
| fashion_dress | zh | 1 | 1 | 100% |
| fashion_shoes | en | 2 | 2 | 100% |
| fashion_shoes | zh | 1 | 1 | 100% |
| fashion_top | zh | 1 | 1 | 100% |
| fashion_top | en | 1 | 1 | 100% |
| fragrance | en | 3 | 3 | 100% |
| fragrance | zh | 2 | 2 | 100% |
| home | zh | 2 | 2 | 100% |
| home | en | 2 | 2 | 100% |
| makeup_eye | zh | 1 | 1 | 100% |
| makeup_eye | en | 2 | 2 | 100% |
| makeup_eye_bare_noun | zh | 1 | 1 | 100% |
| makeup_eye_bare_noun | en | 1 | 1 | 100% |
| makeup_face | zh | 2 | 2 | 100% |
| makeup_lip | zh | 3 | 3 | 100% |
| makeup_lip | en | 3 | 3 | 100% |
| makeup_lip_bare_noun | zh | 2 | 2 | 100% |
| makeup_lip_bare_noun | en | 1 | 1 | 100% |
| skincare_bare_noun | zh | 2 | 2 | 100% |
| skincare_serum | en | 2 | 2 | 100% |
| electronics | en | 3 | 2 | 67% |
| makeup_face | en | 3 | 2 | 67% |
| skincare_bare_noun | en | 2 | 0 | 0% |
| skincare_cleanser | en | 2 | 0 | 0% |
| skincare_moisturizer | en | 3 | 0 | 0% |
| skincare_sun | en | 1 | 0 | 0% |
| skincare_sun | zh | 1 | 0 | 0% |
