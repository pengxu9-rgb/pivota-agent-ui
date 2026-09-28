// Shared plumbing for the /api/reap-checkout routes: the switch, the configuration, the buyer cookie.
import { NextRequest, NextResponse } from 'next/server';
import { isReapCheckoutDemoServerEnabled } from './config';
import {
  REAP_DEMO_BUYER_COOKIE,
  isBuyerId,
  newBuyerId,
  readBuyerTokenConfig,
  type BuyerTokenConfig,
} from './buyerToken.server';
import { readAgentApiKey, readGatewayBase } from './gatewayClient.server';
import type { ReapCheckoutView } from './checkoutView';

export type ReapServerConfig = {
  base: string;
  apiKey: string;
  token: BuyerTokenConfig;
  profileUrl: string | null;
};

const NO_STORE = { 'cache-control': 'no-store' };

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** 404 when the demo is off — the same answer as a route that does not exist. */
export function disabledResponse(): NextResponse | null {
  return isReapCheckoutDemoServerEnabled() ? null : json({ error: 'not_found' }, 404);
}

/** The full server config, or a 503 naming only WHICH setting is missing (never a value). */
export function readServerConfig(): { config: ReapServerConfig } | { response: NextResponse } {
  const base = readGatewayBase();
  const apiKey = readAgentApiKey();
  const token = readBuyerTokenConfig();
  const missing = [
    !base && 'REAP_CHECKOUT_GATEWAY_BASE_URL',
    !apiKey && 'REAP_CHECKOUT_AGENT_API_KEY',
    !token && 'REAP_DEMO_USER_JWT_*',
  ].filter(Boolean);
  if (!base || !apiKey || !token) {
    return { response: json({ error: 'reap_demo_not_configured', missing }, 503) };
  }
  const profile = String(process.env.UCP_AGENT_PROFILE_URL || '').trim();
  return { config: { base, apiKey, token, profileUrl: /^https:\/\//.test(profile) ? profile : null } };
}

export function readBuyerId(req: NextRequest): string | null {
  const raw = req.cookies.get(REAP_DEMO_BUYER_COOKIE)?.value;
  return isBuyerId(raw) ? raw : null;
}

export function readOrMintBuyerId(req: NextRequest): { buyerId: string; minted: boolean } {
  const existing = readBuyerId(req);
  return existing ? { buyerId: existing, minted: false } : { buyerId: newBuyerId(), minted: true };
}

export function setBuyerCookie(res: NextResponse, req: NextRequest, buyerId: string): void {
  res.cookies.set(REAP_DEMO_BUYER_COOKIE, buyerId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.nextUrl.protocol === 'https:',
    path: '/api/reap-checkout',
    maxAge: 7 * 24 * 3600,
  });
}

/** What the browser receives: the read view, never the raw gateway body. */
export function publicView(view: ReapCheckoutView) {
  return view;
}
