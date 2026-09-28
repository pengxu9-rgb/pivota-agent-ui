// @vitest-environment node
import { generateKeyPairSync } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REAP_ID,
  awaitingApprovalCheckout,
  resolvingCheckout,
  rpcResult,
  storefrontEscalation,
} from '@/lib/reapCheckout/__fixtures__/checkouts';

const PEM = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const KEY = `ak_live_${'b'.repeat(64)}`;

function arm() {
  vi.stubEnv('NEXT_PUBLIC_REAP_CHECKOUT_DEMO', '1');
  vi.stubEnv('REAP_CHECKOUT_DEMO_ENABLED', 'true');
  vi.stubEnv('REAP_CHECKOUT_GATEWAY_BASE_URL', 'http://localhost:8081');
  vi.stubEnv('REAP_CHECKOUT_AGENT_API_KEY', KEY);
  vi.stubEnv('REAP_CHECKOUT_DEMO_MERCHANTS', 'judydoll.com:US,jsmbeauty.sg:SG');
  vi.stubEnv('REAP_DEMO_USER_JWT_PRIVATE_KEY', PEM);
  vi.stubEnv('REAP_DEMO_USER_JWT_KID', 'k1');
  vi.stubEnv('REAP_DEMO_USER_JWT_ISSUER', 'https://agent.pivota.cc/reap-demo');
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

function createReq(extra: Record<string, unknown> = {}, cookie?: string) {
  return new NextRequest('http://localhost:3000/api/reap-checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({
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
    const { POST } = await import('./route');
    const { GET } = await import('./[checkoutId]/route');
    const { GET: CONFIG } = await import('./config/route');
    const { GET: JWKS } = await import('./jwks/route');
    expect((await POST(createReq())).status).toBe(404);
    expect(
      (await GET(new NextRequest(`http://localhost:3000/api/reap-checkout/${REAP_ID}`), { params: Promise.resolve({ checkoutId: REAP_ID }) })).status,
    ).toBe(404);
    expect((await CONFIG()).status).toBe(404);
    expect((await JWKS()).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/reap-checkout (armed)', () => {
  it('creates through the UCP door and answers a read view; sets the buyer cookie', async () => {
    arm();
    fetchMock.mockResolvedValue(new Response(JSON.stringify(rpcResult(resolvingCheckout({ code: ' PeachIE20 ' }))), { status: 200 }));
    const { POST } = await import('./route');
    const res = await POST(createReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checkout).toMatchObject({ id: REAP_ID, phase: 'preparing', isReapCheckout: true });
    expect(res.headers.get('set-cookie')).toMatch(/pv_reap_demo_buyer=rdb_[^;]+;.*HttpOnly/i);

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

  it('a non-Reap (storefront) answer is a fallback: its continue_url is NOT forwarded', async () => {
    arm();
    fetchMock.mockResolvedValue(new Response(JSON.stringify(rpcResult(storefrontEscalation({ codeWarning: true }))), { status: 200 }));
    const { POST } = await import('./route');
    const res = await POST(createReq());
    const body = await res.json();
    expect(body).toEqual({ checkout: null, fallback: 'not_reap', offer_code_outcome: 'not_applied_invalid', available_with_consent: false });
    expect(JSON.stringify(body)).not.toContain('judydoll.com/cart');
  });

  it('a Reap checkout whose link is not Reap\'s answers no link', async () => {
    arm();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(rpcResult(awaitingApprovalCheckout({ continueUrl: 'https://reap.global.evil.com/pay' }))), { status: 200 }),
    );
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

  it('refuses a non-JSON body (cross-site form) before calling anything', async () => {
    arm();
    const { POST } = await import('./route');
    const req = new NextRequest('http://localhost:3000/api/reap-checkout', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ product_id: 'sig_x' }),
    });
    expect((await POST(req)).status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
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

describe('GET /api/reap-checkout/:id (armed)', () => {
  it('needs the buyer cookie and a reap id; maps QUOTE_NOT_FOUND to 404', async () => {
    arm();
    const { GET } = await import('./[checkoutId]/route');
    const params = { params: Promise.resolve({ checkoutId: REAP_ID }) };
    expect((await GET(new NextRequest(`http://localhost:3000/api/reap-checkout/${REAP_ID}`), params)).status).toBe(404);
    const cookie = `pv_reap_demo_buyer=rdb_${'A'.repeat(32)}`;
    const bad = { params: Promise.resolve({ checkoutId: 'esc_abc' }) };
    expect((await GET(new NextRequest('http://localhost:3000/api/reap-checkout/esc_abc', { headers: { cookie } }), bad)).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(rpcResult(awaitingApprovalCheckout())), { status: 200 }));
    const ok = await GET(new NextRequest(`http://localhost:3000/api/reap-checkout/${REAP_ID}`, { headers: { cookie } }), params);
    expect(ok.status).toBe(200);
    expect((await ok.json()).checkout.phase).toBe('awaiting_approval');
    const rpc = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(rpc.params).toMatchObject({ name: 'get_checkout', arguments: { id: REAP_ID } });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(rpcResult({ error: { code: 'QUOTE_NOT_FOUND' } }, true)), { status: 200 }));
    expect((await GET(new NextRequest(`http://localhost:3000/api/reap-checkout/${REAP_ID}`, { headers: { cookie } }), params)).status).toBe(404);
  });
});
