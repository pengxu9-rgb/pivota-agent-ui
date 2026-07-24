import type { Metadata } from 'next';
import {
  generatePdpMetadata,
  renderPdpPage,
  type PdpRouteProps,
} from '../../[id]/pdpServerPage';

// The merchant-personalized PDP alias route. /products/[id] is static/ISR and
// can never read searchParams (a dynamic-API touch during on-demand static
// generation is a hard 500, not a fallback) — so requests that carry a
// ?merchant_id query are rewritten here by the next.config beforeFiles rewrite
// (the visible URL stays /products/:id). This route renders per-request and is
// never cached: caching it would serve one visitor's merchant-scoped view to
// everyone.
//
// Canonical crawlable ids (sig_/ck_/pg_) that land here (e.g. a canonical URL
// with a stray ?merchant_id) render the same anonymous view as the static
// route, just uncached — merchant personalization never applies to them.
export const dynamic = 'force-dynamic';

export async function generateMetadata(props: PdpRouteProps): Promise<Metadata> {
  return generatePdpMetadata(props, { personalized: true });
}

export default async function PersonalizedProductDetailPage(props: PdpRouteProps) {
  return renderPdpPage(props, { personalized: true });
}
