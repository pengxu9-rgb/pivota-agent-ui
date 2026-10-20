/**
 * The degraded-render sentinel, shared by the cached PDP read (src/lib/api.ts
 * getPdpV2Cached) and the PDP server page that throws it
 * (src/app/products/[id]/pdpServerPage.tsx, which re-exports it and documents
 * the contract). It lives here, not in the page module, so the lib layer can
 * throw it without importing app code.
 */
export const PDP_DEGRADED_RENDER_ERROR = 'PDP_DEGRADED_RENDER_UNCACHEABLE';

/** Fixed log token for a get_pdp_v2 200 the gateway marked degraded. No ids, no payload. */
export const PDP_DEGRADED_READS_LOG_TOKEN = '[pdp] degraded_reads_not_cached';

/** Fixed log token for a browser re-read that was degraded and ignored in favour of the server payload. */
export const PDP_DEGRADED_REFRESH_IGNORED_LOG_TOKEN = '[pdp] degraded_refresh_ignored';

/**
 * Did the gateway mark this get_pdp_v2 200 as built from an incomplete read?
 *
 * The gateway adds a top-level `degraded_reads` array (e.g.
 * `["catalog_signature_partial"]`, plus `Cache-Control: no-store`, which
 * unstable_cache never sees) when some read behind the answer could not reach
 * the database. ANY non-empty array counts, so a reason this client does not
 * know yet is still treated as degraded. Absent, null, or an empty array is a
 * complete answer.
 */
export function hasDegradedReads(response: unknown): boolean {
  if (!response || typeof response !== 'object') return false;
  const reads = (response as { degraded_reads?: unknown }).degraded_reads;
  return Array.isArray(reads) && reads.length > 0;
}

/**
 * One fixed token per browser refresh path that met a degraded re-read. Each is logged
 * at most once per page instance (see createDegradedReadLogger). No ids, no payload.
 */
export const PDP_DEGRADED_CLIENT_LOG_TOKENS = {
  core: PDP_DEGRADED_REFRESH_IGNORED_LOG_TOKEN,
  commerceRefresh: '[pdp] degraded_commerce_refresh',
  productLineRefresh: '[pdp] degraded_product_line_refresh',
  productLineReviews: '[pdp] degraded_product_line_reviews_skipped',
  productLineSimilar: '[pdp] degraded_product_line_similar_skipped',
  similar: '[pdp] degraded_similar_skipped',
  content: '[pdp] degraded_content_skipped',
} as const;

export type PdpDegradedClientReadKind = keyof typeof PDP_DEGRADED_CLIENT_LOG_TOKENS;

export function createDegradedReadLogger(): (kind: PdpDegradedClientReadKind) => void {
  const logged = new Set<PdpDegradedClientReadKind>();
  return (kind) => {
    if (logged.has(kind)) return;
    logged.add(kind);
    console.warn(PDP_DEGRADED_CLIENT_LOG_TOKENS[kind]);
  };
}
