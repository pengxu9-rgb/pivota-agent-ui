import { ProductsPageClient } from './ProductsPageClient';
import { fetchBrowseFeedForServerRender } from './browseFeedServer';

// ISR: static shell + periodic server refetch of the browse feed. This page was
// client-only until 2026-08-08, which meant the prerendered HTML every crawler
// reads said "The browse feed is empty right now" while the sitemap advertised
// the URL at priority 0.9 — zero internal links to any PDP, on the one page
// whose job is internal linking.
//
// Keep this a STATIC route: no searchParams/cookies/headers in this file or
// anything it calls, or the prerender flips dynamic and crawlers pay a live
// gateway fetch per request instead of a cached one.
// 300s, deliberately SHORTER than the feed cache (900s). The build ships the
// client-only shell (it cannot fetch its own origin), so this window is how long
// a fresh deploy can still serve that shell — 5 minutes rather than 15. Most
// regenerations reuse the cached feed, so the shorter HTML cadence costs
// re-rendering, not upstream calls.
export const revalidate = 300;

// Bounds the ISR fill. The feed budget is 2 attempts x 12s, and a regeneration
// killed mid-render is a 504 — the same reason both PDP routes pin this. Set
// above the worst-case fetch so a slow-but-successful refresh is never
// truncated into a failure.
export const maxDuration = 30;

export default async function ProductsPage() {
  // Deliberately NOT caught. A failed fetch must throw so Next keeps the last
  // healthy render instead of replacing it with an empty grid (the PDP's
  // PDP_DEGRADED_RENDER_ERROR contract). Returning [] here would let every
  // failed revalidation overwrite a good page with the exact defect this page
  // exists to fix.
  //
  // The build phase is handled inside the helper: it returns [] WITHOUT
  // fetching, because a deployment cannot serve its own requests while it is
  // still being built — so the build ships the client-only shell and the first
  // revalidation on a live server fills in the real grid.
  const initialProducts = await fetchBrowseFeedForServerRender();
  return <ProductsPageClient initialProducts={initialProducts} />;
}
