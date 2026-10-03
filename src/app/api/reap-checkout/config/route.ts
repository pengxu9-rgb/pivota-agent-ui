// GET /api/reap-checkout/config — which merchants show "Checkout with Reap" (demo scope), and in which market.
// 404 when the demo is off. Only fetched by the client when NEXT_PUBLIC_REAP_CHECKOUT_DEMO is on.
import { readDemoMerchants, reapConsentVersion, reapTermsUrl } from '@/lib/reapCheckout/config';
import { NextRequest } from 'next/server';
import { disabledResponse, hostProblem, json, readServerConfig } from '@/lib/reapCheckout/routeSupport.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const off = disabledResponse();
  if (off) return off;
  const wrongHost = hostProblem(req);
  if (wrongHost) return wrongHost;
  const cfg = readServerConfig();
  if ('response' in cfg) return cfg.response;
  // The terms link and the version tag the buyer accepts are shown in the form (and the tag is what the
  // server records as consent), so the buyer sees exactly what they agree to.
  return json({
    enabled: true,
    merchants: readDemoMerchants(),
    terms: { url: reapTermsUrl(), version: reapConsentVersion() },
  });
}
