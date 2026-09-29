// @vitest-environment node
import { generateKeyPairSync } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEMO_MERCHANT_ID,
  REAP_ID,
  REAP_ID_OTHER_SELLER,
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
  vi.stubEnv('REAP_CHECKOUT_STAGING_GATEWAY_HOST', '');
  vi.stubEnv('REAP_CHECKOUT_AGENT_API_KEY', KEY);
  vi.stubEnv('REAP_CHECKOUT_DEMO_MERCHANTS', `judydoll.com:US:${DEMO_MERCHANT_ID},jsmbeauty.sg:SG:merch_jsm_demo`);
  vi.stubEnv('REAP_DEMO_USER_JWT_PRIVATE_KEY', PEM);
  vi.stubEnv('REAP_DEMO_USER_JWT_KID', 'k1');
  vi.stubEnv('REAP_DEMO_USER_JWT_ISSUER', 'https://reap-demo.staging.pivota.cc/issuer');
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
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': opts.contentType || 'application/json',
      host: u.host,
      ...(origin ? { origin } : {}),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
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
  expect((await CONFIG()).status).toBe(404);
  expect((await JWKS()).status).toBe(404);
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

describe('arming guard: both flags on, but not a loopback/staging gateway or a production build -> 404', () => {
  it.each([
    ['production gateway', { REAP_CHECKOUT_GATEWAY_BASE_URL: 'https://gateway.pivota.cc' }],
    ['a non-loopback host without the override', { REAP_CHECKOUT_GATEWAY_BASE_URL: 'https://gateway.staging.pivota.cc' }],
    ['NODE_ENV=production (a next build) even on loopback', { NODE_ENV: 'production' }],
    ['override naming a production host', { REAP_CHECKOUT_STAGING_GATEWAY_HOST: 'gateway.pivota.cc', REAP_CHECKOUT_GATEWAY_BASE_URL: 'https://gateway.pivota.cc' }],
    ['override without a staging label', { REAP_CHECKOUT_STAGING_GATEWAY_HOST: 'gw.pivota.cc', REAP_CHECKOUT_GATEWAY_BASE_URL: 'https://gw.pivota.cc' }],
    ['override host != base host', { REAP_CHECKOUT_STAGING_GATEWAY_HOST: 'gateway.staging.pivota.cc', REAP_CHECKOUT_GATEWAY_BASE_URL: 'https://gateway.pivota.cc' }],
    ['override over http', { REAP_CHECKOUT_STAGING_GATEWAY_HOST: 'gateway.staging.pivota.cc', REAP_CHECKOUT_GATEWAY_BASE_URL: 'http://gateway.staging.pivota.cc' }],
  ])('%s', async (_label, env) => {
    arm();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
    await expectAll404();
  });

  it('the explicit staging override arms (even a production build) against exactly that staging host', async () => {
    arm();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('REAP_CHECKOUT_STAGING_GATEWAY_HOST', 'gateway.staging.pivota.cc');
    vi.stubEnv('REAP_CHECKOUT_GATEWAY_BASE_URL', 'https://gateway.staging.pivota.cc');
    const { CONFIG } = await allRoutes();
    expect((await CONFIG()).status).toBe(200);
  });

  it('loopback + non-production arms; the client sees domain + market only', async () => {
    arm();
    for (const base of ['http://localhost:8081', 'http://127.0.0.1:8081']) {
      vi.stubEnv('REAP_CHECKOUT_GATEWAY_BASE_URL', base);
      vi.resetModules();
      const { CONFIG } = await allRoutes();
      expect((await (await CONFIG()).json()).merchants).toEqual([
        { domain: 'judydoll.com', market: 'US' },
        { domain: 'jsmbeauty.sg', market: 'SG' },
      ]);
    }
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

  it('SELLER CHECK: a Reap checkout for another seller\'s row is refused and its link never handed out', async () => {
    arm();
    gatewayAnswers({ ...awaitingApprovalCheckout(), id: REAP_ID_OTHER_SELLER });
    const { POST } = await import('./route');
    const body = await (await POST(createReq())).json();
    expect(body).toEqual({ checkout: null, fallback: 'seller_mismatch' });
    expect(JSON.stringify(body)).not.toContain('prava.space');
  });

  it('SELLER CHECK: an id whose snapshot does not decode is "seller unknown" -> refused', async () => {
    arm();
    gatewayAnswers({ ...awaitingApprovalCheckout(), id: 'reap_rp_0123456789abcdef01234567.bm90LWpzb24' });
    const { POST } = await import('./route');
    expect(await (await POST(createReq())).json()).toEqual({ checkout: null, fallback: 'seller_mismatch' });
  });

  it('SELLER CHECK: the browser naming a demo merchant does not make another seller acceptable', async () => {
    arm();
    // The browser says jsmbeauty.sg (configured id merch_jsm_demo); the lane bought judydoll's row.
    gatewayAnswers(resolvingCheckout());
    const { POST } = await import('./route');
    const res = await POST(createReq({ merchant_domain: 'jsmbeauty.sg', buyer: { ...BUYER, country: 'SG' } }));
    expect(await res.json()).toEqual({ checkout: null, fallback: 'seller_mismatch' });
  });

  it('a non-Reap (storefront) answer is a fallback: its continue_url is NOT forwarded', async () => {
    arm();
    gatewayAnswers(storefrontEscalation({ codeWarning: true }));
    const { POST } = await import('./route');
    const body = await (await POST(createReq())).json();
    expect(body).toEqual({ checkout: null, fallback: 'not_reap', offer_code_outcome: 'not_applied_invalid', available_with_consent: false });
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

  it('a demo entry without a merchant id is not a demo merchant (its seller could not be checked)', async () => {
    arm();
    vi.stubEnv('REAP_CHECKOUT_DEMO_MERCHANTS', 'judydoll.com:US');
    const { POST } = await import('./route');
    expect((await POST(createReq())).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
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

  it('RATE LIMIT: the 7th create from one signed-in buyer in 10 minutes is 429', async () => {
    arm();
    gatewayAnswers(resolvingCheckout());
    const { POST } = await import('./route');
    const cookie = cookieFrom(await POST(createReq())); // the create that issued the buyer (counted by address)
    fetchMock.mockClear();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await POST(createReq({}, { cookie }))).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 429]);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('RATE LIMIT: browsers without a buyer are limited by address', async () => {
    arm();
    gatewayAnswers(resolvingCheckout());
    const { POST } = await import('./route');
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await POST(createReq())).status);
    expect(statuses.at(-1)).toBe(429);
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
    const c = attrs(await POST(createReq({}, { url: 'https://demo.staging.pivota.cc/api/reap-checkout' })));
    expect(c.name).toBe('__Host-pv_reap_demo_buyer');
    expect(c.a.secure).toBe(true);
    expect(c.a.httponly).toBe(true);
    expect(String(c.a.samesite).toLowerCase()).toBe('lax');
    expect(c.a.path).toBe('/');
    expect(c.a).not.toHaveProperty('domain');
    expect(c.a).not.toHaveProperty('max-age');
    expect(c.a).not.toHaveProperty('expires');
    expect(c.value).toMatch(/^rdb_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
  });

  it('plain-http loopback: unprefixed and not Secure (the only exemption), otherwise the same', async () => {
    arm();
    gatewayAnswers(resolvingCheckout());
    const { POST } = await import('./route');
    const c = attrs(await POST(createReq()));
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
    const loopCookie = cookieFrom(await POST(createReq()));
    const { GET } = await import('./[checkoutId]/route');
    const req = new NextRequest(`https://demo.staging.pivota.cc/api/reap-checkout/${REAP_ID}`, { headers: { cookie: loopCookie } });
    fetchMock.mockClear();
    expect((await GET(req, { params: Promise.resolve({ checkoutId: REAP_ID }) })).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('only server-issued buyer ids are accepted: a forged or unsigned cookie is no buyer', async () => {
    arm();
    const { GET } = await import('./[checkoutId]/route');
    const params = { params: Promise.resolve({ checkoutId: REAP_ID }) };
    for (const forged of [`pv_reap_demo_buyer=rdb_${'A'.repeat(32)}`, `pv_reap_demo_buyer=rdb_${'A'.repeat(32)}.${'x'.repeat(43)}`]) {
      expect((await GET(getReq(REAP_ID, forged), params)).status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/reap-checkout/:id (armed)', () => {
  async function buyerCookie() {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(rpcResult(resolvingCheckout())), { status: 200 }));
    const { POST } = await import('./route');
    const cookie = cookieFrom(await POST(createReq()));
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

  it('an id for another seller is 404 without calling the gateway', async () => {
    arm();
    const cookie = await buyerCookie();
    const { GET } = await import('./[checkoutId]/route');
    const res = await GET(getReq(REAP_ID_OTHER_SELLER, cookie), { params: Promise.resolve({ checkoutId: REAP_ID_OTHER_SELLER }) });
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a literal "%" in the (already decoded) id is a clean 404, not a 500', async () => {
    arm();
    const cookie = await buyerCookie();
    const { GET } = await import('./[checkoutId]/route');
    for (const id of ['%', '%25', 'reap_%E0%A4%A']) {
      expect((await GET(getReq('x', cookie), { params: Promise.resolve({ checkoutId: id }) })).status).toBe(404);
    }
  });

  it('accepts the gateway\'s full id length (snapshot up to 1000), refuses beyond', async () => {
    arm();
    const cookie = await buyerCookie();
    const { GET } = await import('./[checkoutId]/route');
    const tooLong = `reap_rp_0123456789abcdef01234567.${'A'.repeat(1001)}`;
    expect((await GET(getReq('x', cookie), { params: Promise.resolve({ checkoutId: tooLong }) })).status).toBe(404);
    const k = `prod::${DEMO_MERCHANT_ID}::shopify::${'9'.repeat(150)}`;
    const snap = Buffer.from(JSON.stringify({ v: 1, i: `sig_${'x'.repeat(240)}`, k, q: 1, c: 'USD', u: 1600 })).toString('base64url');
    expect(snap.length).toBeGreaterThan(480);
    expect(snap.length).toBeLessThanOrEqual(1000);
    const longId = `reap_rp_0123456789abcdef01234567.${snap}`;
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
