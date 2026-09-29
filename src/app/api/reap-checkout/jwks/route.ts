// GET /api/reap-checkout/jwks — the PUBLIC key of the demo buyer-token issuer, as a JWKS.
//
// Only needed when the demo issuer is registered as a FEDERATED issuer (developer portal: agent,
// iss, aud, jwksUri) and this UI is served on a public https host the gateway and backend can reach.
// For a local UI against staging, use the inline-JWKS setup in docs/reap-checkout-demo.md instead.
// Publishes the public half only; 404 when the demo is off or the issuer is not configured.
import { publicJwks, readBuyerTokenConfig } from '@/lib/reapCheckout/buyerToken.server';
import { NextRequest } from 'next/server';
import { disabledResponse, hostProblem, json } from '@/lib/reapCheckout/routeSupport.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const off = disabledResponse();
  if (off) return off;
  const wrongHost = hostProblem(req);
  if (wrongHost) return wrongHost;
  const config = readBuyerTokenConfig();
  if (!config) return json({ error: 'not_found' }, 404);
  return json(publicJwks(config));
}
