// @vitest-environment node
import { generateKeyPairSync } from 'node:crypto';
import { readBuyerTokenConfig, newBuyerId } from '@/lib/reapCheckout/buyerToken.server';
import { signBuyerId, buyerScope } from '@/lib/reapCheckout/routeSupport.server';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HOSTED_URL,
  PRODUCT_ID,
  expectedDomainInvalidError,
  sellerMismatchError,
  viewUnavailableCheckout,
  withSeller,
  REAP_ID,
  awaitingApprovalCheckout,
  resolvingCheckout,
  rpcResult,
  storefrontEscalation,
} from '@/lib/reapCheckout/__fixtures__/checkouts';

const PEM = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const KEY = `ak_live_${'b'.repeat(64)}`;
const ORIGIN = 'http://localhost:3000';

function arm() {
  vi.stubEnv('NEXT_PUBLIC_REAP_CHECKOUT_DEMO', '1');
  vi.stubEnv('REAP_CHECKOUT_DEMO_ENABLED', 'true');
  vi.stubEnv('REAP_CHECKOUT_GATEWAY_BASE_URL', 'http://localhost:8081');
  vi.stubEnv('REAP_CHECKOUT_AGENT_API_KEY', KEY);
  vi.stubEnv('REAP_CHECKOUT_DEMO_MERCHANTS', 'judydoll.com:US,jsmbeauty.sg:SG:merch_jsm_demo');
  vi.stubEnv('REAP_DEMO_USER_JWT_PRIVATE_KEY', PEM);
  vi.stubEnv('REAP_DEMO_USER_JWT_KID', 'k1');
  vi.stubEnv('REAP_DEMO_USER_JWT_ISSUER', 'urn:example:reap-demo-test');
  vi.stubEnv('REAP_DEMO_USER_JWT_AUDIENCE', 'pivota-ucp');
}

const BUYER = {
  email: 'ada@example.test',
  first_name: 'Ada',
  last_name: 'Lovelace',
  phone: '+15550100',
  address_line1: '900 Brannan St',
  city: 'San Francisco',
  region: 'CA',
  postal_code: '94103',
  country: 'US',
};

function createReq(
  extra: Record<string, unknown> = {},
  opts: { cookie?: string; origin?: string | null; url?: string; body?: string; contentType?: string } = {},
) {
  const url = opts.url || `${ORIGIN}/api/reap-checkout`;
  const u = new URL(url);
  const origin = opts.origin === undefined ? u.origin : opts.origin;
  const token = readBuyerTokenConfig();
  const id = opts.cookie?.split('=')[1]?.split('.')[0] || newBuyerId();
  const cookie = opts.cookie === undefined && token ? `${u.protocol === 'http:' ? 'pv_reap_demo_buyer' : '__Host-pv_reap_demo_buyer'}=${signBuyerId(token, id)}` : opts.cookie;
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': opts.contentType || 'application/json',
      host: u.host,
      ...(origin ? { origin } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body:
      opts.body ??
      JSON.stringify({
        product_id: 'sig_6433c8107859a484fb72d14861e84690',
        merchant_domain: 'www.judydoll.com',
        quantity: 1,
        idempotency_key: '8d2f4c1e-8a7b-4f0e-9c1d-2b3a4c5d6e7f',
        consent: true,
        offer_code: ' PeachIE20 ',
        buyer: BUYER,
        buyer_scope: token ? buyerScope(token, id) : undefined,
        ...extra,
      }),
  });
}

function getReq(id: string, cookie?: string) {
  return new NextRequest(`${ORIGIN}/api/reap-checkout/${encodeURIComponent(id)}`, {
    headers: { host: 'localhost:3000', ...(cookie ? { cookie } : {}) },
  });
}

/** The buyer cookie (name=value) a create answered with. */
function cookieFrom(res: Response): string {
  return (res.headers.get('set-cookie') || '').split(';')[0];
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function allRoutes() {
  const { POST } = await import('./route');
  const { GET } = await import('./[checkoutId]/route');
  const { GET: CONFIG } = await import('./config/route');
  const { GET: JWKS } = await import('./jwks/route');
  return { POST, GET, CONFIG, JWKS };
}

async function expectAll404() {
  const { POST, GET, CONFIG, JWKS } = await allRoutes();
  expect((await POST(createReq())).status).toBe(404);
  expect((await GET(getReq(REAP_ID), { params: Promise.resolve({ checkoutId: REAP_ID }) })).status).toBe(404);
  expect((await CONFIG(getReq('config'))).status).toBe(404);
  expect((await JWKS(getReq('jwks'))).status).toBe(404);
  expect(fetchMock).not.toHaveBeenCalled();
}

function gatewayAnswers(value: unknown) {
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(rpcResult(value)), { status: 200 }));
}

describe('flag off: every /api/reap-checkout route is a 404 and calls nothing', () => {
  it.each([
    ['neither flag', {}],
    ['client flag only', { NEXT_PUBLIC_REAP_CHECKOUT_DEMO: '1' }],
    ['server flag only', { REAP_CHECKOUT_DEMO_ENABLED: '1' }],
    ['typo', { NEXT_PUBLIC_REAP_CHECKOUT_DEMO: 'ture', REAP_CHECKOUT_DEMO_ENABLED: 'ture' }],
  ])('%s', async (_label, env) => {
    arm();
    vi.stubEnv('NEXT_PUBLIC_REAP_CHECKOUT_DEMO', '');
    vi.stubEnv('REAP_CHECKOUT_DEMO_ENABLED', '');
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
    await expectAll404();
  });
});

describe('arming guard: both flags on, but not loopback + non-production -> 404 everywhere', () => {
  it.each([
    ['production gateway', { REAP_CHECKOUT_GATEWAY_BASE_URL: 'https://gateway.pivota.cc' }],
    ['a non-loopback example host', { REAP_CHECKOUT_GATEWAY_BASE_URL: 'https://gateway.example.test' }],
    ['plain http to a non-loopback host', { REAP_CHECKOUT_GATEWAY_BASE_URL: 'http://gateway.pivota.cc' }],
    ['no gateway base', { REAP_CHECKOUT_GATEWAY_BASE_URL: '' }],
  ])('%s', async (_label, env) => {
    arm();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
    await expectAll404();
  });

  it.each([
    ['loopback base', {}],
    ['loopback base + the removed override var', { REAP_CHECKOUT_STAGING_GATEWAY_HOST: 'gateway.example.test' }],
    ['override + matching staging base', { REAP_CHECKOUT_STAGING_GATEWAY_HOST: 'gateway.example.test', REAP_CHECKOUT_GATEWAY_BASE_URL: 'https://gateway.example.test' }],
    ['127.0.0.1 base', { REAP_CHECKOUT_GATEWAY_BASE_URL: 'http://127.0.0.1:8081' }],
  ])('NODE_ENV=production NEVER arms, whatever the env (%s)', async (_label, env) => {
    arm();
    vi.stubEnv('NODE_ENV', 'production');
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
    await expectAll404();
  });

  it('loopback + non-production arms; the client sees domain + market + the terms, never merchant ids', async () => {
    arm();
    for (const base of ['http://localhost:8081', 'http://127.0.0.1:8081']) {
      vi.stubEnv('REAP_CHECKOUT_GATEWAY_BASE_URL', base);
      vi.resetModules();
      const { CONFIG } = await allRoutes();
      const body = await (await CONFIG(getReq('config'))).json();
      expect(body.merchants).toEqual([
        { domain: 'judydoll.com', market: 'US' },
        { domain: 'jsmbeauty.sg', market: 'SG' },
      ]);
      expect(body.terms).toEqual({ url: 'https://pivota.cc/terms', version: 'reap-agentic-v1' });
      expect(JSON.stringify(body)).not.toContain('merch_');
    }
  });

  it('HOST ALLOWLIST: a non-loopback Host (DNS rebinding) is 404 on every route, nothing called', async () => {
    arm();
    const { POST, GET, CONFIG } = await allRoutes();
    const evil = 'http://evil.example:3000';
    expect((await POST(createReq({}, { url: `${evil}/api/reap-checkout` }))).status).toBe(404);
    const g = new NextRequest(`${evil}/api/reap-checkout/${REAP_ID}`, { headers: { host: 'evil.example:3000' } });
    expect((await GET(g, { params: Promise.resolve({ checkoutId: REAP_ID }) })).status).toBe(404);
    expect((await CONFIG(new NextRequest(`${evil}/api/reap-checkout/config`, { headers: { host: 'evil.example:3000' } }))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/reap-checkout (armed)', () => {
  it('creates through the UCP door, answers a read view with the VERIFIED seller, sets the buyer cookie', async () => {
    arm();
    gatewayAnswers(resolvingCheckout({ code: ' PeachIE20 ' }));
    const { POST } = await import('./route');
    const res = await POST(createReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checkout).toMatchObject({ id: REAP_ID, phase: 'preparing', isReapCheckout: true, seller: { domain: 'judydoll.com' } });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8081/ucp/mcp');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Agent-API-Key']).toBe(KEY);
    expect(headers['X-Agent-User-JWT'].split('.')).toHaveLength(3);
    const rpc = JSON.parse(String(init.body));
    expect(rpc.params.name).toBe('create_checkout');
    // The code goes to the door EXACTLY as typed.
    expect(rpc.params.arguments.checkout.discounts).toEqual({ codes: [' PeachIE20 '] });
    expect(rpc.params.arguments.checkout.context).toEqual({ address_country: 'US' });
  });

  it('SELLER CONTRACT: create sends checkout.reap.expected_merchant_domain from SERVER config, never the browser\'s spelling', async () => {
    arm();
    gatewayAnswers(resolvingCheckout());
    const { POST } = await import('./route');
    // The browser sends "www.JudyDoll.com"; the configured merchant is "judydoll.com".
    expect((await POST(createReq({ merchant_domain: 'www.JudyDoll.com' }))).status).toBe(200);
    const rpc = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(rpc.params.arguments.checkout.reap).toEqual({ expected_merchant_domain: 'judydoll.com' });
  });

  it.each([['different_seller'], ['seller_unconfirmed']] as const)(
    'SELLER CONTRACT: a ucp_seller_mismatch refusal (%s) answers seller_mismatch with NO gateway text or link',
    async (cause) => {
      arm();
      fetchMock.mockImplementation(async () => new Response(JSON.stringify(rpcResult(sellerMismatchError(cause), true)), { status: 200 }));
      const { POST } = await import('./route');
      const body = await (await POST(createReq())).json();
      expect(body).toMatchObject({ checkout: null, blocked: 'seller_mismatch', cause });
      expect(JSON.stringify(body)).not.toMatch(/other\.com|m_other|http/);
    },
  );

  it('SELLER CONTRACT: ucp_expected_merchant_domain_invalid is a logged config bug and the generic not-available answer', async () => {
    arm();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(rpcResult(expectedDomainInvalidError(), true)), { status: 200 }));
    const { POST } = await import('./route');
    expect(await (await POST(createReq())).json()).toMatchObject({ checkout: null, blocked: 'not_available' });
    expect(err).toHaveBeenCalledWith(expect.stringContaining('expected_merchant_domain'), { domain: 'judydoll.com' });
    err.mockRestore();
  });

  it('SELLER CONTRACT: the judydoll external-seed answer (reap.merchant_domain only, NO merchant_id) is accepted', async () => {
    arm();
    gatewayAnswers(resolvingCheckout());
    const { POST } = await import('./route');
    const body = await (await POST(createReq({ product_id: PRODUCT_ID }))).json();
    expect(body.checkout.publishedSeller).toEqual({ domain: 'judydoll.com', merchantId: null, merchantIdUnusable: false });
    expect(body.checkout.seller).toEqual({ domain: 'judydoll.com' });
  });

  it('SELLER CONTRACT: the published host is compared www.-folded and lowercased', async () => {
    arm();
    withSeller({ domain: 'www.judydoll.com' }, () => gatewayAnswers(resolvingCheckout()));
    const { POST } = await import('./route');
    expect((await (await POST(createReq())).json()).checkout.seller).toEqual({ domain: 'judydoll.com' });
  });

  it.each([
    ['another host', { domain: 'www.other.com' }],
    ['a subdomain (not the same seller)', { domain: 'shop.judydoll.com' }],
    ['no published seller at all', { domain: null }],
    ['a configured merchant id that disagrees', { domain: 'jsmbeauty.sg', merchantId: 'm_other' }],
  ])('SELLER CONTRACT (belt and braces): a Reap answer publishing %s is refused, no link', async (_l, seller) => {
    arm();
    withSeller(seller, () => gatewayAnswers(awaitingApprovalCheckout()));
    const { POST } = await import('./route');
    const req =
      seller.domain === 'jsmbeauty.sg'
        ? createReq({ merchant_domain: 'jsmbeauty.sg', buyer: { ...BUYER, country: 'SG', postal_code: '018956' } })
        : createReq();
    const body = await (await POST(req)).json();
    expect(body).toMatchObject({ checkout: null, blocked: 'seller_mismatch', cause: 'seller_unconfirmed' });
    expect(JSON.stringify(body)).not.toContain('prava.space');
  });

  it('SELLER CONTRACT: a configured merchant id that MATCHES the published one is accepted; an absent published id is fine', async () => {
    arm();
    const { POST } = await import('./route');
    const sg = () => createReq({ merchant_domain: 'jsmbeauty.sg', buyer: { ...BUYER, country: 'SG', postal_code: '018956' } });
    withSeller({ domain: 'jsmbeauty.sg', merchantId: 'merch_jsm_demo' }, () => gatewayAnswers(resolvingCheckout()));
    expect((await (await POST(sg())).json()).checkout.seller).toEqual({ domain: 'jsmbeauty.sg' });
    withSeller({ domain: 'jsmbeauty.sg' }, () => gatewayAnswers(resolvingCheckout()));
    expect((await (await POST(sg())).json()).checkout.seller).toEqual({ domain: 'jsmbeauty.sg' });
  });

  it('a non-Reap (storefront) answer is a fallback: its continue_url is NOT forwarded', async () => {
    arm();
    gatewayAnswers(storefrontEscalation({ codeWarning: true }));
    const { POST } = await import('./route');
    const body = await (await POST(createReq())).json();
    expect(body).toMatchObject({ error: 'checkout_outcome_unknown', attempt_outcome: 'unknown' });
    expect(JSON.stringify(body)).not.toContain('judydoll.com/cart');
  });

  it('a Reap checkout whose link is not Reap\'s answers no link', async () => {
    arm();
    gatewayAnswers(awaitingApprovalCheckout({ continueUrl: 'https://reap.global.evil.com/pay' }));
    const { POST } = await import('./route');
    const body = await (await POST(createReq())).json();
    expect(body.checkout.continueUrl).toBeNull();
    expect(body.checkout.continueUrlRefused).toBe(true);
    expect(JSON.stringify(body)).not.toContain('evil.com');
  });

  it('refuses a merchant or market outside the demo scope without calling the gateway', async () => {
    arm();
    const { POST } = await import('./route');
    expect((await POST(createReq({ merchant_domain: 'flowerbeauty.com' }))).status).toBe(403);
    expect((await POST(createReq({ merchant_domain: 'jsmbeauty.sg' }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('REAP_CHECKOUT_DEMO_MERCHANTS: the merchant id is optional; a malformed id list drops the entry', async () => {
    arm();
    const { readDemoMerchantConfig } = await import('@/lib/reapCheckout/config');
    expect(readDemoMerchantConfig({ REAP_CHECKOUT_DEMO_MERCHANTS: 'judydoll.com:US' } as any)).toEqual([
      { domain: 'judydoll.com', market: 'US', merchantIds: [] },
    ]);
    expect(readDemoMerchantConfig({ REAP_CHECKOUT_DEMO_MERCHANTS: 'a.com:US:m_1|m_2,b.com:US:bad id!' } as any)).toEqual([
      { domain: 'a.com', market: 'US', merchantIds: ['m_1', 'm_2'] },
    ]);
  });

  it('refuses a non-JSON body (cross-site form) before calling anything', async () => {
    arm();
    const { POST } = await import('./route');
    expect((await POST(createReq({}, { contentType: 'text/plain' }))).status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['no Origin', { origin: null }],
    ['another origin', { origin: 'https://evil.example' }],
    ['same host, other port', { origin: 'http://localhost:3001' }],
    ['opaque origin', { origin: 'null' }],
  ])('ORIGIN: %s -> 403, nothing called', async (_l, opts) => {
    arm();
    const { POST } = await import('./route');
    expect((await POST(createReq({}, opts))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('BODY CAP: > 16 KiB is 413, nothing called', async () => {
    arm();
    const { POST } = await import('./route');
    const big = JSON.stringify({ pad: 'x'.repeat(17 * 1024) });
    expect((await POST(createReq({}, { body: big }))).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('BODY CAP: the streamed body is capped even when Content-Length is absent', async () => {
    arm();
    const { readCappedJson } = await import('@/lib/reapCheckout/routeSupport.server');
    const stream = new ReadableStream({
      start(c) {
        for (let i = 0; i < 20; i++) c.enqueue(new TextEncoder().encode('x'.repeat(1024)));
        c.close();
      },
    });
    const req = new NextRequest(`${ORIGIN}/api/reap-checkout`, { method: 'POST', body: stream, duplex: 'half' } as any);
    const out = await readCappedJson(req);
    expect('response' in out && out.response.status).toBe(413);
  });

  it('RATE LIMIT: the 7th gateway-bound create from one buyer in 10 minutes is 429', async () => {
    arm();
    gatewayAnswers(resolvingCheckout());
    const { POST } = await import('./route');
    const first = createReq(); const cookie = first.headers.get('cookie')!;
    const firstResponse = await POST(first); expect(firstResponse.headers.get('set-cookie')).toBeNull(); // existing buyer; first create counted
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await POST(createReq({}, { cookie }))).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('RATE LIMIT: refused requests (bad body, wrong merchant) are NOT counted and cannot lock anyone out', async () => {
    arm();
    gatewayAnswers(resolvingCheckout());
    const { POST } = await import('./route');
    for (let i = 0; i < 20; i++) {
      expect((await POST(createReq({ consent: false }))).status).toBe(400);
      expect((await POST(createReq({ merchant_domain: 'nope.example' }))).status).toBe(403);
    }
    expect((await POST(createReq())).status).toBe(200);
  });

  it('RATE LIMIT: X-Forwarded-For is ignored (rotating it neither evades nor spreads the limit)', async () => {
    arm();
    gatewayAnswers(resolvingCheckout());
    const { POST } = await import('./route');
    const first = createReq(); const cookie = first.headers.get('cookie')!;
    await POST(first);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const req = createReq({}, { cookie });
      req.headers.set('x-forwarded-for', `10.0.0.${i}`);
      statuses.push((await POST(req)).status);
    }
    expect(statuses.at(-1)).toBe(429);
  });

  it('RATE LIMIT: a GLOBAL cap bounds fresh buyers (cookie-clearing clients): the 31st create in 10 min is 429', async () => {
    arm();
    gatewayAnswers(resolvingCheckout());
    const { POST } = await import('./route');
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await POST(createReq())).status); // no cookie: a new buyer each time
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
  });

  it('RATE LIMIT: the key table evicts the OLDEST keys, never flushes every limit', async () => {
    arm();
    const { rateLimited, __bucketKeysForTests } = await import('@/lib/reapCheckout/routeSupport.server');
    const t0 = 1_000_000;
    for (let i = 0; i < 6000; i++) expect(rateLimited('read', `rdb_${i}`, t0 + i * 1000)).toBeNull();
    const keys = __bucketKeysForTests();
    expect(keys.length).toBeLessThanOrEqual(5000);
    expect(keys.length).toBeGreaterThan(4000); // not flushed
    expect(keys).not.toContain('read:rdb_0'); // the oldest went first
    expect(keys).toContain('read:rdb_5999'); // the newest stayed
    expect(keys).toContain('read_global:all'); // the global counter, touched on every request, survives
  });

  it('SEC-FETCH-SITE: a browser saying cross-site or same-site is refused', async () => {
    arm();
    const { POST } = await import('./route');
    for (const site of ['cross-site', 'same-site', 'none']) {
      const req = createReq();
      req.headers.set('sec-fetch-site', site);
      expect((await POST(req)).status).toBe(403);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('BODY CAP: a declared Content-Length over the cap is refused before reading', async () => {
    arm();
    const { readCappedJson } = await import('@/lib/reapCheckout/routeSupport.server');
    const req = new NextRequest(`${ORIGIN}/api/reap-checkout`, {
      method: 'POST',
      headers: { 'content-length': String(100_000) },
      body: '{}',
    });
    const out = await readCappedJson(req);
    expect('response' in out && out.response.status).toBe(413);
  });

  it('QUANTITY BINDING: a Reap answer quoting a different quantity than requested is refused', async () => {
    arm();
    gatewayAnswers(resolvingCheckout()); // line_items[0].quantity is 1
    const { POST } = await import('./route');
    expect(await (await POST(createReq({ quantity: 2 }))).json()).toMatchObject({
      checkout: null,
      blocked: 'seller_mismatch',
      cause: 'seller_unconfirmed',
    });
    expect((await (await POST(createReq({ quantity: 1 }))).json()).checkout).toBeTruthy();
  });

  it('R4: refused first requests mint an owner; established-owner 429 never renews its cookie', async () => {
    arm();
    gatewayAnswers(resolvingCheckout());
    const { POST } = await import('./route');
    const hasCookie = (res: Response) => /pv_reap_demo_buyer=rdb_/.test(res.headers.get('set-cookie') || '');
    const bad = await POST(createReq({ consent: false }, { cookie: '' }));
    expect(bad.status).toBe(400);
    expect(hasCookie(bad)).toBe(true);
    const scope = await POST(createReq({ merchant_domain: 'nope.example' }, { cookie: '' }));
    expect(scope.status).toBe(403);
    expect(hasCookie(scope)).toBe(true);
    const big = await POST(createReq({}, { body: JSON.stringify({ pad: 'x'.repeat(17 * 1024) }), cookie: '' }));
    expect(big.status).toBe(413);
    expect(hasCookie(big)).toBe(true);
    for (let i = 0; i < 30; i++) await POST(createReq()); // exhaust the global create cap with fresh buyers
    const limited = await POST(createReq());
    expect(limited.status).toBe(429);
    expect(hasCookie(limited)).toBe(false);
  });

  it('R2: the GLOBAL read cap: the 601st read in a minute across all buyers is 429', async () => {
    arm();
    const { rateLimited } = await import('@/lib/reapCheckout/routeSupport.server');
    const now = 5_000_000;
    // 600 reads spread over many buyers (each well under the per-buyer 120).
    for (let i = 0; i < 600; i++) expect(rateLimited('read', `rdb_${i % 10}`, now + i)).toBeNull();
    const res = rateLimited('read', 'rdb_fresh_buyer', now + 600);
    expect(res?.status).toBe(429);
    // A minute later the window has moved on.
    expect(rateLimited('read', 'rdb_fresh_buyer', now + 600 + 60_000)).toBeNull();
  });

  it.each([false, true])('a paused checkout clears only a fresh attempt (recovery=%s)', async (recover_only) => {
    arm();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(rpcResult({error:{code:'OPERATION_NOT_ALLOWED', detail:{reason:'reap_create_paused'}}}, true)), {status:200}));
    const { POST } = await import('./route');
    const res = await POST(createReq({ recover_only }));
    if (recover_only) expect(res.status).toBe(502);
    else expect(await res.json()).toMatchObject({attempt_outcome:'not_created',blocked:'paused'});
  });

  it.each([false, true])('variant pre-dispatch refusal clears only a fresh attempt (recovery=%s)', async (recover_only) => {
    arm();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(rpcResult({error:{code:'QUOTE_REQUIRED', detail:{reason:'ucp_reap_variant_not_created'}}}, true)), {status:200}));
    const { POST } = await import('./route');
    const res = await POST(createReq({ recover_only }));
    const body = await res.json();
    if (recover_only) {
      expect(res.status).toBe(502);
      expect(body.attempt_outcome).toBe('unknown');
    } else {
      expect(res.status).toBe(200);
      expect(body).toMatchObject({attempt_outcome:'not_created',blocked:'not_available'});
    }
  });

  it('TOOL ERROR: the reason is read from the door\'s real shape ({error:{code,message,detail:{reason}}})', async () => {
    arm();
    gatewayAnswers(undefined);
    fetchMock.mockImplementation(async () =>
      new Response(
        JSON.stringify(
          rpcResult(
            {
              error: {
                code: 'QUOTE_REQUIRED',
                message: 'The offer code is not a valid shape.',
                detail: { reason: 'ucp_offer_code_invalid', fields: ['checkout.discounts'] },
              },
            },
            true,
          ),
        ),
        { status: 200 },
      ),
    );
    const { POST } = await import('./route');
    const body = await (await POST(createReq())).json();
    expect(body).toEqual({ error: 'checkout_outcome_unknown', code: 'QUOTE_REQUIRED', reason: 'ucp_offer_code_invalid' });
    // Gateway prose is never forwarded to the browser.
    expect(JSON.stringify(body)).not.toContain('not a valid shape');
  });

  it('answers 503 naming the missing setting, never a value', async () => {
    arm();
    vi.stubEnv('REAP_CHECKOUT_AGENT_API_KEY', '');
    const { POST } = await import('./route');
    const res = await POST(createReq());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.missing).toEqual(['REAP_CHECKOUT_AGENT_API_KEY']);
    expect(JSON.stringify(body)).not.toContain('BEGIN');
  });

  it('a gateway outage is a 502, not a checkout', async () => {
    arm();
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const { POST } = await import('./route');
    expect((await POST(createReq())).status).toBe(502);
  });
});

describe('the buyer cookie', () => {
  function attrs(res: Response) {
    const raw = res.headers.get('set-cookie') || '';
    const [nv, ...rest] = raw.split(';').map((s) => s.trim());
    const a: Record<string, string | true> = Object.fromEntries(
      rest.map((p) => {
        const [k, v] = p.split('=');
        return [k.toLowerCase(), v ?? true];
      }),
    );
    return { name: nv.split('=')[0], value: nv.slice(nv.indexOf('=') + 1), a };
  }

  it('https: __Host- prefixed, Secure, HttpOnly, SameSite=Lax, Path=/, no Domain, session-length, HMAC-signed', async () => {
    arm();
    gatewayAnswers(resolvingCheckout());
    const { POST } = await import('./route');
    const c = attrs(await POST(createReq({}, { url: 'https://localhost:3000/api/reap-checkout', cookie: '' })));
    expect(c.name).toBe('__Host-pv_reap_demo_buyer');
    expect(c.a.secure).toBe(true);
    expect(c.a.httponly).toBe(true);
    expect(String(c.a.samesite).toLowerCase()).toBe('lax');
    expect(c.a.path).toBe('/');
    expect(c.a).not.toHaveProperty('domain');
    expect(c.a).not.toHaveProperty('max-age');
    expect(c.a).not.toHaveProperty('expires');
    expect(c.value).toMatch(/^rdb_[A-Za-z0-9_-]+\.\d{10}\.[A-Za-z0-9_-]{43}$/);
  });

  it('plain-http loopback: unprefixed and not Secure (the only exemption), otherwise the same', async () => {
    arm();
    gatewayAnswers(resolvingCheckout());
    const { POST } = await import('./route');
    const c = attrs(await POST(createReq({}, { cookie: '' })));
    expect(c.name).toBe('pv_reap_demo_buyer');
    expect(c.a).not.toHaveProperty('secure');
    expect(c.a.httponly).toBe(true);
    expect(c.a.path).toBe('/');
    expect(String(c.a.samesite).toLowerCase()).toBe('lax');
  });

  it('an https request ignores the loopback cookie name (no downgrade)', async () => {
    arm();
    gatewayAnswers(resolvingCheckout());
    const { POST } = await import('./route');
    const first = createReq(); const loopCookie = first.headers.get('cookie')!; await POST(first);
    const { GET } = await import('./[checkoutId]/route');
    const req = new NextRequest(`https://localhost:3000/api/reap-checkout/${REAP_ID}`, { headers: { cookie: loopCookie, host: 'localhost:3000' } });
    fetchMock.mockClear();
    expect((await GET(req, { params: Promise.resolve({ checkoutId: REAP_ID }) })).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a valid MAC moved onto ANOTHER buyer id (or another issue time) is rejected', async () => {
    arm();
    gatewayAnswers(resolvingCheckout());
    const { POST } = await import('./route');
    const first = createReq(); const [name, value] = first.headers.get('cookie')!.split('='); await POST(first);
    const [id, iat, sig] = value.split('.');
    const otherId = `rdb_${'B'.repeat(32)}`;
    const { GET } = await import('./[checkoutId]/route');
    fetchMock.mockClear();
    for (const forged of [`${otherId}.${iat}.${sig}`, `${id}.${Number(iat) - 1}.${sig}`]) {
      expect((await GET(getReq(REAP_ID, `${name}=${forged}`), { params: Promise.resolve({ checkoutId: REAP_ID }) })).status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a buyer cookie older than 4 hours is no buyer (a new one is minted)', async () => {
    arm();
    const { signBuyerId, verifySignedBuyerId, BUYER_MAX_AGE_SECONDS } = await import('@/lib/reapCheckout/routeSupport.server');
    const { readBuyerTokenConfig } = await import('@/lib/reapCheckout/buyerToken.server');
    const token = readBuyerTokenConfig()!;
    const id = `rdb_${'C'.repeat(32)}`;
    const now = 1_900_000_000;
    expect(BUYER_MAX_AGE_SECONDS).toBe(4 * 3600);
    expect(verifySignedBuyerId(token, signBuyerId(token, id, now - 3 * 3600), now)).toBe(id);
    expect(verifySignedBuyerId(token, signBuyerId(token, id, now - 4 * 3600 - 1), now)).toBeNull();
    expect(verifySignedBuyerId(token, signBuyerId(token, id, now + 3600), now)).toBeNull();
  });

  it('POST /reset clears the cookie (start as a new buyer), same guards', async () => {
    arm();
    const { POST: RESET } = await import('./reset/route');
    const req = new NextRequest(`${ORIGIN}/api/reap-checkout/reset`, {
      method: 'POST',
      headers: { host: 'localhost:3000', origin: ORIGIN, cookie: 'pv_reap_demo_buyer=x' },
    });
    const res = await RESET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/pv_reap_demo_buyer=;.*Max-Age=0/i);
    const cross = new NextRequest(`${ORIGIN}/api/reap-checkout/reset`, { method: 'POST', headers: { host: 'localhost:3000', origin: 'https://evil.example' } });
    expect((await RESET(cross)).status).toBe(403);
  });

  it('only server-issued buyer ids are accepted: a forged or unsigned cookie is no buyer', async () => {
    arm();
    const { GET } = await import('./[checkoutId]/route');
    const params = { params: Promise.resolve({ checkoutId: REAP_ID }) };
    for (const forged of [`pv_reap_demo_buyer=rdb_${'A'.repeat(32)}`, `pv_reap_demo_buyer=rdb_${'A'.repeat(32)}.1900000000.${'x'.repeat(43)}`]) {
      expect((await GET(getReq(REAP_ID, forged), params)).status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/reap-checkout/:id (armed)', () => {
  async function buyerCookie() {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(rpcResult(resolvingCheckout())), { status: 200 }));
    const { POST } = await import('./route');
    const first = createReq(); const cookie = first.headers.get('cookie')!;
    await POST(first);
    fetchMock.mockReset();
    return cookie;
  }

  it('needs the buyer cookie and a reap id; answers the verified seller; maps QUOTE_NOT_FOUND to 404', async () => {
    arm();
    const cookie = await buyerCookie();
    const { GET } = await import('./[checkoutId]/route');
    const params = { params: Promise.resolve({ checkoutId: REAP_ID }) };
    expect((await GET(getReq(REAP_ID), params)).status).toBe(404);
    const bad = { params: Promise.resolve({ checkoutId: 'esc_abc' }) };
    expect((await GET(getReq('esc_abc', cookie), bad)).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(rpcResult(awaitingApprovalCheckout())), { status: 200 }));
    const ok = await GET(getReq(REAP_ID, cookie), params);
    expect(ok.status).toBe(200);
    const view = (await ok.json()).checkout;
    expect(view.phase).toBe('awaiting_approval');
    expect(view.seller).toEqual({ domain: 'judydoll.com' });
    const rpc = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(rpc.params).toMatchObject({ name: 'get_checkout', arguments: { id: REAP_ID } });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(rpcResult({ error: { code: 'QUOTE_NOT_FOUND' } }, true)), { status: 200 }));
    expect((await GET(getReq(REAP_ID, cookie), params)).status).toBe(404);
  });

  it('an answer for a DIFFERENT checkout than asked is not shown (502)', async () => {
    arm();
    const cookie = await buyerCookie();
    const { GET } = await import('./[checkoutId]/route');
    const otherPurchase = REAP_ID.replace('0123456789abcdef01234567', 'ffffffffffffffffffffffff');
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(rpcResult({ ...awaitingApprovalCheckout(), id: otherPurchase })), { status: 200 }),
    );
    const res = await GET(getReq(REAP_ID, cookie), { params: Promise.resolve({ checkoutId: REAP_ID }) });
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain('prava.space');
  });

  it('GET: an answer PUBLISHING another seller is 404 (not a demo purchase), nothing shown', async () => {
    arm();
    const cookie = await buyerCookie();
    const { GET } = await import('./[checkoutId]/route');
    withSeller({ domain: 'www.other.com' }, () =>
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(rpcResult(awaitingApprovalCheckout())), { status: 200 })),
    );
    const res = await GET(getReq(REAP_ID, cookie), { params: Promise.resolve({ checkoutId: REAP_ID }) });
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain('prava.space');
  });

  it('GET: the degraded read publishes no seller -> answered WITHOUT a seller (the browser keeps the last one)', async () => {
    arm();
    const cookie = await buyerCookie();
    const { GET } = await import('./[checkoutId]/route');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(rpcResult(viewUnavailableCheckout())), { status: 200 }));
    const res = await GET(getReq(REAP_ID, cookie), { params: Promise.resolve({ checkoutId: REAP_ID }) });
    expect(res.status).toBe(200);
    const view = (await res.json()).checkout;
    expect(view.viewUnavailable).toBe(true);
    expect(view.seller).toBeUndefined();
  });

  it('GET: a degraded read NEVER carries a payment link to the browser, even if the gateway sent one', async () => {
    arm();
    const cookie = await buyerCookie();
    const { GET } = await import('./[checkoutId]/route');
    const degradedWithLink = { ...(viewUnavailableCheckout() as any), continue_url: 'https://pay.prava.space/checkout/chk_x' };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(rpcResult(degradedWithLink)), { status: 200 }));
    const res = await GET(getReq(REAP_ID, cookie), { params: Promise.resolve({ checkoutId: REAP_ID }) });
    expect(res.status).toBe(200);
    const view = (await res.json()).checkout;
    expect(view.viewUnavailable).toBe(true);
    expect(view.continueUrl).toBeNull();
    expect(view.seller).toBeUndefined();
  });

  it('GET: a good read that publishes NO seller is not shown (502)', async () => {
    arm();
    const cookie = await buyerCookie();
    const { GET } = await import('./[checkoutId]/route');
    withSeller({ domain: null }, () =>
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(rpcResult(awaitingApprovalCheckout())), { status: 200 })),
    );
    expect((await GET(getReq(REAP_ID, cookie), { params: Promise.resolve({ checkoutId: REAP_ID }) })).status).toBe(502);
  });

  it('a literal "%" in the (already decoded) id is a clean 404, not a 500', async () => {
    arm();
    const cookie = await buyerCookie();
    const { GET } = await import('./[checkoutId]/route');
    for (const id of ['%', '%25', 'reap_%E0%A4%A']) {
      expect((await GET(getReq('x', cookie), { params: Promise.resolve({ checkoutId: id }) })).status).toBe(404);
    }
  });

  it('accepts the gateway\'s full id length (opaque tail up to 1000), refuses beyond', async () => {
    arm();
    const cookie = await buyerCookie();
    const { GET } = await import('./[checkoutId]/route');
    const tooLong = `reap_rp_0123456789abcdef01234567.${'A'.repeat(1001)}`;
    expect((await GET(getReq('x', cookie), { params: Promise.resolve({ checkoutId: tooLong }) })).status).toBe(404);
    const longId = `reap_rp_0123456789abcdef01234567.${'B'.repeat(1000)}`;
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(rpcResult({ ...awaitingApprovalCheckout(), id: longId })), { status: 200 }));
    expect((await GET(getReq('x', cookie), { params: Promise.resolve({ checkoutId: longId }) })).status).toBe(200);
  });

  it('RATE LIMIT: reads are limited per buyer (121st in a minute is 429)', async () => {
    arm();
    const cookie = await buyerCookie();
    gatewayAnswers(awaitingApprovalCheckout());
    const { GET } = await import('./[checkoutId]/route');
    const params = { params: Promise.resolve({ checkoutId: REAP_ID }) };
    let last = 0;
    for (let i = 0; i < 121; i++) last = (await GET(getReq(REAP_ID, cookie), params)).status;
    expect(last).toBe(429);
  });
});

describe('P3 follow-ups of #384: conflicting merchant ids fail closed; a degraded read never carries a pay link', () => {
  const idMsg = (content: string) => ({ type: 'info', code: 'reap.merchant_id', path: '$.line_items[0]', content, content_type: 'plain' });
  const sgReq = () => createReq({ merchant_domain: 'jsmbeauty.sg', buyer: { ...BUYER, country: 'SG', postal_code: '018956' } });
  /** A Reap answer publishing `domain` plus the given merchant-id messages. */
  function answerWithIds(domain: string, ids: string[], build: () => unknown = awaitingApprovalCheckout) {
    const base = withSeller({ domain }, build) as any;
    return { ...base, messages: [...ids.map(idMsg), ...base.messages] };
  }
  async function buyerCookie() {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(rpcResult(resolvingCheckout())), { status: 200 }));
    const { POST } = await import('./route');
    const first = createReq(); const cookie = first.headers.get('cookie')!;
    await POST(first);
    fetchMock.mockReset();
    return cookie;
  }

  it.each([
    ['conflicting ids, the configured one first', ['merch_jsm_demo', 'm_other']],
    ['conflicting ids, the configured one second', ['m_other', 'merch_jsm_demo']],
    ['a malformed id', ['m id']],
  ])('POST: a merchant with a configured id refuses %s (no link)', async (_l, ids) => {
    arm();
    gatewayAnswers(answerWithIds('jsmbeauty.sg', ids));
    const { POST } = await import('./route');
    const body = await (await POST(sgReq())).json();
    expect(body).toMatchObject({ checkout: null, blocked: 'seller_mismatch', cause: 'seller_unconfirmed' });
    expect(JSON.stringify(body)).not.toContain('prava.space');
  });

  it('POST: a domain-only merchant refuses conflicting published ids too (they are not "absent")', async () => {
    arm();
    gatewayAnswers(answerWithIds('judydoll.com', ['m_a', 'm_b']));
    const { POST } = await import('./route');
    const body = await (await POST(createReq())).json();
    expect(body).toMatchObject({ checkout: null, blocked: 'seller_mismatch', cause: 'seller_unconfirmed' });
  });

  it('POST accepting: the configured id once (or twice) is accepted, and a domain-only merchant still accepts no id', async () => {
    arm();
    const { POST } = await import('./route');
    gatewayAnswers(answerWithIds('jsmbeauty.sg', ['merch_jsm_demo']));
    expect((await (await POST(sgReq())).json()).checkout.seller).toEqual({ domain: 'jsmbeauty.sg' });
    gatewayAnswers(answerWithIds('jsmbeauty.sg', ['merch_jsm_demo', 'merch_jsm_demo']));
    expect((await (await POST(sgReq())).json()).checkout.seller).toEqual({ domain: 'jsmbeauty.sg' });
    gatewayAnswers(answerWithIds('judydoll.com', []));
    expect((await (await POST(createReq())).json()).checkout.seller).toEqual({ domain: 'judydoll.com' });
  });

  it('GET: a good read publishing conflicting merchant ids is not shown (404)', async () => {
    arm();
    const cookie = await buyerCookie();
    const { GET } = await import('./[checkoutId]/route');
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(rpcResult(answerWithIds('judydoll.com', ['m_a', 'm_b']))), { status: 200 }),
    );
    const res = await GET(getReq(REAP_ID, cookie), { params: Promise.resolve({ checkoutId: REAP_ID }) });
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain('prava.space');
  });

  it('GET: a degraded read that DOES publish a configured seller still carries no pay link', async () => {
    arm();
    const cookie = await buyerCookie();
    const { GET } = await import('./[checkoutId]/route');
    const base = viewUnavailableCheckout() as any;
    const degraded = {
      ...base,
      status: 'requires_escalation',
      continue_url: 'https://pay.prava.space/checkout/chk_x',
      messages: [
        { type: 'info', code: 'reap.merchant_domain', path: '$.line_items[0]', content: 'judydoll.com', content_type: 'plain' },
        ...base.messages,
      ],
    };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(rpcResult(degraded)), { status: 200 }));
    const res = await GET(getReq(REAP_ID, cookie), { params: Promise.resolve({ checkoutId: REAP_ID }) });
    expect(res.status).toBe(200);
    const view = (await res.json()).checkout;
    expect(view.viewUnavailable).toBe(true);
    expect(view.continueUrl).toBeNull();
    expect(JSON.stringify(view)).not.toContain('prava.space');
    expect(view.seller).toEqual({ domain: 'judydoll.com' });
  });

  it('GET accepting: a GOOD read keeps its vetted pay link', async () => {
    arm();
    const cookie = await buyerCookie();
    const { GET } = await import('./[checkoutId]/route');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(rpcResult(awaitingApprovalCheckout())), { status: 200 }));
    const view = (await (await GET(getReq(REAP_ID, cookie), { params: Promise.resolve({ checkoutId: REAP_ID }) })).json()).checkout;
    expect(view.continueUrl).toBe(HOSTED_URL);
  });
});
