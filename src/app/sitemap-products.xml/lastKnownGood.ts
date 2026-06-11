// Module-scoped last-known-good snapshot for /sitemap-products.xml.
//
// Kept in a sibling module rather than the route file because Next.js App
// Router route files may only export a fixed set of fields (GET, HEAD,
// dynamic, revalidate, maxDuration, ...); exporting helpers from the route
// itself fails the build with "not a valid Route export field".
//
// A transient backend failure on a *warm* instance can serve the previous real
// catalog (slightly stale, never fabricated) instead of a 503. This is NOT the
// "5-URL stub" the route's failure path deliberately rejects: it is the genuine
// serving-eligible set from a recent successful pull, which is exactly what a
// sitemap is allowed to be — advisory and a little behind. It does not survive
// cold starts or span regions; durable cross-instance caching (KV/blob) is a
// follow-up if needed.

export type SitemapSource =
  | 'serving_eligible'
  | 'serving_eligible_partial'
  | 'serving_eligible_truncated'

export type SitemapSnapshot = {
  xml: string
  source: SitemapSource
  urlCount: number
}

let lastKnownGood: SitemapSnapshot | null = null

export function getLastKnownGood(): SitemapSnapshot | null {
  return lastKnownGood
}

export function setLastKnownGood(snapshot: SitemapSnapshot): void {
  lastKnownGood = snapshot
}

// Test-only: reset the snapshot so each case starts cold.
export function __resetSitemapCacheForTests(): void {
  lastKnownGood = null
}
