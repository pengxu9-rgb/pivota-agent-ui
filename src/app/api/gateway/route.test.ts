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
      submit_owner: 'external_button',
      component_kind: 'stripe_payment_element',
      supported_in_shopping_ui: true,
      psp: 'stripe',
      payment: {
        payment_status: 'requires_action',
        confirmation_owner: 'client',
        requires_client_confirmation: true,
        submit_owner: 'external_button',
        component_kind: 'stripe_payment_element',
        supported_in_shopping_ui: true,
      },
      payment_action: {
        type: 'stripe_client_secret',
        client_secret: 'pi_123_secret_456',
        submit_owner: 'external_button',
        component_kind: 'stripe_payment_element',
        supported_in_shopping_ui: true,
      },
    });
  });

  it('preserves explicit backend payment ownership contract fields', async () => {
    vi.stubEnv('SHOP_UPSTREAM_API_URL', 'https://invoke.example.com');
    vi.stubEnv('PIVOTA_BACKEND_BASE_URL', 'https://checkout.example.com');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        payment_status: 'requires_action',
        confirmation_owner: 'client',
        requires_client_confirmation: true,
        psp: 'checkout',
        payment_action: {
          type: 'checkout_session',
          client_secret: 'cko_session_123',
          submit_owner: 'unsupported',
          component_kind: 'checkout_embedded',
          supported_in_shopping_ui: false,
        },
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
            order_id: 'ord_unsupported_123',
            return_url: 'https://agent.pivota.cc/order/success?orderId=ord_unsupported_123',
          },
        },
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({
      payment_status: 'requires_action',
      confirmation_owner: 'client',
      requires_client_confirmation: true,
      submit_owner: 'unsupported',
      component_kind: 'checkout_embedded',
      supported_in_shopping_ui: false,
      payment_action: {
        type: 'checkout_session',
        submit_owner: 'unsupported',
        component_kind: 'checkout_embedded',
        supported_in_shopping_ui: false,
      },
      payment: {
        payment_status: 'requires_action',
        confirmation_owner: 'client',
        requires_client_confirmation: true,
        submit_owner: 'unsupported',
        component_kind: 'checkout_embedded',
        supported_in_shopping_ui: false,
      },
    });
  });

  it('normalizes legacy failed submit_payment responses into terminal payment_failed', async () => {
    vi.stubEnv('SHOP_UPSTREAM_API_URL', 'https://invoke.example.com');
    vi.stubEnv('PIVOTA_BACKEND_BASE_URL', 'https://checkout.example.com');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 'failed',
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
            order_id: 'ord_failed_123',
            return_url: 'https://agent.pivota.cc/order/success?orderId=ord_failed_123',
          },
        },
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({
      status: 'failed',
      payment_status: 'payment_failed',
      confirmation_owner: 'backend',
      requires_client_confirmation: false,
      supported_in_shopping_ui: true,
      payment: {
        payment_status: 'payment_failed',
        confirmation_owner: 'backend',
        requires_client_confirmation: false,
        supported_in_shopping_ui: true,
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

  it('duplicates timing and upstream trace headers for proxy observability', async () => {
    vi.stubEnv('PIVOTA_BACKEND_BASE_URL', 'https://checkout.example.com');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ quote_id: 'quote_obs_123' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Server-Timing': 'upstream;dur=123, upprimary;dur=123, normalize;dur=0',
          'x-gateway-retries': '1',
          'x-gateway-request-id': 'req_obs_123',
          'x-service-commit': 'sha_obs_123',
          'x-service-deployment-id': 'dep_obs_123',
          'x-aurora-build': 'build_obs_123',
          'x-aurora-git-sha': 'git_obs_123',
        },
      }),
    );

    const { POST } = await import('@/app/api/gateway/route');

    const req = new Request('http://localhost/api/gateway', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operation: 'preview_quote',
        payload: {
          quote: {
            merchant_id: 'merchant_obs',
            items: [{ product_id: 'prod_obs', variant_id: 'var_obs', quantity: 1 }],
            shipping_address: {
              country: 'US',
              postal_code: '94107',
            },
          },
        },
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(data).toMatchObject({ quote_id: 'quote_obs_123' });
    expect(res.headers.get('server-timing')).toContain('upstream;dur=123');
    expect(res.headers.get('server-timing')).toContain('upprimary;dur=123');
    expect(res.headers.get('server-timing')).toContain('proxy;dur=');
    expect(res.headers.get('server-timing')).toContain('gateway;dur=');
    expect(res.headers.get('x-gateway-server-timing')).toBe(res.headers.get('server-timing'));
    expect(res.headers.get('x-gateway-retries')).toBe('1');
    expect(res.headers.get('x-gateway-request-id')).toBe('req_obs_123');
    expect(res.headers.get('x-service-commit')).toBe('sha_obs_123');
    expect(res.headers.get('x-service-deployment-id')).toBe('dep_obs_123');
    expect(res.headers.get('x-aurora-build')).toBe('build_obs_123');
    expect(res.headers.get('x-aurora-git-sha')).toBe('git_obs_123');
    expect(res.headers.get('access-control-expose-headers')).toContain('Server-Timing');
    expect(res.headers.get('access-control-expose-headers')).toContain('x-gateway-server-timing');
    expect(res.headers.get('access-control-expose-headers')).toContain('x-gateway-request-id');
    expect(res.headers.get('access-control-expose-headers')).toContain('x-service-commit');
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

  it('keeps explicit remote /api/gateway upstreams without appending invoke twice', async () => {
    vi.stubEnv('SHOP_UPSTREAM_API_URL', 'https://invoke.example.com/api/gateway');
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
    expect(url).toBe('https://invoke.example.com/api/gateway');
  });

  it('prevents same-origin /api/gateway self-recursion by falling back to invoke upstream', async () => {
    vi.stubEnv('SHOP_UPSTREAM_API_URL', 'https://agent.pivota.cc/api/gateway');
    vi.stubEnv('PIVOTA_BACKEND_BASE_URL', 'https://checkout.example.com');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ status: 'success', products: [] }),
    );

    const { POST } = await import('@/app/api/gateway/route');

    const req = new Request('https://agent.pivota.cc/api/gateway', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operation: 'get_discovery_feed',
        payload: {
          surface: 'browse_products',
          page: 1,
          limit: 12,
        },
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({ status: 'success' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://pivota-agent-production.up.railway.app/agent/shop/v1/invoke');
    expect((init.headers as Record<string, string>)['x-gateway-proxy-hop']).toBe('1');
  });

  it('fails fast when proxy hop re-enters the gateway route', async () => {
    vi.stubEnv('SHOP_UPSTREAM_API_URL', 'https://invoke.example.com/api/gateway');
    vi.stubEnv('PIVOTA_BACKEND_BASE_URL', 'https://checkout.example.com');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ status: 'success', products: [] }),
    );

    const { POST } = await import('@/app/api/gateway/route');

    const req = new Request('https://agent.pivota.cc/api/gateway', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-gateway-proxy-hop': '2',
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

    expect(res.status).toBe(508);
    expect(data).toMatchObject({
      error: 'Gateway proxy loop detected',
    });
    expect(fetchMock).not.toHaveBeenCalled();
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

  // -------------------------------------------------------------------------
  // get_pdp_v2 product detail proxying.
  // -------------------------------------------------------------------------

  it('forwards get_pdp_v2 for sig_* product ids to the shop upstream rich PDP builder', async () => {
    vi.stubEnv('SHOP_UPSTREAM_API_URL', 'https://invoke.example.com');
    vi.stubEnv('PIVOTA_BACKEND_BASE_URL', 'https://canonical.example.com');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 'success',
        subject: { type: 'product', id: 'sig_abc123' },
        modules: [
          {
            type: 'canonical',
            data: {
              pdp_payload: {
                product: {
                  id: 'sig_abc123',
                  title: 'Test Canonical Product',
                },
                modules: [{ type: 'product_overview', data: { body: 'Approved content.' } }],
              },
            },
          },
          {
            type: 'offers',
            data: { offers_count: 1, offers: [{ offer_id: 'of_test' }] },
          },
        ],
        product: {
          id: 'sig_abc123',
          title: 'Test Canonical Product',
        },
      }),
    );

    const { POST } = await import('@/app/api/gateway/route');

    const req = new Request('http://localhost/api/gateway', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'get_pdp_v2',
        payload: {
          product_ref: { product_id: 'sig_abc123' },
        },
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://invoke.example.com/agent/shop/v1/invoke');
    expect((init.method || 'POST').toUpperCase()).toBe('POST');
    expect(JSON.parse(String(init.body || '{}'))).toMatchObject({
      operation: 'get_pdp_v2',
      payload: { product_ref: { product_id: 'sig_abc123' } },
    });
    expect(data.product).toMatchObject({ id: 'sig_abc123' });
    expect(res.headers.get('x-gateway-route')).not.toBe('pivota-canonical');
  });

  it('overlays approved UGC review summaries onto get_pdp_v2 reviews_preview', async () => {
    vi.stubEnv('SHOP_UPSTREAM_API_URL', 'https://invoke.example.com');
    vi.stubEnv('REVIEWS_BACKEND_URL', 'https://reviews.example.com');

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'success',
          subject: {
            type: 'product_group',
            id: 'sig_abc123',
            canonical_product_ref: {
              merchant_id: 'external_seed',
              platform: 'external_seed',
              product_id: 'ext_123',
            },
          },
          modules: [
            {
              type: 'reviews_preview',
              data: {
                scale: 5,
                rating: 0,
                review_count: 0,
                status: 'unavailable',
                unavailable_reason: 'no_approved_merchant_review_source_captured',
                preview_items: [],
                entry_points: {
                  write_review: { label: 'Write a review' },
                },
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          review_summary: {
            scale: 5,
            rating: 5,
            review_count: 1,
            rating_count: 1,
            preview_items: [
              {
                review_id: 9321,
                rating: 5,
                title: 'Pivota QA TEST',
                text_snippet: 'Approved review snippet.',
                media: [{ type: 'image', url: 'https://reviews.example.com/media/1' }],
              },
            ],
          },
        }),
      );

    const { POST } = await import('@/app/api/gateway/route');

    const req = new Request('http://localhost/api/gateway', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'get_pdp_v2',
        payload: {
          product_ref: { product_id: 'sig_abc123' },
          include: ['reviews_preview'],
        },
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();
    const reviews = data.modules.find((module: any) => module.type === 'reviews_preview');

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://reviews.example.com/agent/shop/v1/invoke');
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body || '{}'))).toMatchObject({
      operation: 'get_review_summary',
      payload: {
        sku: {
          merchant_id: 'external_seed',
          platform: 'external_seed',
          platform_product_id: 'ext_123',
          variant_id: null,
        },
      },
    });
    expect(reviews.data).toMatchObject({
      status: 'available',
      rating: 5,
      review_count: 1,
      entry_points: {
        write_review: { label: 'Write a review' },
      },
      preview_items: [
        {
          review_id: 9321,
          media: [{ type: 'image', url: 'https://reviews.example.com/media/1' }],
        },
      ],
    });
    expect(reviews.data.unavailable_reason).toBeUndefined();
  });

  it('does not overwrite source-backed merchant reviews with UGC review summaries', async () => {
    vi.stubEnv('SHOP_UPSTREAM_API_URL', 'https://invoke.example.com');
    vi.stubEnv('REVIEWS_BACKEND_URL', 'https://reviews.example.com');

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'success',
          subject: {
            type: 'product_group',
            id: 'sig_abc123',
            canonical_product_ref: {
              merchant_id: 'external_seed',
              platform: 'external_seed',
              product_id: 'ext_123',
            },
          },
          modules: [
            {
              type: 'reviews_preview',
              data: {
                scale: 5,
                rating: 4.397572,
                review_count: 1318,
                source: 'official_yotpo_reviews_api',
                preview_items: [{ review_id: 'yotpo_1', text_snippet: 'Official review.' }],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          review_summary: {
            scale: 5,
            rating: 5,
            review_count: 1,
            preview_items: [{ review_id: 9321, text_snippet: 'Pivota UGC review.' }],
          },
        }),
      );

    const { POST } = await import('@/app/api/gateway/route');

    const req = new Request('http://localhost/api/gateway', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'get_pdp_v2',
        payload: {
          product_ref: { product_id: 'sig_abc123' },
          include: ['reviews_preview'],
        },
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();
    const reviews = data.modules.find((module: any) => module.type === 'reviews_preview');

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(reviews.data).toMatchObject({
      rating: 4.397572,
      review_count: 1318,
      source: 'official_yotpo_reviews_api',
      preview_items: [{ review_id: 'yotpo_1' }],
    });
  });

  it('does NOT short-circuit get_pdp_v2 for non-sig_ product ids', async () => {
    vi.stubEnv('SHOP_UPSTREAM_API_URL', 'https://invoke.example.com');
    vi.stubEnv('PIVOTA_BACKEND_BASE_URL', 'https://canonical.example.com');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ subject: { type: 'product', id: 'ext_legacy' }, modules: [] }),
    );

    const { POST } = await import('@/app/api/gateway/route');

    const req = new Request('http://localhost/api/gateway', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'get_pdp_v2',
        payload: { product_ref: { product_id: 'ext_legacy' } },
      }),
    });

    await POST(req as any);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    // Must hit the shop upstream (not the canonical resolver) for ext_*.
    expect(url).toBe('https://invoke.example.com/agent/shop/v1/invoke');
  });
});
