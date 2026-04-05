import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getAllProducts, getBrandDiscoveryFeed } from './api';

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const makeProducts = (count: number) =>
  Array.from({ length: count }, (_, idx) => ({
    product_id: `prod_${idx + 1}`,
    merchant_id: 'merch_1',
    title: `Product ${idx + 1}`,
    description: `Description ${idx + 1}`,
    price: 10 + idx,
    currency: 'USD',
    image_url: `https://example.com/${idx + 1}.png`,
    in_stock: true,
  }));

describe('getAllProducts browse routing', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forces small browse rails onto the PLP mainline and trims the response back to the requested size', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        products: makeProducts(12),
      }),
    );

    const products = await getAllProducts(6);

    expect(products).toHaveLength(6);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/gateway');
    const body = JSON.parse(String(init.body || '{}'));
    expect(body).toMatchObject({
      operation: 'find_products_multi',
      payload: {
        search: {
          query: '',
          limit: 12,
          page: 1,
          search_all_merchants: true,
          allow_external_seed: true,
          allow_stale_cache: false,
          external_seed_strategy: 'unified_relevance',
        },
      },
      metadata: {
        entry: 'plp',
        scope: {
          catalog: 'global',
        },
      },
    });
  });

  it('preserves explicit browse catalog overrides while still honoring the minimum discovery limit', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        products: makeProducts(12),
      }),
    );

    await getAllProducts(6, undefined, { page: 2, entry: 'plp', catalog: 'promo_pool' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body || '{}'));
    expect(body?.payload?.search?.page).toBe(2);
    expect(body?.payload?.search?.limit).toBe(12);
    expect(body?.metadata?.scope?.catalog).toBe('promo_pool');
  });

  it('requests brand-scoped discovery feed with sort and query metadata', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        products: makeProducts(2),
        total: 8,
        page: 1,
        page_size: 2,
        metadata: {
          has_more: true,
          sort_applied: 'price_desc',
          brand_scope_applied: ['Tom Ford Beauty'],
          query_text: 'lip',
        },
      }),
    );

    const result = await getBrandDiscoveryFeed({
      brandName: 'Tom Ford Beauty',
      query: 'lip',
      sort: 'price_desc',
      recentViews: [{ product_id: 'seed_1', merchant_id: 'external_seed', title: 'Rose lipstick' }],
    });

    expect(result.products).toHaveLength(2);
    expect(result.page_info.has_more).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body || '{}'));
    expect(body).toMatchObject({
      operation: 'get_discovery_feed',
      payload: {
        surface: 'browse_products',
        sort: 'price_desc',
        query: {
          text: 'lip',
        },
        scope: {
          brand_names: ['Tom Ford Beauty'],
        },
      },
    });
  });
});
