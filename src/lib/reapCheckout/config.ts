// THE REAP CHECKOUT DEMO SWITCHES. Both default OFF, and both must be on.
//
//   NEXT_PUBLIC_REAP_CHECKOUT_DEMO   client: renders the "Buy with Reap" entry at all. Off = the PDP
//                                    renders exactly what it renders today and makes no extra request.
//   REAP_CHECKOUT_DEMO_ENABLED       server: the /api/reap-checkout routes answer at all. Off = 404,
//                                    whatever a client sends. A client flag is a build-time constant
//                                    anyone can flip in their own browser; this is the one that counts.
//
// Truthy spellings are an ALLOWLIST (1, true, on, yes), so a typo cannot arm it.
//
// Which merchants show the entry: REAP_CHECKOUT_DEMO_MERCHANTS, a comma list of `domain:MARKET`
// (e.g. `judydoll.com:US,jsmbeauty.sg:SG`). Empty = no merchant anywhere. This is a DEMO SCOPE,
// not an eligibility decision: the gateway's Reap lane and the backend rail stay authoritative
// (eligibility per market, Shopify row, single variant, the purchasability gate, Tier B verdict).
// When they decline, the create answer is not a Reap checkout and the UI says so and hands the
// buyer to the store as today.
import { normalizeBuyerMarket } from '@/lib/buyerMarket';

const TRUTHY = new Set(['1', 'true', 'on', 'yes']);

export function isTruthyFlag(raw: unknown): boolean {
  return typeof raw === 'string' && TRUTHY.has(raw.trim().toLowerCase());
}

/**
 * The client switch. `process.env.NEXT_PUBLIC_…` must be spelled out literally for Next to inline it
 * into the client bundle, so it is read here and nowhere else.
 */
export function isReapCheckoutDemoClientEnabled(): boolean {
  return isTruthyFlag(process.env.NEXT_PUBLIC_REAP_CHECKOUT_DEMO);
}

/** The server switch: BOTH flags. */
export function isReapCheckoutDemoServerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isTruthyFlag(env.REAP_CHECKOUT_DEMO_ENABLED) && isTruthyFlag(env.NEXT_PUBLIC_REAP_CHECKOUT_DEMO);
}

/** Lower case, one leading `www.` removed — the backend's own canonical merchant-domain spelling. */
export function canonicalMerchantDomain(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const host = raw.trim().toLowerCase().replace(/\.$/, '');
  if (!host || !/^[a-z0-9.-]+$/.test(host) || !host.includes('.')) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  return host.replace(/^www\./, '');
}

export type DemoMerchant = { domain: string; market: string };

export function readDemoMerchants(env: NodeJS.ProcessEnv = process.env): DemoMerchant[] {
  const raw = String(env.REAP_CHECKOUT_DEMO_MERCHANTS || '').trim();
  if (!raw) return [];
  const out: DemoMerchant[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const [d, m] = part.split(':');
    const domain = canonicalMerchantDomain(d);
    const market = normalizeBuyerMarket(m);
    if (!domain || !market || seen.has(domain)) continue;
    seen.add(domain);
    out.push({ domain, market });
  }
  return out;
}

/** The merchant's storefront host from a URL (the PDP's external redirect URL), canonicalised. */
export function merchantDomainFromUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return canonicalMerchantDomain(url.hostname);
  } catch {
    return null;
  }
}

/** The tag of the terms the buyer accepts in the demo form. ≤ 32 printable characters. */
export function reapConsentVersion(env: NodeJS.ProcessEnv = process.env): string {
  const raw = String(env.REAP_CHECKOUT_CONSENT_VERSION || '').trim();
  return raw && raw.length <= 32 && /^[\x21-\x7e]+$/.test(raw) ? raw : 'reap-agentic-v1';
}
