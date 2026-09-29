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
// Minted by this server only. Session-length in the browser (no Max-Age), Path=/, HttpOnly, SameSite=Lax;
// `__Host-`-prefixed and Secure on https, and on plain-http loopback (next dev on 127.0.0.1) the unprefixed
// name without Secure — the prefix requires Secure, and that is the only exemption.
// Value: `<buyer id>.<issued-at seconds>.<HMAC-SHA256(v2|id|iat)>`. The server rejects a value it did not
// issue, and one older than BUYER_MAX_AGE_SECONDS, and mints a new buyer instead. The HMAC key is derived
// (HKDF) from the demo issuer's private key: no second secret, and rotating the key logs every buyer out.
// POST /api/reap-checkout/reset clears it ("start as a new buyer").
export const COOKIE_HTTPS = '__Host-pv_reap_demo_buyer';
export const COOKIE_LOOPBACK_HTTP = 'pv_reap_demo_buyer';
export const BUYER_MAX_AGE_SECONDS = 4 * 3600;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLoopbackHttp(req: NextRequest): boolean {
  return req.nextUrl.protocol === 'http:' && LOOPBACK.has(req.nextUrl.hostname);
}

export function buyerCookieName(req: NextRequest): string {
  return isLoopbackHttp(req) ? COOKIE_LOOPBACK_HTTP : COOKIE_HTTPS;
}

function cookieMacKey(token: BuyerTokenConfig): Buffer {
  const pem = token.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return Buffer.from(hkdfSync('sha256', pem, 'pivota-reap-demo', 'buyer-cookie-v2', 32));
}

function mac(token: BuyerTokenConfig, buyerId: string, issuedAt: number): string {
  return createHmac('sha256', cookieMacKey(token)).update(`v2|${buyerId}|${issuedAt}`).digest('base64url');
}

export function signBuyerId(token: BuyerTokenConfig, buyerId: string, issuedAt = Math.floor(Date.now() / 1000)): string {
  return `${buyerId}.${issuedAt}.${mac(token, buyerId, issuedAt)}`;
}

export function verifySignedBuyerId(
  token: BuyerTokenConfig,
  raw: unknown,
  nowSeconds = Math.floor(Date.now() / 1000),
): string | null {
  if (typeof raw !== 'string' || raw.length > 200) return null;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [id, iatRaw, sigRaw] = parts;
  if (!isBuyerId(id) || !/^\d{9,11}$/.test(iatRaw)) return null;
  const iat = Number(iatRaw);
  if (iat > nowSeconds + 60 || nowSeconds - iat > BUYER_MAX_AGE_SECONDS) return null;
  const sig = Buffer.from(sigRaw);
  const want = Buffer.from(mac(token, id, iat));
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null;
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
  res.cookies.set(buyerCookieName(req), signBuyerId(token, buyerId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: !isLoopbackHttp(req),
    path: '/',
  });
}

export function clearBuyerCookie(res: NextResponse, req: NextRequest): void {
  res.cookies.set(buyerCookieName(req), '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: !isLoopbackHttp(req),
    path: '/',
    maxAge: 0,
  });
}

// ---- request guards --------------------------------------------------------------------------------------

/**
 * The demo server is reached on loopback only. Host must be a loopback name: a DNS-rebinding page (evil.com
 * resolved to 127.0.0.1) carries its own Host, and would otherwise pass an Origin == Host check.
 */
export function hostProblem(req: NextRequest): NextResponse | null {
  const host = (req.headers.get('host') || '').toLowerCase();
  let hostname = '';
  try {
    hostname = new URL(`http://${host}`).hostname;
  } catch {
    hostname = '';
  }
  return LOOPBACK.has(hostname) ? null : json({ error: 'not_found' }, 404);
}

/** A state-changing request must come from this origin: Origin present, its host == Host, and a browser's
 *  Sec-Fetch-Site (when sent) `same-origin`. */
export function sameOriginProblem(req: NextRequest): NextResponse | null {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return json({ error: 'forbidden_origin' }, 403);
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

// ---- rate limits (in-process; a demo runs one process) ---------------------------------------------------
//
// Counted ONLY for requests that are about to reach the gateway (a malformed or refused request costs
// nothing), per buyer AND globally. There is no per-address limit: the server is loopback-only, so every
// request has the same address, and X-Forwarded-For is attacker-controlled — it is never read. A fresh
// browser mints a fresh buyer, so the GLOBAL cap is what bounds a cookie-clearing client.

type Bucket = { hits: number[] };
const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;
export const RATE_LIMITS = {
  create: { max: 6, windowMs: 10 * 60_000 },
  read: { max: 120, windowMs: 60_000 },
  create_global: { max: 30, windowMs: 10 * 60_000 },
  read_global: { max: 600, windowMs: 60_000 },
} as const;

export function __resetRateLimitsForTests() {
  buckets.clear();
}

export function __bucketKeysForTests(): string[] {
  return [...buckets.keys()];
}

function take(kind: keyof typeof RATE_LIMITS, key: string, now: number): number | null {
  const { max, windowMs } = RATE_LIMITS[kind];
  const k = `${kind}:${key}`;
  const bucket = buckets.get(k) || { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= max) return Math.ceil((windowMs - (now - bucket.hits[0])) / 1000);
  bucket.hits.push(now);
  // Re-insert so Map order is least-recently-used first; evict the OLDEST keys, never all of them.
  buckets.delete(k);
  buckets.set(k, bucket);
  while (buckets.size > MAX_KEYS) {
    const oldest = buckets.keys().next().value as string;
    buckets.delete(oldest);
  }
  return null;
}

/** Per-buyer and global. Returns a 429 response, or null (and counts the request) when allowed. */
export function rateLimited(kind: 'create' | 'read', buyerId: string, now = Date.now()): NextResponse | null {
  const globalKind = kind === 'create' ? 'create_global' : 'read_global';
  // Check both before counting either, so a refused request does not consume the other budget.
  for (const [k, key] of [[kind, buyerId], [globalKind, 'all']] as const) {
    const { max, windowMs } = RATE_LIMITS[k];
    const hits = (buckets.get(`${k}:${key}`)?.hits || []).filter((t) => now - t < windowMs);
    if (hits.length >= max) {
      const res = json({ error: 'rate_limited', message: 'Too many requests. Please wait a moment.' }, 429);
      res.headers.set('retry-after', String(Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000))));
      return res;
    }
  }
  take(kind, buyerId, now);
  take(globalKind, 'all', now);
  return null;
}

/** What the browser receives: the read view, plus the VERIFIED seller (from the gateway's answer). */
export function publicView(view: ReapCheckoutView, seller: { domain: string }) {
  return { ...view, seller };
}
