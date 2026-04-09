import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('/api/gateway checkout-safe proxy', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('pins the gateway proxy to the node runtime in the home region', async () => {
    const route = await import('@/app/api/gateway/route');
    expect(route.runtime).toBe('nodejs');
    expect(route.preferredRegion).toBe('home');
  });

  it('routes creator checkout-token preview_quote to checkout-safe backend endpoints', async () => {
    vi.stubEnv('SHOP_UPSTREAM_API_URL', 'https://invoke.example.com');
    vi.stubEnv('PIVOTA_BACKEND_BASE_URL', 'https://checkout.example.com');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        quote_id: 'quote_creator_123',
        pricing: { subtotal: 24, shipping_fee: 0, tax: 0, total: 24 },
        currency: 'USD',
      }),
    );

    const { POST } = await import('@/app/api/gateway/route');

    const req = new Request('http://localhost/api/gateway', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Checkout-Token': 'tok_creator_123',
      },
      body: JSON.stringify({
        operation: 'preview_quote',
        payload: {
          quote: {
            merchant_id: 'merchant_creator',
            customer_email: 'buyer@example.com',
            items: [{ product_id: 'prod_123', variant_id: 'var_123', quantity: 1 }],
            shipping_address: {
              name: 'Buyer Example',
              address_line1: '123 Market St',
              city: 'San Francisco',
              state: 'CA',
              country: 'US',
              postal_code: '94107',
            },
          },
        },
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({
      quote_id: 'quote_creator_123',
      pricing: { total: 24 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://checkout.example.com/agent/v1/quotes/preview');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-Checkout-Token']).toBe('tok_creator_123');
    expect(JSON.parse(String(init.body || '{}'))).toMatchObject({
      merchant_id: 'merchant_creator',
      customer_email: 'buyer@example.com',
      items: [{ product_id: 'prod_123', variant_id: 'var_123', quantity: 1 }],
    });
  });

  it('routes submit_payment to the checkout-safe backend even without a checkout token', async () => {
    vi.stubEnv('SHOP_UPSTREAM_API_URL', 'https://invoke.example.com');
    vi.stubEnv('PIVOTA_BACKEND_BASE_URL', 'https://checkout.example.com');
    vi.stubEnv('AGENT_API_KEY', 'ak_test_gateway_123');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 'requires_action',
        payment_id: 'pay_123',
        payment_intent_id: 'pi_123',
        client_secret: 'pi_123_secret_456',
        psp_used: 'stripe',
      }),
    );

    const { POST } = await import('@/app/api/gateway/route');

    const req = new Request('http://localhost/api/gateway', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operation: 'submit_payment',
        payload: {
          payment: {
            order_id: 'ord_123',
            return_url: 'https://agent.pivota.cc/order/success?orderId=ord_123',
          },
        },
      }),
    });

    const res = await POST(req as any);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://checkout.example.com/agent/v1/payments');
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('ak_test_gateway_123');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ak_test_gateway_123');
    expect(JSON.parse(String(init.body || '{}'))).toMatchObject({
      order_id: 'ord_123',
      payment_method: { type: 'dynamic' },
    });
  });

  it('normalizes checkout-token submit_payment responses for hosted checkout consumers', async () => {
    vi.stubEnv('SHOP_UPSTREAM_API_URL', 'https://invoke.example.com');
    vi.stubEnv('PIVOTA_BACKEND_BASE_URL', 'https://checkout.example.com');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 'requires_action',
        payment_id: 'pay_123',
        payment_intent_id: 'pi_123',
        client_secret: 'pi_123_secret_456',
        psp_used: 'stripe',
      }),
    );

    const { POST } = await import('@/app/api/gateway/route');

    const req = new Request('http://localhost/api/gateway', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Checkout-Token': 'tok_creator_456',
      },
      body: JSON.stringify({
        operation: 'submit_payment',
        payload: {
          payment: {
            order_id: 'ord_123',
            payment_method_hint: 'card',
            return_url: 'https://agent.pivota.cc/order/success?orderId=ord_123',
          },
        },
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://checkout.example.com/agent/v1/payments');
    expect(JSON.parse(String(init.body || '{}'))).toMatchObject({
      order_id: 'ord_123',
      payment_method: { type: 'card' },
    });
    expect(data).toMatchObject({
      payment_status: 'requires_action',
      confirmation_owner: 'client',
      requires_client_confirmation: true,
      psp: 'stripe',
      payment: {
        payment_status: 'requires_action',
        confirmation_owner: 'client',
        requires_client_confirmation: true,
      },
      payment_action: {
        type: 'stripe_client_secret',
        client_secret: 'pi_123_secret_456',
      },
    });
  });

  it('defaults submit_payment to dynamic payment methods when the client does not pin one', async () => {
    vi.stubEnv('SHOP_UPSTREAM_API_URL', 'https://invoke.example.com');
    vi.stubEnv('PIVOTA_BACKEND_BASE_URL', 'https://checkout.example.com');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 'requires_action',
        payment_id: 'pay_123',
        payment_intent_id: 'pi_123',
        client_secret: 'pi_123_secret_456',
        psp_used: 'stripe',
      }),
    );

    const { POST } = await import('@/app/api/gateway/route');

    const req = new Request('http://localhost/api/gateway', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Checkout-Token': 'tok_creator_dynamic',
      },
      body: JSON.stringify({
        operation: 'submit_payment',
        payload: {
          payment: {
            order_id: 'ord_123',
            return_url: 'https://agent.pivota.cc/order/success?orderId=ord_123',
          },
        },
      }),
    });

    const res = await POST(req as any);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body || '{}'))).toMatchObject({
      order_id: 'ord_123',
      payment_method: { type: 'dynamic' },
    });
  });

  it('keeps non-checkout traffic on the invoke gateway path', async () => {
    vi.stubEnv('SHOP_UPSTREAM_API_URL', 'https://invoke.example.com');
    vi.stubEnv('PIVOTA_BACKEND_BASE_URL', 'https://checkout.example.com');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ status: 'success', products: [] }),
    );

    const { POST } = await import('@/app/api/gateway/route');

    const req = new Request('http://localhost/api/gateway', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operation: 'find_products_multi',
        payload: {
          query: 'plus size sleepwear',
        },
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({ status: 'success' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://invoke.example.com/agent/shop/v1/invoke');
  });

  it('uses explicit /api/gateway upstreams without appending invoke twice', async () => {
    vi.stubEnv('SHOP_UPSTREAM_API_URL', 'https://agent.pivota.cc/api/gateway');
    vi.stubEnv('PIVOTA_BACKEND_BASE_URL', 'https://checkout.example.com');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ status: 'success', products: [] }),
    );

    const { POST } = await import('@/app/api/gateway/route');

    const req = new Request('http://localhost/api/gateway', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operation: 'find_products_multi',
        payload: {
          query: 'winona serum',
        },
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({ status: 'success' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://agent.pivota.cc/api/gateway');
  });

  it('ignores NEXT_PUBLIC upstream drift for server-side shop proxy traffic', async () => {
    vi.stubEnv('NEXT_PUBLIC_UPSTREAM_API_URL', 'https://stale.example.com');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://stale-two.example.com');
    vi.stubEnv('PIVOTA_BACKEND_BASE_URL', 'https://checkout.example.com');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ status: 'success', products: [] }),
    );

    const { POST } = await import('@/app/api/gateway/route');

    const req = new Request('http://localhost/api/gateway', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operation: 'find_products_multi',
        payload: {
          query: 'blemish defeatr',
        },
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({ status: 'success' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://pivota-agent-production.up.railway.app/agent/shop/v1/invoke');
  });

  it('normalizes non-2xx upstream invoke errors with request ids and reason codes', async () => {
    vi.stubEnv('SHOP_UPSTREAM_API_URL', 'https://invoke.example.com');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'PRODUCT_NOT_FOUND',
          message: 'Product not found',
          detail: { canonical: true },
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'X-Gateway-Request-Id': 'gw_upstream_123',
            'X-Upstream-Request-Id': 'upstream_req_456',
          },
        },
      ),
    );

    const { POST } = await import('@/app/api/gateway/route');

    const req = new Request('http://localhost/api/gateway', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'get_pdp_v2',
        payload: {
          product_ref: {
            product_id: 'ext_123',
            merchant_id: 'merchant_wrong',
          },
        },
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data).toMatchObject({
      error: 'PRODUCT_NOT_FOUND',
      message: 'Product not found',
      reason_code: 'PRODUCT_NOT_FOUND',
      gateway_request_id: 'gw_upstream_123',
      upstream_request_id: 'upstream_req_456',
      detail: { canonical: true },
    });
    expect(res.headers.get('X-Gateway-Request-Id')).toBe('gw_upstream_123');
    expect(res.headers.get('X-Upstream-Request-Id')).toBe('upstream_req_456');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps proxy aborts to UPSTREAM_TIMEOUT with a gateway request id', async () => {
    vi.stubEnv('SHOP_UPSTREAM_API_URL', 'https://invoke.example.com');

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      Object.assign(new Error('The operation was aborted.'), {
        name: 'AbortError',
      }),
    );

    const { POST } = await import('@/app/api/gateway/route');

    const req = new Request('http://localhost/api/gateway', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'get_pdp_v2',
        payload: {
          product_ref: {
            product_id: 'ext_123',
          },
        },
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(504);
    expect(data).toMatchObject({
      error: 'UPSTREAM_TIMEOUT',
      reason_code: 'UPSTREAM_TIMEOUT',
    });
    expect(typeof data.gateway_request_id).toBe('string');
    expect(res.headers.get('X-Gateway-Request-Id')).toBe(data.gateway_request_id);
  });
});
