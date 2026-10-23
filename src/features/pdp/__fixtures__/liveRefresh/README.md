# PDP live refresh fixtures

Everything here was produced by the REAL gateway, PIVOTA-Agent `src/services/pdpLiveRefresh.js` (PR #2455,
commit `d3223eba1`, branch `claude/pdp-live-refresh-endpoint`): its descriptor builder issued the tokens, its
page-binding check accepted the UI's slices, and its overlay and patch builder wrote the answers.
`produceResponses.cjs` regenerates them; no merchant is contacted (the live cache is seeded).

Four get_pdp_v2 bodies:

- `native226-live-body.json` is `../currentOwnMoney/native226.json` (a synthetic native get_pdp_v2 body, see
  that README) with these edits, so the overlay can act on it and a best price can move:
  - the withheld 100 mL sibling's id `222` is renamed `47170040267003` everywhere (the overlay ignores ids
    shorter than six digits, so `222` would never exercise the withheld-variant rule);
  - each variant's `sku_id`/`sku` is a real-looking sku (`JUR-50ML`, `JUR-100ML`): the overlay treats a sku
    equal to the variant id as "not a variant id" and never patches it;
  - the page seller's offer row names its `selected_variant_id` (`47170040267002`), as seed offer rows do,
    so the overlay re-prices and re-stocks the row through that id;
  - as the real offer projection serves it, no row variant carries `current_own_offer_status` (the card's
    100 mL keeps its marker; the row's copy of it does not);
  - a second seller (`merch_obs_other_seller`, 47 USD, in stock) holds the best price, on the offers module
    and on the card (`offers_count` 2).
- `multisize-live-body.json` is that body with the 100 mL made buyable (60 USD, in stock, no marker
  anywhere) and the own row naming NO selected variant: a product-level row with two sizes. The gateway
  restocks such a row from its variants (in stock when any is) and never re-prices it
  (`live_read.status: variants_only`).
- `singlerow-live-body.json` is the native226 body with the own row naming no selected variant and carrying
  only the 50 mL: the row follows that one variant (price and stock).
- `builder-live-body.json` is the gateway's own test page shape (tests/pdp_live_refresh.node.test.cjs):
  `pdpBuilder.buildPdpPayload` over a two-variant seed product, wrapped as get_pdp_v2 wraps it.

Each carries a top-level `live_refresh` descriptor the real builder issued with a TEST secret (not a deployed
one; the browser never verifies the token).

`<name>-live-slice.json` is the UI's `buildLiveRefreshPage(mapPdpV2ToPdpPayload(body))`: the exact page the
gateway checked and overlaid. A test pins that the UI still builds it byte for byte; when it changes,
regenerate the responses.

`<name>-live-responses.json` are `pdp_live_read` answers:

- native226 `price_drop`: the merchant answers 45 USD in stock for the selected 50 mL, and 60 USD in stock for
  the withheld 100 mL (which the overlay leaves alone); the best price moves to the page seller;
- native226 `out_of_stock`: 49 USD, out of stock, for the 50 mL;
- native226 `confirmed`: the stored 49 USD in stock (no patch);
- native226 `shadow_price_drop`: the price drop with the gateway in SHADOW mode (`applied`, no patch);
- multisize `default_out_other_in`: 50 mL out of stock, 100 mL in stock at 60 USD (the row stays in stock,
  price unchanged); multisize `all_out`: both out of stock (the row goes out of stock);
- singlerow `price_drop` (45 USD, in stock) and `out_of_stock`: the row moves with its one variant;
- builder `back_in_stock`: both variants back in stock, the default at 24 USD.

These are protocol fixtures, not production responses.
