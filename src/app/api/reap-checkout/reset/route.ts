// POST /api/reap-checkout/reset — "start as a new buyer": clears this browser's demo buyer cookie.
// Same guards as create (armed, loopback Host, same origin). The next create mints a new buyer.
import { NextRequest } from 'next/server';
import {
  clearBuyerCookie,
  disabledResponse,
  hostProblem,
  json,
  sameOriginProblem,
} from '@/lib/reapCheckout/routeSupport.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const off = disabledResponse();
  if (off) return off;
  const wrongHost = hostProblem(req);
  if (wrongHost) return wrongHost;
  const crossSite = sameOriginProblem(req);
  if (crossSite) return crossSite;
  const res = json({ ok: true });
  clearBuyerCookie(res, req);
  return res;
}
