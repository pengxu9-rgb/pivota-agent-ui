# PDP P0/P1 Module State, Freeze, and Social Proof Rules

## Module State Model

PDP async modules now share one state enum:

- `ABSENT`: module not requested / not applicable
- `LOADING`: async module is still fetching
- `READY`: module has renderable content
- `EMPTY`: fetch finished but no content
- `ERROR`: fetch failed

Current async modules using this model:

- `offers`
- `reviews_preview`
- `ugc_preview`
- `similar`

## CLS Guard (Skeleton Height)

Modules that can transition from loading to ready use fixed-height skeleton shells:

- offers
- reviews preview
- UGC preview
- similar products

This prevents content jump while background fetches finish.

## Freeze Policy (No Source-Swap After First Render)

Once a module source is shown to users in this session, background backfills must not replace it:

- `reviews_preview`: first rendered payload locks source
- `similar`: first rendered list locks source
- `ugc_preview`: first non-empty source (`reviews` media first, then `media_gallery`) locks source

Only explicit user refresh actions should unlock/reload.

## Recent Purchases Rule

Random social-proof generation is removed.

- Render real records only from `product.recent_purchases`
- If empty, the module is hidden by default (`showEmpty=false`)
- No random fallback entries are allowed

## Key Tracking Added

- `pdp_core_ready`
- `pdp_module_ready`
- `pdp_fallback_used`
- `pdp_recent_purchases_impression`
- `ugc_impression`
- `ugc_open_all`
- `ugc_click_item`
- `similar_impression`
- `similar_click`
