import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('/api/ucp/checkout-sessions', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('pins the route to the node runtime in the home region', async () => {
    const route = await import('@/app/api/ucp/checkout-sessions/route');
    expect(route.runtime).toBe('nodejs');
    expect(route.preferredRegion).toBe('home');
  });

  it('mints offer ids and creates a UCP checkout session for eligible carts', async () => {
    vi.stubEnv('UCP_WEB_BASE_URL', 'https://ucp.example.com');
    vi.stubEnv('UCP_INTERNAL_OFFER_MINT_KEY', 'internal_key');

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          offer_id: 'offer_v1.minted_123',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'chk_123',
          continue_url:
            'https://agent.pivota.cc/order?ucp_checkout_session_id=chk_123',
        }),
      );

    const { POST } = await import('@/app/api/ucp/checkout-sessions/route');

    const req = new NextRequest('https://agent.pivota.cc/api/ucp/checkout-sessions', {
      method: 'POST',
      body: JSON.stringify({
        items: [
          {
            product_id: 'prod_1',
            variant_id: 'var_1',
            merchant_id: 'merch_1',
            title: 'Great Barrier Relief',
            quantity: 1,
            unit_price: 28,
            currency: 'USD',
            image_url: 'https://cdn.example.com/gbr.png',
          },
        ],
        return_url: '/products?q=kravebeauty',
        entry: 'shopping_agent',
        source: 'shopping_agent',
        embed: '1',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      checkoutUrl:
        'https://agent.pivota.cc/order?ucp_checkout_session_id=chk_123&entry=shopping_agent&source=shopping_agent&embed=1&entry_mode=ucp_session',
      checkoutSessionId: 'chk_123',
      fallbackReason: null,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [mintUrl, mintInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(mintUrl).toBe('https://ucp.example.com/internal/ucp/mint-offer');
    expect((mintInit.headers as Record<string, string>)['x-pivota-internal-key']).toBe(
      'internal_key',
    );
    expect(JSON.parse(String(mintInit.body))).toMatchObject({
      merchant_id: 'merch_1',
      product_id: 'prod_1',
      variant_id: 'var_1',
      title: 'Great Barrier Relief',
      image_url: 'https://cdn.example.com/gbr.png',
      currency: 'USD',
      price_minor: 2800,
    });

    const [createUrl, createInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(createUrl).toBe(
      'https://ucp.example.com/ucp/v1/checkout-sessions?return=%2Fproducts%3Fq%3Dkravebeauty',
    );
    expect(JSON.parse(String(createInit.body))).toEqual({
      currency: 'USD',
      line_items: [
        {
          item: {
            id: 'offer_v1.minted_123',
            title: 'Great Barrier Relief',
            image_url: 'https://cdn.example.com/gbr.png',
            price: 2800,
          },
          quantity: 1,
        },
      ],
    });
  });

  it('returns a multi_merchant fallback without calling UCP', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const { POST } = await import('@/app/api/ucp/checkout-sessions/route');

    const req = new NextRequest('https://agent.pivota.cc/api/ucp/checkout-sessions', {
      method: 'POST',
      body: JSON.stringify({
        items: [
          {
            product_id: 'prod_1',
            merchant_id: 'merch_1',
            title: 'One',
            quantity: 1,
            unit_price: 10,
            currency: 'USD',
          },
          {
            product_id: 'prod_2',
            merchant_id: 'merch_2',
            title: 'Two',
            quantity: 1,
            unit_price: 20,
            currency: 'USD',
          },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      checkoutUrl: null,
      checkoutSessionId: null,
      fallbackReason: 'multi_merchant',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the default UCP agent profile env when the client does not send one', async () => {
    vi.stubEnv('UCP_WEB_BASE_URL', 'https://ucp.example.com');
    vi.stubEnv('UCP_INTERNAL_OFFER_MINT_KEY', 'internal_key');
    vi.stubEnv(
      'UCP_AGENT_PROFILE_URL',
      'https://ucp-web-production-production.up.railway.app/_dev/platform-profile.json',
    );

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          offer_id: 'offer_v1.minted_123',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'chk_123',
          continue_url:
            'https://agent.pivota.cc/order?ucp_checkout_session_id=chk_123',
        }),
      );

    const { POST } = await import('@/app/api/ucp/checkout-sessions/route');

    const req = new NextRequest('https://agent.pivota.cc/api/ucp/checkout-sessions', {
      method: 'POST',
      body: JSON.stringify({
        items: [
          {
            product_id: 'prod_1',
            variant_id: 'var_1',
            merchant_id: 'merch_1',
            title: 'Great Barrier Relief',
            quantity: 1,
            unit_price: 28,
            currency: 'USD',
          },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const [, createInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((createInit.headers as Record<string, string>)['UCP-Agent']).toBe(
      'profile="https://ucp-web-production-production.up.railway.app/_dev/platform-profile.json"',
    );
  });

  it('returns a missing_offer_id fallback when mint inputs are incomplete', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const { POST } = await import('@/app/api/ucp/checkout-sessions/route');

    const req = new NextRequest('https://agent.pivota.cc/api/ucp/checkout-sessions', {
      method: 'POST',
      body: JSON.stringify({
        items: [
          {
            product_id: 'prod_1',
            title: 'One',
            quantity: 1,
            unit_price: 10,
            currency: 'USD',
          },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      checkoutUrl: null,
      checkoutSessionId: null,
      fallbackReason: 'missing_offer_id',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
