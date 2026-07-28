/**
 * The tag namespace the PDP itself attaches. `src/lib/api.ts:3299` builds
 * ``pdp:${product_id}`` and `:3323` attaches `[...(cacheTags || ['pdp']), productTag]`.
 *
 * THE BARE NAMESPACE IS THE DANGEROUS STRING: `pdp` alone sits on EVERY PDP
 * entry, so emitting it would restore the full ~4,400-entry blast radius under a
 * new name. `` `pdp:${id}` `` cannot equal `pdp` for any non-empty id — which is
 * exactly why the non-empty check below is asserted rather than inherited.
 */
const PDP_TAG_NAMESPACE = 'pdp';

/**
 * Build the exact cache tag the revalidate endpoint will purge.
 *
 * ITS OWN MODULE ON PURPOSE, for two reasons that are really one.
 *
 * 1. A Next route file may not export arbitrary symbols (`next build` rejects
 *    anything outside the route-handler contract), so a helper that needs a
 *    direct unit test cannot live in `route.ts`.
 * 2. The non-empty check has to be ASSERTED here, not inherited from the route's
 *    `SAFE_PRODUCT_ID` regex. An inherited guarantee is one refactor from
 *    disappearing, and the consequence is specific and severe: the target
 *    degenerates to the bare `pdp` tag, which sits on EVERY PDP entry —
 *    restoring the full ~4,400-entry blast radius under a new name.
 *
 * Inside the route the empty case is covered by three overlapping guards, so
 * deleting any one of them changes no observable behaviour and NO ROUTE-LEVEL
 * TEST CAN SEE IT. Verified by mutation: removing the route's own check, even
 * together with loosening the regex, left the suite green. A direct unit test on
 * this function does see it. That is the difference between an assertion and a
 * comment.
 */
export function buildRevalidateTarget(productId: string): string {
  if (!productId) {
    throw new Error('buildRevalidateTarget: product_id must be non-empty');
  }
  return `${PDP_TAG_NAMESPACE}:${productId}`;
}
