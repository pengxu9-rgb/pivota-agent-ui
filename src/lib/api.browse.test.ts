import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getAllProducts,
  getBrandDiscoveryFeed,
  getShoppingDiscoveryFeed,
  getSimilarProductsMainline,
} from './api';

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
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('routes generic browse rails through discovery feed instead of empty product search', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        products: makeProducts(6),
      }),
    );

    const products = await getAllProducts(6);

    expect(products).toHaveLength(6);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/gateway');
    const body = JSON.parse(String(init.body || '{}'));
    expect(body).toMatchObject({
      operation: 'get_discovery_feed',
      payload: {
        surface: 'browse_products',
        response_detail: 'card',
        limit: 6,
        context: {
          auth_state: 'anonymous',
          recent_queries: [],
          recent_views: [],
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

  it('binds discovery context to the current shopping user', async () => {
    window.localStorage.setItem(
      'pivota_recent_queries_v1:user:user_123',
      JSON.stringify(['vitamin c serum']),
    );
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        products: makeProducts(6),
      }),
    );

    await getAllProducts(6, undefined, {
      userId: 'user_123',
      recentViews: [
        {
          product_id: 'viewed_1',
          merchant_id: 'external_seed',
          title: 'Barrier repair serum',
          product_type: 'serum',
        },
      ],
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body || '{}'));
    expect(body).toMatchObject({
      operation: 'get_discovery_feed',
      payload: {
        surface: 'browse_products',
        context: {
          auth_state: 'authenticated',
          recent_queries: ['vitamin c serum'],
          recent_views: [
            {
              product_id: 'viewed_1',
              merchant_id: 'external_seed',
              title: 'Barrier repair serum',
              product_type: 'serum',
            },
          ],
        },
      },
    });
  });

  it('does not backfill local recent queries when browse explicitly passes an empty list', async () => {
    window.localStorage.setItem(
      'pivota_recent_queries_v1:anon:device_test',
      JSON.stringify(['the ordinary', '薇诺娜']),
    );
    window.localStorage.setItem('pivota_behavior_device_id_v1', 'device_test');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        products: makeProducts(4),
      }),
    );

    await getShoppingDiscoveryFeed({
      surface: 'browse_products',
      page: 1,
      limit: 4,
      recentQueries: [],
      recentViews: [],
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body || '{}'));
    expect(body).toMatchObject({
      operation: 'get_discovery_feed',
      payload: {
        context: {
          recent_queries: [],
          recent_views: [],
        },
      },
    });
  });

  it('preserves explicit browse catalog overrides while using the matching discovery surface', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        products: makeProducts(6),
      }),
    );

    await getAllProducts(6, undefined, { page: 2, entry: 'plp', catalog: 'promo_pool' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body || '{}'));
    expect(body).toMatchObject({
      operation: 'get_discovery_feed',
      payload: {
        surface: 'home_hot_deals',
        response_detail: 'card',
        page: 2,
        limit: 6,
        context: {
          auth_state: 'anonymous',
        },
      },
      metadata: {
        scope: {
          catalog: 'promo_pool',
        },
      },
    });
  });

  it('requests shopping discovery feed with auth and scoped behavior context', async () => {
    window.localStorage.setItem(
      'pivota_recent_queries_v1:user:user_789',
      JSON.stringify(['niacinamide serum', 'barrier moisturizer']),
    );
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        products: makeProducts(4),
        page: 2,
        page_size: 4,
        total: 10,
        metadata: {
          has_more: true,
        },
      }),
    );

    const result = await getShoppingDiscoveryFeed({
      surface: 'browse_products',
      page: 2,
      limit: 4,
      entry: 'plp',
      userId: 'user_789',
      recentViews: [
        {
          product_id: 'viewed_1',
          merchant_id: 'external_seed',
          title: 'Barrier repair serum',
          product_type: 'serum',
        },
      ],
    });

    expect(result.products).toHaveLength(4);
    expect(result.page_info).toEqual({
      page: 2,
      page_size: 4,
      total: 10,
      has_more: true,
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body || '{}'));
    expect(body).toMatchObject({
      operation: 'get_discovery_feed',
      payload: {
        surface: 'browse_products',
        response_detail: 'card',
        page: 2,
        limit: 4,
        context: {
          auth_state: 'authenticated',
          locale: 'en-US',
          recent_queries: ['niacinamide serum', 'barrier moisturizer'],
          recent_views: [
            {
              product_id: 'viewed_1',
              merchant_id: 'external_seed',
              title: 'Barrier repair serum',
              product_type: 'serum',
            },
          ],
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

  it('times out shopping discovery feed requests instead of hanging indefinitely', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      const signal = init?.signal as AbortSignal | undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener(
          'abort',
          () => {
            const error = new Error('Aborted');
            (error as Error & { name: string }).name = 'AbortError';
            reject(error);
          },
          { once: true },
        );
      });
    });

    const request = getShoppingDiscoveryFeed({
      surface: 'browse_products',
      query: 'Vitamin C Complex Serum',
      timeout_ms: 50,
    });

    const assertion = expect(request).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT',
      message: 'The request timed out. Please retry.',
    });

    await vi.advanceTimersByTimeAsync(60);

    await assertion;
  });

  it('keeps explicit merchant browse on product search', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        products: makeProducts(6),
      }),
    );

    await getAllProducts(6, 'merchant_1', { page: 2, entry: 'plp', catalog: 'promo_pool' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body || '{}'));
    expect(body).toMatchObject({
      operation: 'find_products_multi',
      payload: {
        search: {
          page: 2,
          merchant_id: 'merchant_1',
          search_all_merchants: false,
        },
      },
    });
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
          category_scope_applied: ['lip balm'],
          query_text: 'lip',
          facets: {
            categories: [{ value: 'lip balm', label: 'Lip Balm', count: 2 }],
          },
        },
      }),
    );

    const result = await getBrandDiscoveryFeed({
      brandName: 'Tom Ford Beauty',
      query: 'lip',
      category: 'lip balm',
      sort: 'price_desc',
      recentViews: [{ product_id: 'seed_1', merchant_id: 'external_seed', title: 'Rose lipstick' }],
    });

    expect(result.products).toHaveLength(2);
    expect(result.page_info.has_more).toBe(true);
    expect(result.facets.categories).toEqual([{ value: 'lip balm', label: 'Lip Balm', count: 2 }]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body || '{}'));
    expect(body).toMatchObject({
      operation: 'get_discovery_feed',
      payload: {
        surface: 'browse_products',
        response_detail: 'card',
        sort: 'price_desc',
        query: {
          text: 'lip',
        },
        scope: {
          brand_names: ['Tom Ford Beauty'],
          categories: ['lip balm'],
        },
      },
    });
  });

  it('requests explicit mainline similar products with exclusions for user-driven load more', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        strategy: 'related_products',
        products: [
          {
            product_id: 'sim_7',
            merchant_id: 'external_seed',
            merchant_name: 'KraveBeauty',
            title: 'Hair Mask',
            image_url: 'https://example.com/sim-7.png',
            price: { amount: 39, currency: 'USD' },
            product_type: 'hair mask',
            department: 'haircare',
            tags: ['editorial: moisture reset'],
            review_summary: {
              rating: 4.7,
              review_count: 182,
            },
            search_card: {
              compact_candidate: 'Hair Mask',
              highlight_candidate: 'Deep moisture reset',
              proof_badge_candidate: '4.7★ (182)',
            },
          },
        ],
        metadata: {
          has_more: true,
          route: 'find_similar_products_mainline_wrapper',
        },
        total: 1,
        page: 1,
        page_size: 1,
        has_more: true,
      }),
    );

    const result = await getSimilarProductsMainline({
      product_id: 'ext_095c6c8edcc67317c0b377a0',
      merchant_id: 'external_seed',
      limit: 6,
      exclude_items: [
        { product_id: 'sim_1', merchant_id: 'external_seed' },
        { product_id: 'sim_2', merchant_id: 'external_seed' },
      ],
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        product_id: 'sim_7',
        merchant_id: 'external_seed',
        merchant_name: 'KraveBeauty',
        title: 'Hair Mask',
        product_type: 'hair mask',
        category: 'hair mask',
        department: 'haircare',
        tags: ['editorial: moisture reset'],
        card_highlight: 'Deep moisture reset',
        card_badge: '4.7★ (182)',
        search_card: expect.objectContaining({
          compact_candidate: 'Hair Mask',
          highlight_candidate: 'Deep moisture reset',
          proof_badge_candidate: '4.7★ (182)',
        }),
      }),
    ]);
    expect(result.page_info.has_more).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body || '{}'));
    expect(body).toMatchObject({
      operation: 'find_similar_products',
      payload: {
        product_id: 'ext_095c6c8edcc67317c0b377a0',
        merchant_id: 'external_seed',
        limit: 6,
        exclude_items: [
          { product_id: 'sim_1', merchant_id: 'external_seed' },
          { product_id: 'sim_2', merchant_id: 'external_seed' },
        ],
      },
    });
  });
});
