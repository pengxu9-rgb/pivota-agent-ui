import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ProductDetailPage, {
  generateMetadata,
  generateStaticParams,
  revalidate,
} from './page';
// The force-dynamic alias route that serves merchant-personalized
// (?merchant_id) requests via the next.config beforeFiles rewrite. The static
// /products/[id] route can never read searchParams (a dynamic-API touch during
// on-demand static generation is a hard 500), so the merchant-scoped SSR
// contract lives here.
import PersonalizedProductDetailPage, {
  generateMetadata as generatePersonalizedMetadata,
  dynamic as personalizedRouteDynamic,
} from '../m/[id]/page';
import { PDP_DEGRADED_RENDER_ERROR } from './pdpServerPage';

const getPdpV2Mock = vi.hoisted(() => vi.fn());
const getPdpV2CachedMock = vi.hoisted(() => vi.fn());
const mapPdpV2ToPdpPayloadMock = vi.hoisted(() => vi.fn());
const noStoreMock = vi.hoisted(() => vi.fn());
const headersMock = vi.hoisted(() => vi.fn(async () => new Headers({
  'x-forwarded-host': 'agent.pivota.cc',
  'x-forwarded-proto': 'https',
})));

vi.mock('next/headers', () => ({
  headers: headersMock,
}));

// The page opts DEGRADED renders (gateway error / empty payload) out of
// full-route + CDN caching via unstable_noStore. In a real request-time
// static generation pass this throws DynamicServerError to bail the render
// out to dynamic; the mock lets tests assert both when it fires and that the
// page never swallows its throw.
vi.mock('next/cache', () => ({
  unstable_noStore: (...args: unknown[]) => noStoreMock(...args),
}));

vi.mock('@/lib/api', () => ({
  getPdpV2: (...args: unknown[]) => getPdpV2Mock(...args),
  // The canonical crawlable path uses the cached read. Mirror the real wrapper:
  // strip the cache-only keys and delegate to getPdpV2, so the underlying
  // fetch-arg assertions stay valid AND we can assert the cached path was taken.
  getPdpV2Cached: (args: Record<string, unknown>) => {
    getPdpV2CachedMock(args);
    const { revalidateSeconds, cacheTags, ...rest } = args || {};
    void revalidateSeconds;
    void cacheTags;
    return getPdpV2Mock(rest);
  },
}));

vi.mock('@/features/pdp/adapter/mapPdpV2ToPdpPayload', () => ({
  mapPdpV2ToPdpPayload: (...args: unknown[]) => mapPdpV2ToPdpPayloadMock(...args),
}));

vi.mock('./ProductDetailClient', () => ({
  default: () => null,
}));

const corePdpInclude = [
  'offers',
  'variant_selector',
  'product_overview',
  'reviews_preview',
] as const;

function buildPayload(product: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    schema_version: '1.0.0',
    page_type: 'product_detail',
    tracking: {
      page_request_id: 'pr_test',
      entry_point: 'agent',
    },
    product: {
      product_id: 'sig_7ad40676c42fb9c96e2a8136',
      title: 'Fallback Product',
      default_variant_id: 'v_1',
      variants: [],
      ...product,
    },
    modules: [],
    actions: [],
    ...overrides,
  };
}

function buildSearchParamsAwaitTrap() {
  const then = vi.fn(() => {
    throw new Error('searchParams should not be awaited for canonical sig PDPs');
  });
  return {
    searchParams: { then } as unknown as Promise<Record<string, string | string[] | undefined>>,
    then,
  };
}

describe('product page metadata', () => {
  beforeEach(() => {
    getPdpV2Mock.mockReset();
    mapPdpV2ToPdpPayloadMock.mockReset();
    headersMock.mockClear();
    noStoreMock.mockReset();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('VERCEL_URL', '');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('uses canonical PDP product data for server-rendered title and social metadata', async () => {
    const v2Response = {
      modules: [
        {
          type: 'canonical',
          data: {
            pdp_payload: {},
          },
        },
      ],
    };
    getPdpV2Mock.mockResolvedValue(v2Response);
    mapPdpV2ToPdpPayloadMock.mockReturnValue(buildPayload({
      title: 'Multi-Peptide Lash and Brow Serum',
      description: 'A lightweight lash and brow serum.',
      brand: { name: 'the ordinary' },
      image_url: 'https://example.com/lash-serum.png',
    }));
    const searchParamsAwaitTrap = buildSearchParamsAwaitTrap();

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'sig_7ad40676c42fb9c96e2a8136' }),
      searchParams: searchParamsAwaitTrap.searchParams,
    });

    expect(metadata.title).toBe('the ordinary Multi-Peptide Lash and Brow Serum | Pivota');
    expect(metadata.description).toBe('A lightweight lash and brow serum.');
    expect((metadata.openGraph as any)?.title).toBe(
      'the ordinary Multi-Peptide Lash and Brow Serum | Pivota',
    );
    expect((metadata.twitter as any)?.images).toEqual(['https://example.com/lash-serum.png']);
    expect(getPdpV2Mock).toHaveBeenCalledTimes(1);
    expect(getPdpV2Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: 'sig_7ad40676c42fb9c96e2a8136',
        include: corePdpInclude,
        timeout_ms: 9000,
        gatewayBaseUrl: 'https://agent.pivota.cc/api/gateway',
      }),
    );
    expect(getPdpV2Mock.mock.calls[0]?.[0]).not.toHaveProperty('merchant_id');
    expect(searchParamsAwaitTrap.then).not.toHaveBeenCalled();
    expect(headersMock).not.toHaveBeenCalled();
    expect(mapPdpV2ToPdpPayloadMock).toHaveBeenCalledWith(v2Response);
    // Phase 1a fixes: canonical link, robots index/follow, supported og:type, og:url.
    // Product-specific search/LLM indexing is covered by server-rendered JSON-LD.
    expect((metadata.alternates as any)?.canonical).toBe(
      'https://agent.pivota.cc/products/sig_7ad40676c42fb9c96e2a8136',
    );
    expect((metadata.robots as any)?.index).toBe(true);
    expect((metadata.robots as any)?.follow).toBe(true);
    expect((metadata.openGraph as any)?.type).toBe('website');
    expect((metadata.openGraph as any)?.url).toBe(
      'https://agent.pivota.cc/products/sig_7ad40676c42fb9c96e2a8136',
    );
  });

  it('uses an env-based gateway URL for server PDP fetches', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://preview.example.com///');
    const v2Response = { modules: [] };
    getPdpV2Mock.mockResolvedValue(v2Response);
    mapPdpV2ToPdpPayloadMock.mockReturnValue(buildPayload({
      title: 'Preview Product',
    }));

    await generateMetadata({
      params: Promise.resolve({ id: 'sig_env_gateway' }),
      searchParams: Promise.resolve({}),
    });

    expect(getPdpV2Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: 'sig_env_gateway',
        gatewayBaseUrl: 'https://preview.example.com/api/gateway',
      }),
    );
    expect(headersMock).not.toHaveBeenCalled();
  });

  it('falls back to the site title when PDP metadata cannot be resolved', async () => {
    getPdpV2Mock.mockRejectedValue(new Error('missing'));

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'missing' }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe('Pivota Shopping AI');
  });

  it('keeps the defensive noindex on SSR failure for non-sitemap routes', async () => {
    getPdpV2Mock.mockRejectedValue(new Error('missing'));

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'missing' }),
      searchParams: Promise.resolve({}),
    });

    expect((metadata.robots as any)?.index).toBe(false);
    expect((metadata.robots as any)?.follow).toBe(false);
  });

  it('omits robots (never hard-noindex) on SSR failure for sitemap sig_ routes', async () => {
    getPdpV2Mock.mockRejectedValue(new Error('transient backend failure'));

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'sig_7ad40676c42fb9c96e2a8136' }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe('Pivota Shopping AI');
    expect(metadata.robots).toBeUndefined();
  });

  it('omits robots (never hard-noindex) on SSR failure for sitemap ck_ routes', async () => {
    getPdpV2Mock.mockRejectedValue(new Error('transient backend failure'));

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'ck_29d0bbfe6981112f320b5ace1df66aee' }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe('Pivota Shopping AI');
    expect(metadata.robots).toBeUndefined();
  });

  it('routes canonical crawlable PDPs through the CACHED read (the crawl-collapse fix)', async () => {
    // sig_/ck_/pg_ canonical routes must use getPdpV2Cached so the render has no
    // uncacheable dynamic fetch → the route can render static and crawlers hit warm
    // cache instead of a cold SSR. This is the regression guard for the fix; if a
    // future change routes canonical PDPs back through the raw getPdpV2, the page
    // silently reverts to dynamic (private, no-store) and crawl budget collapses.
    getPdpV2Mock.mockResolvedValue({
      modules: [{ type: 'canonical', data: { product_id: 'sig_cache_guard', title: 'Guard' } }],
    });
    mapPdpV2ToPdpPayloadMock.mockReturnValue({ product: { title: 'Guard' } });

    for (const id of ['sig_cache_guard', 'ck_cache_guard', 'pg_cache_guard']) {
      getPdpV2CachedMock.mockClear();
      await generateMetadata({
        params: Promise.resolve({ id }),
        searchParams: Promise.resolve({}),
      });
      expect(getPdpV2CachedMock).toHaveBeenCalledTimes(1);
      expect(getPdpV2CachedMock.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ product_id: id, revalidateSeconds: 3600 }),
      );
    }
  });

  it('does NOT cache a personalized (merchant searchParam) non-canonical route', async () => {
    // The personalized path (served by the force-dynamic alias route) must stay
    // on the raw uncached read — caching it would serve one visitor's
    // merchant-scoped view to everyone.
    getPdpV2Mock.mockResolvedValue({
      modules: [{ type: 'canonical', data: { product_id: 'plain-id', title: 'X' } }],
    });
    mapPdpV2ToPdpPayloadMock.mockReturnValue({ product: { title: 'X' } });
    getPdpV2CachedMock.mockClear();

    await generatePersonalizedMetadata({
      params: Promise.resolve({ id: 'plain-id' }),
      searchParams: Promise.resolve({ merchant_id: 'merch_123' }),
    });

    expect(getPdpV2CachedMock).not.toHaveBeenCalled();
    expect(getPdpV2Mock).toHaveBeenCalledWith(
      expect.objectContaining({ merchant_id: 'merch_123' }),
    );
  });

  it('FAILS the degraded canonical render on the static route instead of shipping a cacheable shell', async () => {
    // S1 follow-up to the crawl-collapse fix, revised for the static/ISR flip:
    // the static route CANNOT serve a degraded 200 shell — the full-route cache
    // would store it for `revalidate` seconds — and unstable_noStore cannot
    // gracefully bail an on-demand static generation pass (it hard-500s
    // unstyled). The degraded render must THROW: the fill stores nothing, a
    // failed background revalidation keeps serving the last healthy page, and
    // error.tsx serves the client-recovery PDP to human visitors.
    getPdpV2Mock.mockRejectedValue(new Error('transient backend failure'));
    const searchParamsAwaitTrap = buildSearchParamsAwaitTrap();

    await expect(
      ProductDetailPage({
        params: Promise.resolve({ id: 'sig_7ad40676c42fb9c96e2a8136' }),
        searchParams: searchParamsAwaitTrap.searchParams,
      }),
    ).rejects.toThrow(PDP_DEGRADED_RENDER_ERROR);
    // The degraded path must not regress the static-render triggers either.
    expect(searchParamsAwaitTrap.then).not.toHaveBeenCalled();
    expect(headersMock).not.toHaveBeenCalled();
  });

  it('keeps degraded METADATA graceful (no throw) so the page-level throw owns the failure', async () => {
    getPdpV2Mock.mockResolvedValue({ modules: [] });
    mapPdpV2ToPdpPayloadMock.mockReturnValue(null);

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'sig_7ad40676c42fb9c96e2a8136' }),
      searchParams: Promise.resolve({}),
    });

    // Sitemap-route degraded semantics stay intact: fallback title, robots
    // omitted (never hard-noindex) so crawlers can retry.
    expect(metadata.title).toBe('Pivota Shopping AI');
    expect(metadata.robots).toBeUndefined();
  });

  it('serves the degraded 200 shell (uncached) on the force-dynamic alias route', async () => {
    // The alias route is force-dynamic — nothing is ever stored — so the
    // graceful shell + client-refetch recovery is safe there. unstable_noStore
    // stays as a tripwire: if force-dynamic is ever dropped, degraded fills
    // fail loudly instead of caching a personalized view.
    getPdpV2Mock.mockRejectedValue(new Error('transient backend failure'));

    const element = await PersonalizedProductDetailPage({
      params: Promise.resolve({ id: 'plain-id' }),
      searchParams: Promise.resolve({ merchant_id: 'merch_123' }),
    });
    const html = renderToStaticMarkup(element as any);

    expect(noStoreMock).toHaveBeenCalled();
    expect(html).not.toContain('application/ld+json');
  });

  it('NEVER opts a successful canonical render out of caching (healthy PDPs stay cacheable)', async () => {
    // Mutation guard for the crawl-collapse fix: if the noStore call ever
    // leaks onto the success path, every canonical PDP render silently goes
    // dynamic/uncacheable again and crawl budget re-collapses.
    getPdpV2Mock.mockResolvedValue({
      modules: [{ type: 'canonical', data: { pdp_payload: {} } }],
    });
    mapPdpV2ToPdpPayloadMock.mockReturnValue(buildPayload({
      title: 'Healthy Product',
    }));

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'sig_7ad40676c42fb9c96e2a8136' }),
      searchParams: Promise.resolve({}),
    });
    const element = await ProductDetailPage({
      params: Promise.resolve({ id: 'sig_7ad40676c42fb9c96e2a8136' }),
      searchParams: Promise.resolve({}),
    });
    renderToStaticMarkup(element as any);

    expect(metadata.title).toBe('Healthy Product | Pivota');
    expect(noStoreMock).not.toHaveBeenCalled();
  });

  it('propagates the noStore tripwire throw on the alias route instead of swallowing it', async () => {
    // If the alias route ever loses force-dynamic, a real static generation
    // pass makes unstable_noStore throw DynamicServerError. If the page's own
    // try/catch swallowed that throw, the degraded personalized shell would
    // get stored after all. The call must sit OUTSIDE the gateway-error catch.
    const bailout = new Error('DYNAMIC_SERVER_USAGE_BAILOUT_SENTINEL');
    noStoreMock.mockImplementation(() => {
      throw bailout;
    });
    getPdpV2Mock.mockRejectedValue(new Error('transient backend failure'));

    await expect(
      PersonalizedProductDetailPage({
        params: Promise.resolve({ id: 'plain-id' }),
        searchParams: Promise.resolve({ merchant_id: 'merch_123' }),
      }),
    ).rejects.toThrow('DYNAMIC_SERVER_USAGE_BAILOUT_SENTINEL');
  });

  it('keeps the defensive noindex on degraded personalized (non-canonical) metadata', async () => {
    getPdpV2Mock.mockRejectedValue(new Error('transient backend failure'));

    const metadata = await generatePersonalizedMetadata({
      params: Promise.resolve({ id: 'plain-id' }),
      searchParams: Promise.resolve({ merchant_id: 'merch_123' }),
    });

    // Non-sitemap routes keep the defensive noindex on failure.
    expect((metadata.robots as any)?.index).toBe(false);
  });

  it('uses product-group canonical metadata for multi-merchant PDP responses', async () => {
    getPdpV2Mock.mockResolvedValue({
      subject: { type: 'product_group', id: 'pg_catalog_abc123' },
      modules: [
        {
          type: 'canonical',
          data: {
            product_group_id: 'pg_catalog_abc123',
            canonical_scope: 'multi_merchant_canonical',
          },
        },
        {
          type: 'offers',
          data: { offers_count: 2 },
        },
      ],
    });
    mapPdpV2ToPdpPayloadMock.mockReturnValue(buildPayload(
      {
        product_id: '10064558129449',
        title: 'Barrier Serum',
        description: 'A serum with multiple sellers.',
      },
      {
        product_group_id: 'pg_catalog_abc123',
        canonical_scope: 'multi_merchant_canonical',
        offers_count: 2,
      },
    ));

    const metadata = await generatePersonalizedMetadata({
      params: Promise.resolve({ id: '10064558129449' }),
      searchParams: Promise.resolve({ merchant_id: 'merch_1' }),
    });

    expect(getPdpV2Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: '10064558129449',
        merchant_id: 'merch_1',
        include: corePdpInclude,
      }),
    );
    expect((metadata.alternates as any)?.canonical).toBe(
      'https://agent.pivota.cc/products/pg_catalog_abc123',
    );
    expect((metadata.openGraph as any)?.url).toBe(
      'https://agent.pivota.cc/products/pg_catalog_abc123',
    );
  });

  it('uses signature canonical metadata for singleton product-group responses', async () => {
    getPdpV2Mock.mockResolvedValue({
      subject: { type: 'product_group', id: 'pg_catalog_singleton' },
      modules: [
        {
          type: 'canonical',
          data: {
            product_group_id: 'pg_catalog_singleton',
          },
        },
      ],
    });
    mapPdpV2ToPdpPayloadMock.mockReturnValue(buildPayload(
      {
        product_id: '10064558129449',
        title: 'Singleton Serum',
        description: 'A grouped catalog product.',
        pivota_signature_id: 'sig_singleton123',
      },
      {
        product_group_id: 'pg_catalog_singleton',
      },
    ));

    const metadata = await generatePersonalizedMetadata({
      params: Promise.resolve({ id: '10064558129449' }),
      searchParams: Promise.resolve({ merchant_id: 'merch_1' }),
    });

    expect((metadata.alternates as any)?.canonical).toBe(
      'https://agent.pivota.cc/products/sig_singleton123',
    );
  });

  it('server-renders signature PDPs without awaiting searchParams', async () => {
    const v2Response = { modules: [] };
    getPdpV2Mock.mockResolvedValue(v2Response);
    mapPdpV2ToPdpPayloadMock.mockReturnValue(buildPayload({
      product_id: 'sig_jsonld_static',
      title: 'Static JSON-LD Product',
    }));
    const searchParamsAwaitTrap = buildSearchParamsAwaitTrap();

    await ProductDetailPage({
      params: Promise.resolve({ id: 'sig_jsonld_static' }),
      searchParams: searchParamsAwaitTrap.searchParams,
    });

    expect(getPdpV2Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: 'sig_jsonld_static',
      }),
    );
    expect(getPdpV2Mock.mock.calls[0]?.[0]).not.toHaveProperty('merchant_id');
    expect(searchParamsAwaitTrap.then).not.toHaveBeenCalled();
    expect(headersMock).not.toHaveBeenCalled();
  });

  it('keeps merchant-scoped SSR fetches for non-signature product routes (alias route)', async () => {
    const v2Response = { modules: [] };
    getPdpV2Mock.mockResolvedValue(v2Response);
    mapPdpV2ToPdpPayloadMock.mockReturnValue(buildPayload({
      product_id: 'prod_1',
      title: 'Merchant Scoped Product',
    }));

    await PersonalizedProductDetailPage({
      params: Promise.resolve({ id: 'prod_1' }),
      searchParams: Promise.resolve({ merchant_id: 'merchant_a' }),
    });

    expect(getPdpV2Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: 'prod_1',
        merchant_id: 'merchant_a',
        include: corePdpInclude,
      }),
    );
  });

  it('never awaits searchParams on the static route — even for non-canonical ids', async () => {
    // The canonical /products/[id] route is static/ISR via generateStaticParams.
    // During on-demand static generation of ANY id (canonical or not), touching
    // searchParams is a hard 500 (DYNAMIC_SERVER_USAGE), not a graceful dynamic
    // fallback — so the static route must render every id anonymously through
    // the cached read. Merchant personalization is the alias route's job.
    const v2Response = { modules: [] };
    getPdpV2Mock.mockResolvedValue(v2Response);
    mapPdpV2ToPdpPayloadMock.mockReturnValue(buildPayload({
      product_id: 'prod_1',
      title: 'Anonymous Non-Canonical Product',
    }));
    getPdpV2CachedMock.mockClear();
    const searchParamsAwaitTrap = buildSearchParamsAwaitTrap();

    await ProductDetailPage({
      params: Promise.resolve({ id: 'prod_1' }),
      searchParams: searchParamsAwaitTrap.searchParams,
    });

    expect(searchParamsAwaitTrap.then).not.toHaveBeenCalled();
    expect(getPdpV2CachedMock).toHaveBeenCalledTimes(1);
    expect(getPdpV2Mock.mock.calls[0]?.[0]).not.toHaveProperty('merchant_id');

    getPdpV2CachedMock.mockClear();
    getPdpV2Mock.mockClear();
    const metadataTrap = buildSearchParamsAwaitTrap();
    await generateMetadata({
      params: Promise.resolve({ id: 'prod_1' }),
      searchParams: metadataTrap.searchParams,
    });
    expect(metadataTrap.then).not.toHaveBeenCalled();
    expect(getPdpV2CachedMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the static/ISR opt-in on the canonical route (generateStaticParams + revalidate)', async () => {
    // Root cause of the crawl-collapse fix not taking effect on deploy: a
    // dynamic-segment route WITHOUT generateStaticParams is always rendered
    // dynamically — `revalidate` alone never opts it into static/ISR, so every
    // canonical PDP shipped `private, no-store` despite #266. The empty array
    // (no build-time prerenders, generate-on-first-visit) is the opt-in; if
    // either export disappears, the route silently reverts to
    // dynamic-per-request and crawl budget collapses again.
    await expect(generateStaticParams()).resolves.toEqual([]);
    expect(revalidate).toBe(3600);
  });

  it('keeps the merchant alias route force-dynamic', () => {
    // The alias route reads searchParams per-request; if force-dynamic is ever
    // dropped it becomes a static route and merchant-personalized requests
    // start 500ing during on-demand static generation.
    expect(personalizedRouteDynamic).toBe('force-dynamic');
  });

  it('renders recommendations ItemList from the mapped server payload', async () => {
    const v2Response = { modules: [] };
    getPdpV2Mock.mockResolvedValue(v2Response);
    mapPdpV2ToPdpPayloadMock.mockReturnValue(buildPayload(
      {
        product_id: 'sig_jsonld_recommendations',
        title: 'Mapped Serum',
      },
      {
        modules: [
          {
            type: 'recommendations',
            data: {
              items: [
                {
                  product_id: 'prod_similar1',
                  merchant_id: 'merchant_a',
                  title: 'Similar Serum',
                },
              ],
            },
          },
        ],
      },
    ));

    const element = await ProductDetailPage({
      params: Promise.resolve({ id: 'sig_jsonld_recommendations' }),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(element as any);
    const scriptMatch = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/);

    expect(scriptMatch).not.toBeNull();
    const parsed = JSON.parse(scriptMatch![1]);
    const itemListNode = parsed['@graph']?.find((node: any) => node['@type'] === 'ItemList');
    expect(itemListNode).toMatchObject({
      '@type': 'ItemList',
      numberOfItems: 1,
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          url: 'https://agent.pivota.cc/products/prod_similar1?merchant_id=merchant_a',
          name: 'Similar Serum',
        },
      ],
    });
  });
});
