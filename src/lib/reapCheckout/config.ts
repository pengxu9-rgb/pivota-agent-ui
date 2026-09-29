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

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
// Hosts that serve production. The staging override can never name one.
const PRODUCTION_HOSTS = new Set(['pivota.cc', 'gateway.pivota.cc', 'agent.pivota.cc', 'api.pivota.cc', 'www.pivota.cc']);

function hostOf(raw: unknown): { host: string; protocol: string } | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    return { host: url.hostname.toLowerCase(), protocol: url.protocol };
  } catch {
    return null;
  }
}

/** An explicitly named STAGING host: a `staging` DNS label, https, never a production host. */
export function isExplicitStagingHost(host: string): boolean {
  return !PRODUCTION_HOSTS.has(host) && host.split('.').some((label) => label === 'staging' || label.startsWith('staging-'));
}

/**
 * Why the demo must NOT arm in this process, or null when it may. Every /api/reap-checkout route 404s
 * unless this is null, whatever the two flags say:
 *   - the gateway base must be LOOPBACK (the `gcloud run services proxy` to the staging gateway), and
 *     NODE_ENV must not be `production` (so no `next build` output, i.e. no deployed image, ever arms);
 *   - the one override, REAP_CHECKOUT_STAGING_GATEWAY_HOST, lets a deployed STAGING build arm against a
 *     STAGING gateway: the base must be https on exactly that host, and that host must carry a `staging`
 *     label and must not be a production host. It never admits a production host, in any environment.
 */
export function reapDemoArmingProblem(env: NodeJS.ProcessEnv = process.env): string | null {
  const base = hostOf(env.REAP_CHECKOUT_GATEWAY_BASE_URL);
  if (!base) return 'gateway_base_missing';
  const override = String(env.REAP_CHECKOUT_STAGING_GATEWAY_HOST || '').trim().toLowerCase();
  if (override) {
    if (!isExplicitStagingHost(override)) return 'override_not_a_staging_host';
    if (base.host !== override || base.protocol !== 'https:') return 'gateway_base_not_the_staging_override';
    return null;
  }
  if (!LOOPBACK_HOSTS.has(base.host)) return 'gateway_base_not_loopback';
  if (env.NODE_ENV === 'production') return 'production_build';
  return null;
}

/** The server switch: BOTH flags, AND the arming guard. */
export function isReapCheckoutDemoServerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    isTruthyFlag(env.REAP_CHECKOUT_DEMO_ENABLED) &&
    isTruthyFlag(env.NEXT_PUBLIC_REAP_CHECKOUT_DEMO) &&
    reapDemoArmingProblem(env) === null
  );
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
/** Server-side only: the Pivota merchant id(s) the demo will accept as the seller of a Reap purchase. */
export type DemoMerchantConfig = DemoMerchant & { merchantIds: string[] };

const MERCHANT_ID_RE = /^[A-Za-z0-9_.-]{1,80}$/;

/**
 * REAP_CHECKOUT_DEMO_MERCHANTS: comma list of `domain:MARKET:merchant_id[|merchant_id…]`, e.g.
 * `judydoll.com:US:merch_abc`. The merchant id is the `<merchant>` segment of the catalog product key
 * (`prod::<merchant>::shopify::<id>`) of the row the gateway's Reap lane buys; the create route refuses a
 * Reap checkout whose product key names any other seller (see sellerOfReapCheckoutId). An entry without a
 * merchant id is ignored: the demo never offers a purchase it cannot check the seller of.
 */
export function readDemoMerchantConfig(env: NodeJS.ProcessEnv = process.env): DemoMerchantConfig[] {
  const raw = String(env.REAP_CHECKOUT_DEMO_MERCHANTS || '').trim();
  if (!raw) return [];
  const out: DemoMerchantConfig[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const [d, m, ids] = part.split(':');
    const domain = canonicalMerchantDomain(d);
    const market = normalizeBuyerMarket(m);
    const merchantIds = String(ids || '')
      .split('|')
      .map((x) => x.trim())
      .filter((x) => MERCHANT_ID_RE.test(x));
    if (!domain || !market || !merchantIds.length || seen.has(domain)) continue;
    seen.add(domain);
    out.push({ domain, market, merchantIds });
  }
  return out;
}

/** What the client may see: domain and market only. */
export function readDemoMerchants(env: NodeJS.ProcessEnv = process.env): DemoMerchant[] {
  return readDemoMerchantConfig(env).map(({ domain, market }) => ({ domain, market }));
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
