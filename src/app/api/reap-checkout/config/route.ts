// GET /api/reap-checkout/config — which merchants show "Buy with Reap" (demo scope), and in which market.
// 404 when the demo is off. Only fetched by the client when NEXT_PUBLIC_REAP_CHECKOUT_DEMO is on.
import { readDemoMerchants } from '@/lib/reapCheckout/config';
import { disabledResponse, json } from '@/lib/reapCheckout/routeSupport.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const off = disabledResponse();
  if (off) return off;
  return json({ enabled: true, merchants: readDemoMerchants() });
}
