import type { Metadata } from 'next';
import {
  generatePdpMetadata,
  renderPdpPage,
  type PdpRouteProps,
} from './pdpServerPage';

// The canonical, crawlable PDP route — the ~1,900 sitemap URLs (sig_/ck_/pg_)
// plus anonymous non-canonical aliases. Static/ISR: rendered on first visit,
// cached for `revalidate` seconds, served warm to crawlers.
//
// Next route segment config exports MUST be statically-analyzable literals — a
// const reference here breaks `next build` ("invalid segment configuration").
// Keep this literal in lockstep with PDP_ROUTE_REVALIDATE_S in pdpServerPage.
export const revalidate = 3600;

// Pin the serverless function ceiling instead of inheriting the platform
// default (vercel.json declares no `functions` block, so the limit was
// whatever the plan happened to default to — a number nobody here controls).
//
// The server PDP read budgets 9s, plus up to 3s for the single transient
// retry (PDP_SERVER_FETCH_TIMEOUT_MS + PDP_SERVER_RETRY_TIMEOUT_MS), plus
// render. 20s keeps that arithmetic enforced with headroom: an ISR fill
// killed mid-render surfaces as a 504, which is strictly worse than the 500
// the retry exists to avoid. Raise the fetch budgets and this must move too.
export const maxDuration = 20;

// THE static/ISR opt-in — and the root cause of the crawl-collapse fix (#266)
// not taking effect: a dynamic-segment route WITHOUT generateStaticParams is
// always server-rendered on demand. `revalidate` alone never makes it static,
// so every canonical PDP still shipped `private, no-store`. Returning an empty
// array keeps the build free of gateway calls (no paths prerendered at build)
// while telling Next to statically generate each path on first visit and cache
// it for `revalidate` seconds (ISR).
//
// Consequence: NOTHING rendered by this route may touch a dynamic API
// (searchParams/cookies/headers/uncached fetch) — on-demand static generation
// hard-500s (DYNAMIC_SERVER_USAGE) instead of falling back to dynamic
// rendering. Merchant-personalized loads (?merchant_id=...) are therefore
// served by the force-dynamic /products/m/[id] alias route via a next.config
// beforeFiles rewrite. The one sanctioned exception is unstable_noStore() on
// the degraded-shell path, which is Next's own bail-out API.
export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  return [];
}

export async function generateMetadata(props: PdpRouteProps): Promise<Metadata> {
  return generatePdpMetadata(props, { personalized: false });
}

export default async function ProductDetailPage(props: PdpRouteProps) {
  return renderPdpPage(props, { personalized: false });
}
