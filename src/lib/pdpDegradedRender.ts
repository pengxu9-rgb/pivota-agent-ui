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
