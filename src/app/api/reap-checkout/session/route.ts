// Establish the signed HttpOnly buyer identity BEFORE any purchase attempt.
import { NextRequest } from 'next/server';
import { buyerScope, disabledResponse, hostProblem, json, readOrMintBuyerId, readServerConfig, sameOriginProblem, setBuyerCookie } from '@/lib/reapCheckout/routeSupport.server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  const off = disabledResponse(); if (off) return off;
  const host = hostProblem(req); if (host) return host;
  const origin = sameOriginProblem(req); if (origin) return origin;
  const cfg = readServerConfig(); if ('response' in cfg) return cfg.response;
  const { buyerId, minted } = readOrMintBuyerId(req, cfg.config.token);
  const res = json({ scope: buyerScope(cfg.config.token, buyerId) });
  if (minted) setBuyerCookie(res, req, cfg.config.token, buyerId);
  return res;
}
