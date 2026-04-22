import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildLegacyOrderHref,
  createUcpCheckoutSession,
  resolveHostedCheckoutUrl,
  type HostedCheckoutItem,
} from './ucpCheckout';

const ITEM: HostedCheckoutItem = {
  product_id: 'prod_1',
  variant_id: 'var_1',
  merchant_id: 'merch_1',
  title: 'Barrier Relief',
  quantity: 1,
  unit_price: 28,
  currency: 'USD',
};

describe('ucpCheckout helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds legacy order href with observability params and inferred external return', () => {
    const searchParams = new URLSearchParams('entry=creator_agent&source=creator_agent');

    const href = buildLegacyOrderHref({
      items: [ITEM],
      context: { searchParams },
      fallbackReason: 'ucp_unavailable',
    });

    const url = new URL(href, 'https://agent.pivota.cc');
    expect(url.pathname).toBe('/order');
    expect(url.searchParams.get('entry_mode')).toBe('legacy_items');
    expect(url.searchParams.get('fallback_reason')).toBe('ucp_unavailable');
    expect(url.searchParams.get('return')).toBe('https://creator.pivota.cc/');
    expect(url.searchParams.get('entry')).toBe('creator_agent');
    expect(url.searchParams.get('source')).toBe('creator_agent');
    expect(JSON.parse(String(url.searchParams.get('items')))).toEqual([ITEM]);
  });

  it('creates a UCP checkout session through the frontend adapter', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          checkoutUrl: 'https://agent.pivota.cc/order?ucp_checkout_session_id=chk_1',
          checkoutSessionId: 'chk_1',
          fallbackReason: null,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const result = await createUcpCheckoutSession({
      items: [ITEM],
      context: {
        searchParams: new URLSearchParams(
          'entry=shopping_agent&source=shopping_agent&embed=1&parent_origin=https%3A%2F%2Faurora.pivota.cc',
        ),
        returnUrl: '/products?q=kravebeauty',
      },
    });

    expect(result).toEqual({
      checkoutUrl: 'https://agent.pivota.cc/order?ucp_checkout_session_id=chk_1',
      checkoutSessionId: 'chk_1',
      fallbackReason: null,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/ucp/checkout-sessions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toMatchObject({
      items: [ITEM],
      return_url: '/products?q=kravebeauty',
      entry: 'shopping_agent',
      source: 'shopping_agent',
      embed: '1',
      parent_origin: 'https://aurora.pivota.cc',
    });
  });

  it('falls back to the legacy order link when UCP session creation fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          checkoutUrl: null,
          checkoutSessionId: null,
          fallbackReason: 'multi_merchant',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const result = await resolveHostedCheckoutUrl({
      items: [ITEM],
      context: {
        searchParams: new URLSearchParams('return=%2Fproducts%3Fq%3Dkravebeauty'),
      },
    });

    const url = new URL(result.url, 'https://agent.pivota.cc');
    expect(result.entryMode).toBe('legacy_items');
    expect(result.fallbackReason).toBe('multi_merchant');
    expect(url.pathname).toBe('/order');
    expect(url.searchParams.get('entry_mode')).toBe('legacy_items');
    expect(url.searchParams.get('fallback_reason')).toBe('multi_merchant');
    expect(url.searchParams.get('return')).toBe('/products?q=kravebeauty');
  });
});
