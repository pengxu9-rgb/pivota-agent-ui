import 'server-only';

// Shared plumbing for the /api/reap-checkout routes: the switch + arming guard, the configuration, the
// signed buyer cookie, the same-origin check, the body cap and the per-buyer rate limit.
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isReapCheckoutDemoServerEnabled } from './config';
import { isBuyerId, newBuyerId, readBuyerTokenConfig, type BuyerTokenConfig } from './buyerToken.server';
import { readAgentApiKey, readGatewayBase } from './gatewayClient.server';
import type { ReapCheckoutView } from './checkoutView';

export type ReapServerConfig = {
  base: string;
  apiKey: string;
  token: BuyerTokenConfig;
  profileUrl: string | null;
};

const NO_STORE = { 'cache-control': 'no-store' };
export const MAX_BODY_BYTES = 16 * 1024;

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** 404 when the demo is off OR not safely armed — the same answer as a route that does not exist. */
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

// ---- the buyer cookie ----------------------------------------------------------------------------------
//
// Session-length (no Max-Age), Path=/, HttpOnly, SameSite=Lax. On https it is `__Host-`-prefixed and
// Secure; on plain-http LOOPBACK (next dev on 127.0.0.1) the prefix is impossible (it requires Secure), so
// the unprefixed name is used there and ONLY there. The value is `<buyer id>.<HMAC>`: only ids this server
// issued are accepted. The HMAC key is derived (HKDF) from the demo issuer's private key, so there is no
// second secret to manage, and rotating the key logs every demo buyer out.
export const COOKIE_HTTPS = '__Host-pv_reap_demo_buyer';
export const COOKIE_LOOPBACK_HTTP = 'pv_reap_demo_buyer';
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLoopbackHttp(req: NextRequest): boolean {
  return req.nextUrl.protocol === 'http:' && LOOPBACK.has(req.nextUrl.hostname);
}

export function buyerCookieName(req: NextRequest): string {
  return isLoopbackHttp(req) ? COOKIE_LOOPBACK_HTTP : COOKIE_HTTPS;
}

function cookieMacKey(token: BuyerTokenConfig): Buffer {
  const pem = token.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return Buffer.from(hkdfSync('sha256', pem, 'pivota-reap-demo', 'buyer-cookie-v1', 32));
}

function mac(token: BuyerTokenConfig, buyerId: string): string {
  return createHmac('sha256', cookieMacKey(token)).update(buyerId).digest('base64url');
}

export function signBuyerId(token: BuyerTokenConfig, buyerId: string): string {
  return `${buyerId}.${mac(token, buyerId)}`;
}

export function verifySignedBuyerId(token: BuyerTokenConfig, raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 200) return null;
  const dot = raw.lastIndexOf('.');
  if (dot < 0) return null;
  const id = raw.slice(0, dot);
  const sig = Buffer.from(raw.slice(dot + 1));
  const want = Buffer.from(mac(token, id));
  if (!isBuyerId(id) || sig.length !== want.length || !timingSafeEqual(sig, want)) return null;
  return id;
}

export function readBuyerId(req: NextRequest, token: BuyerTokenConfig): string | null {
  return verifySignedBuyerId(token, req.cookies.get(buyerCookieName(req))?.value);
}

export function readOrMintBuyerId(req: NextRequest, token: BuyerTokenConfig): { buyerId: string; minted: boolean } {
  const existing = readBuyerId(req, token);
  return existing ? { buyerId: existing, minted: false } : { buyerId: newBuyerId(), minted: true };
}

export function setBuyerCookie(res: NextResponse, req: NextRequest, token: BuyerTokenConfig, buyerId: string): void {
  const loopbackHttp = isLoopbackHttp(req);
  res.cookies.set(buyerCookieName(req), signBuyerId(token, buyerId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: !loopbackHttp,
    path: '/',
  });
}

// ---- request guards --------------------------------------------------------------------------------------

/** A state-changing request must come from this origin: Origin present and its host equal to Host. */
export function sameOriginProblem(req: NextRequest): NextResponse | null {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!origin || !host) return json({ error: 'forbidden_origin' }, 403);
  try {
    if (new URL(origin).host.toLowerCase() !== host.toLowerCase()) return json({ error: 'forbidden_origin' }, 403);
  } catch {
    return json({ error: 'forbidden_origin' }, 403);
  }
  return null;
}

/** The JSON body, read with a hard byte cap. */
export async function readCappedJson(
  req: NextRequest,
  maxBytes = MAX_BODY_BYTES,
): Promise<{ body: unknown } | { response: NextResponse }> {
  const declared = Number(req.headers.get('content-length') || '0');
  if (declared > maxBytes) return { response: json({ error: 'payload_too_large' }, 413) };
  if (!req.body) return { body: null };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return { response: json({ error: 'payload_too_large' }, 413) };
    }
    chunks.push(value);
  }
  try {
    return { body: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  } catch {
    return { body: null };
  }
}

// ---- per-buyer rate limit (in-process; a demo runs one process) ------------------------------------------

type Bucket = { hits: number[] };
const buckets = new Map<string, Bucket>();
export const RATE_LIMITS = {
  create: { max: 6, windowMs: 10 * 60_000 },
  read: { max: 120, windowMs: 60_000 },
} as const;

export function __resetRateLimitsForTests() {
  buckets.clear();
}

/** The rate-limit key: the verified buyer id, else the client address (a new browser has no buyer yet). */
export function rateKey(req: NextRequest, buyerId: string | null): string {
  if (buyerId) return `buyer:${buyerId}`;
  const fwd = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return `addr:${fwd || 'local'}`;
}

export function rateLimited(kind: keyof typeof RATE_LIMITS, key: string, now = Date.now()): NextResponse | null {
  const { max, windowMs } = RATE_LIMITS[kind];
  const k = `${kind}:${key}`;
  const bucket = buckets.get(k) || { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= max) {
    buckets.set(k, bucket);
    const retry = Math.ceil((windowMs - (now - bucket.hits[0])) / 1000);
    const res = json({ error: 'rate_limited', message: 'Too many requests. Please wait a moment.' }, 429);
    res.headers.set('retry-after', String(Math.max(1, retry)));
    return res;
  }
  bucket.hits.push(now);
  buckets.set(k, bucket);
  if (buckets.size > 5000) buckets.clear();
  return null;
}

/** What the browser receives: the read view, plus the VERIFIED seller (from the gateway's answer). */
export function publicView(view: ReapCheckoutView, seller: { domain: string }) {
  return { ...view, seller };
}
