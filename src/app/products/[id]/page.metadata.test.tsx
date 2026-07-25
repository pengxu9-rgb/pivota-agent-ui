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
import ProductDetailLayout from './layout';

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

// notFound() is how a PERMANENTLY unbuildable PDP exits (404). The real one
// throws a digest-tagged error that Next intercepts; this mock reproduces the
// throw so tests can assert the 404 path fired AND that the render never
// continues past it into a 200 shell or a 500.
const NOT_FOUND_THROWN = 'NEXT_NOT_FOUND_THROWN';
const notFoundMock = vi.hoisted(() => vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND_THROWN');
}));

// Spread the real module so a future useRouter/useParams/redirect import
// anywhere in the page's graph does not fail with an opaque "not a function".
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  notFound: () => notFoundMock(),
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
    notFoundMock.mockClear();
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
    // TRANSIENT failure specifically (a rejected gateway read). A 200 carrying
    // no mappable product is now classified PERMANENT and gets the hard
    // noindex instead — see the unbuildable suite below.
    getPdpV2Mock.mockRejectedValue(new Error('transient backend failure'));

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

  // ---------------------------------------------------------------------
  // SAME-CONTENT duplicates: content_canonical_route_id.
  //
  // 474 content_keys serve identical content — same title, same Product
  // JSON-LD, confirmed by live probes — under 2 to 7 sig URLs, a population P3
  // grew when it made minted canonicals renderable next to the mirror they
  // were minted from. Every one of those pages emitted a SELF-referential
  // canonical, so both URLs declared themselves canonical for the same content
  // and Google was free to index the one the sitemap omits.
  //
  // #280 fixed the sitemap; these tests are the other half. The value comes
  // from the gateway rather than being derived here on purpose: it MUST equal
  // the sig the sitemap advertises, and that winner is sticky on index equity
  // rather than computable from the row. A tag naming a different sig than the
  // sitemap submits would tell the crawler to drop the URL we just submitted —
  // worse than the duplicate.
  // ---------------------------------------------------------------------
  it('points a duplicate sig PDP at the ELECTED canonical instead of itself', async () => {
    const elected = 'sig_c1ae6bae3c95e29035cf91b46a81b224';
    const losing = 'sig_2f057569e49bcc11a33e54dcac6d9dca';
    getPdpV2Mock.mockResolvedValue({
      modules: [{ type: 'canonical', data: { content_canonical_route_id: elected } }],
    });
    mapPdpV2ToPdpPayloadMock.mockReturnValue(buildPayload({
      product_id: losing,
      title: 'Acme Glow Serum',
      pivota_signature_id: losing,
    }));

    const metadata = await generatePersonalizedMetadata({
      params: Promise.resolve({ id: losing }),
      searchParams: Promise.resolve({ merchant_id: 'merch_1' }),
    });

    expect((metadata.alternates as any)?.canonical).toBe(
      `https://agent.pivota.cc/products/${elected}`,
    );
    expect((metadata.openGraph as any)?.url).toBe(
      `https://agent.pivota.cc/products/${elected}`,
    );
  });

  it('stays self-referential when the elected sig IS this page', async () => {
    // The winner must not canonicalise away from itself — that would strip the
    // one URL we advertise of its own tag.
    const elected = 'sig_c1ae6bae3c95e29035cf91b46a81b224';
    getPdpV2Mock.mockResolvedValue({
      modules: [{ type: 'canonical', data: { content_canonical_route_id: elected } }],
    });
    mapPdpV2ToPdpPayloadMock.mockReturnValue(buildPayload({
      product_id: elected,
      title: 'Acme Glow Serum',
      pivota_signature_id: elected,
    }));

    const metadata = await generatePersonalizedMetadata({
      params: Promise.resolve({ id: elected }),
      searchParams: Promise.resolve({ merchant_id: 'merch_1' }),
    });

    expect((metadata.alternates as any)?.canonical).toBe(
      `https://agent.pivota.cc/products/${elected}`,
    );
  });

  it('falls back to self when the content_key has no election', async () => {
    // Freshly minted, or a backend predating migration 181. Absent must mean
    // "unchanged", never "no canonical".
    const own = 'sig_2f057569e49bcc11a33e54dcac6d9dca';
    for (const data of [
      {},
      { content_canonical_route_id: null },
      { content_canonical_route_id: '' },
    ]) {
      getPdpV2Mock.mockResolvedValue({ modules: [{ type: 'canonical', data }] });
      mapPdpV2ToPdpPayloadMock.mockReturnValue(buildPayload({
        product_id: own,
        title: 'Acme Glow Serum',
        pivota_signature_id: own,
      }));

      const metadata = await generatePersonalizedMetadata({
        params: Promise.resolve({ id: own }),
        searchParams: Promise.resolve({ merchant_id: 'merch_1' }),
      });

      expect((metadata.alternates as any)?.canonical).toBe(
        `https://agent.pivota.cc/products/${own}`,
      );
    }
  });

  it('ignores a malformed election rather than emitting a URL that 500s', async () => {
    // /products/ck_… and /products/sig_ both error in production. An election
    // is not a licence to skip the route-id shape check.
    const own = 'sig_2f057569e49bcc11a33e54dcac6d9dca';
    for (const bad of ['ck_7f02a883e39e2529c8299393cf8e9669', 'sig_', 'not-an-id']) {
      getPdpV2Mock.mockResolvedValue({
        modules: [{ type: 'canonical', data: { content_canonical_route_id: bad } }],
      });
      mapPdpV2ToPdpPayloadMock.mockReturnValue(buildPayload({
        product_id: own,
        title: 'Acme Glow Serum',
        pivota_signature_id: own,
      }));

      const metadata = await generatePersonalizedMetadata({
        params: Promise.resolve({ id: own }),
        searchParams: Promise.resolve({ merchant_id: 'merch_1' }),
      });

      expect((metadata.alternates as any)?.canonical).toBe(
        `https://agent.pivota.cc/products/${own}`,
      );
    }
  });

  it('a multi-merchant GROUP still outranks the content-key election', async () => {
    // The ranking, stated as a test: the group is the wider canonicalisation
    // and subsumes this one. If the narrower rule won, a grouped PDP would stop
    // pointing at its group and that consolidation would silently unwind.
    getPdpV2Mock.mockResolvedValue({
      subject: { type: 'product_group', id: 'pg_catalog_abc123' },
      modules: [
        {
          type: 'canonical',
          data: {
            product_group_id: 'pg_catalog_abc123',
            canonical_scope: 'multi_merchant_canonical',
            content_canonical_route_id: 'sig_c1ae6bae3c95e29035cf91b46a81b224',
          },
        },
        { type: 'offers', data: { offers_count: 2 } },
      ],
    });
    mapPdpV2ToPdpPayloadMock.mockReturnValue(buildPayload(
      { product_id: 'sig_2f057569e49bcc11a33e54dcac6d9dca', title: 'Barrier Serum' },
      {
        product_group_id: 'pg_catalog_abc123',
        canonical_scope: 'multi_merchant_canonical',
        offers_count: 2,
      },
    ));

    const metadata = await generatePersonalizedMetadata({
      params: Promise.resolve({ id: 'sig_2f057569e49bcc11a33e54dcac6d9dca' }),
      searchParams: Promise.resolve({ merchant_id: 'merch_1' }),
    });

    expect((metadata.alternates as any)?.canonical).toBe(
      'https://agent.pivota.cc/products/pg_catalog_abc123',
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

  it('layout and page fetch with IDENTICAL args so React cache() dedupes them', async () => {
    // React cache() keys on argument identity. If the layout and the canonical
    // page disagree on ANY arg, they miss each other's memo: two backend reads on
    // every one of ~1,900 ISR pages, and — if the merchant id diverged — a
    // merchant-scoped JSON-LD block baked into a PUBLIC cached page. cache() is a
    // passthrough under vitest so dedupe itself isn't observable; assert the
    // arg tuples match instead, which is the property that makes dedupe possible.
    getPdpV2Mock.mockResolvedValue({ modules: [] });
    mapPdpV2ToPdpPayloadMock.mockReturnValue(
      buildPayload({ product_id: 'sig_cache_key', title: 'Cache Key Serum' }),
    );

    getPdpV2CachedMock.mockClear();
    await ProductDetailLayout({
      params: Promise.resolve({ id: 'sig_cache_key' }),
      children: null,
    });
    const layoutArgs = getPdpV2CachedMock.mock.calls.at(-1)?.[0];

    getPdpV2CachedMock.mockClear();
    await ProductDetailPage({
      params: Promise.resolve({ id: 'sig_cache_key' }),
      searchParams: Promise.resolve({}),
    });
    const pageArgs = getPdpV2CachedMock.mock.calls.at(-1)?.[0];

    expect(layoutArgs).toBeDefined();
    expect(pageArgs).toBeDefined();
    expect(layoutArgs).toEqual(pageArgs);
  });

  it('emits JSON-LD from the LAYOUT (SSR shell), not the page — crawler visibility', async () => {
    // THE regression guard. loading.tsx wraps the PAGE in a Suspense boundary, so
    // anything the page returns streams as an RSC flight chunk that only exists
    // after hydration. Measured on prod 2026-07-25: a live PDP stripped of
    // <script> tags had 69 chars of readable text and ZERO structured data, which
    // is why GPTBot/ClaudeBot had nothing to cite. The layout renders outside that
    // boundary, so the markup must come from there — and must NOT be duplicated.
    getPdpV2Mock.mockResolvedValue({ modules: [] });
    mapPdpV2ToPdpPayloadMock.mockReturnValue(
      buildPayload({ product_id: 'sig_shell_ldjson', title: 'Shell Serum' }),
    );

    const layoutHtml = renderToStaticMarkup(
      (await ProductDetailLayout({
        params: Promise.resolve({ id: 'sig_shell_ldjson' }),
        children: null,
      })) as any,
    );
    expect(layoutHtml).toContain('application/ld+json');

    const pageHtml = renderToStaticMarkup(
      (await ProductDetailPage({
        params: Promise.resolve({ id: 'sig_shell_ldjson' }),
        searchParams: Promise.resolve({}),
      })) as any,
    );
    expect(pageHtml).not.toContain('application/ld+json');
  });

  it('layout never throws — the PAGE keeps sole ownership of the degraded decision', async () => {
    // The canonical page deliberately throws on a degraded render so ISR won't
    // store a 200 shell. If the layout threw first we would 500 before the page
    // could decide, so the layout must degrade to "no markup" instead.
    // Force an error that ESCAPES the inner fetch (which swallows its own
    // failures and returns null) so the layout's own catch is what's under test.
    const html = renderToStaticMarkup(
      (await ProductDetailLayout({
        params: Promise.reject(new Error('params blew up')) as any,
        children: null,
      })) as any,
    );
    expect(html).not.toContain('application/ld+json');
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

    // The canonical route's JSON-LD is emitted by layout.tsx (SSR shell), not by
    // the page — the page's output streams inside loading.tsx's Suspense boundary
    // where non-JS crawlers never see it.
    const element = await ProductDetailLayout({
      params: Promise.resolve({ id: 'sig_jsonld_recommendations' }),
      children: null,
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

/**
 * PERMANENT-vs-TRANSIENT split (the #269 500-regression fix).
 *
 * #269 flipped canonical PDPs to static/ISR and made every degraded render
 * THROW so nothing broken could be cached. That was right for transient
 * failures and wrong for permanent ones: 127 of the 1,901 sitemap URLs point
 * at products the gateway hard-404s (`external_seed_not_active`), so they went
 * from thin 200 shells to permanent HTTP 500s — a repeated 5xx on a sitemap URL
 * throttles crawl budget instead of retiring the URL.
 *
 * The contract these tests pin:
 *   permanent — ONLY an allowlisted gateway `details.reason`
 *       -> notFound() = 404, never 500, never a cacheable 200
 *   everything else (bare 4xx, PRODUCT_NOT_SERVABLE, 5xx, timeout, network)
 *       -> keep throwing = 500, the honest retry signal
 *
 * The blast-radius tests below are the most important ones in this file. A
 * wrong 500 self-heals on the next crawl; a wrong 404 gets STORED in the
 * ISR/CDN cache and de-indexes a healthy product long after the incident ends.
 */
describe('PDP permanent-unbuildable vs transient failure semantics', () => {
  beforeEach(() => {
    getPdpV2Mock.mockReset();
    mapPdpV2ToPdpPayloadMock.mockReset();
    headersMock.mockClear();
    noStoreMock.mockReset();
    // Re-establish the throw: the sibling suite's afterEach calls
    // vi.restoreAllMocks(), which can strip an implementation baked in at
    // vi.fn() creation time. Without this the 404 assertions would silently
    // pass through instead of exercising notFound().
    notFoundMock.mockReset();
    notFoundMock.mockImplementation(() => {
      throw new Error(NOT_FOUND_THROWN);
    });
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('VERCEL_URL', '');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  /** Mirrors what callGateway attaches: status, code, and the parsed body. */
  function gatewayError(
    status: number | undefined,
    code?: string,
    reason?: string,
  ) {
    const err = new Error(code || `gateway ${status}`) as Error & {
      status?: number;
      code?: string;
      detail?: unknown;
    };
    if (typeof status === 'number') err.status = status;
    if (code) err.code = code;
    err.detail = {
      error: code,
      ...(reason ? { details: { reason } } : {}),
    };
    return err;
  }

  /** The exact live failure, probed 2026-07-25 against the reported sigs. */
  function externalSeedInactiveError() {
    return gatewayError(404, 'PRODUCT_NOT_FOUND', 'external_seed_not_active');
  }

  it('404s (not 500s) the real production cohort: PRODUCT_NOT_FOUND / external_seed_not_active', async () => {
    getPdpV2Mock.mockRejectedValue(externalSeedInactiveError());

    await expect(
      ProductDetailPage({
        params: Promise.resolve({ id: 'sig_4f21951a14b8995c1afd0ea4a0a9b5f1' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(NOT_FOUND_THROWN);

    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry a permanent failure — the gateway already answered definitively', async () => {
    getPdpV2Mock.mockRejectedValue(externalSeedInactiveError());

    await expect(
      ProductDetailPage({
        params: Promise.resolve({ id: 'sig_4f21951a14b8995c1afd0ea4a0a9b5f1' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(NOT_FOUND_THROWN);

    expect(getPdpV2Mock).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------
  // BLAST RADIUS. Each of these, if classified permanent, would 404 a large
  // slice of a HEALTHY catalog during an unrelated infrastructure incident —
  // and Next would cache every one of those 404s.
  // ---------------------------------------------------------------------

  it('does NOT 404 PRODUCT_NOT_SERVABLE — the eligibility gate fails CLOSED on any gateway DB error', async () => {
    // server.js returns 404 PRODUCT_NOT_SERVABLE whenever it cannot READ
    // serving eligibility, including on a plain Postgres error (the read
    // returns null and is only warn-logged). Treating this as permanent would
    // 404 the entire catalog on one DB hiccup, cached for the full revalidate
    // window.
    getPdpV2Mock.mockRejectedValue(
      gatewayError(404, 'PRODUCT_NOT_SERVABLE', 'serving_eligibility_missing'),
    );

    await expect(
      ProductDetailPage({
        params: Promise.resolve({ id: 'sig_7ad40676c42fb9c96e2a8136' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(PDP_DEGRADED_RENDER_ERROR);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('does NOT 404 INVALID_REQUEST — it is the invoke-envelope schema rejection, raised for every operation', async () => {
    // agent-ui and PIVOTA-Agent deploy independently, so a request-shape drift
    // 400s EVERY PDP at once. That must never become a cached 404.
    getPdpV2Mock.mockRejectedValue(gatewayError(400, 'INVALID_REQUEST'));

    await expect(
      ProductDetailPage({
        params: Promise.resolve({ id: 'sig_7ad40676c42fb9c96e2a8136' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(PDP_DEGRADED_RENDER_ERROR);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('does NOT 404 a PRODUCT_NOT_FOUND carrying an unrecognized reason', async () => {
    // PRODUCT_NOT_FOUND is also reachable from identity-resolution misses,
    // which flap. Only allowlisted reasons are terminal.
    getPdpV2Mock.mockRejectedValue(
      gatewayError(404, 'PRODUCT_NOT_FOUND', 'identity_resolution_failed'),
    );

    await expect(
      ProductDetailPage({
        params: Promise.resolve({ id: 'sig_7ad40676c42fb9c96e2a8136' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(PDP_DEGRADED_RENDER_ERROR);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('does NOT 404 a PRODUCT_NOT_FOUND with no reason at all', async () => {
    getPdpV2Mock.mockRejectedValue(gatewayError(404, 'PRODUCT_NOT_FOUND'));

    await expect(
      ProductDetailPage({
        params: Promise.resolve({ id: 'sig_7ad40676c42fb9c96e2a8136' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(PDP_DEGRADED_RENDER_ERROR);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('does NOT 404 the allowlisted reason when it arrives under a different code', async () => {
    // Defense against a reason string echoed on an unrelated failure.
    getPdpV2Mock.mockRejectedValue(
      gatewayError(500, 'INTERNAL_ERROR', 'external_seed_not_active'),
    );

    await expect(
      ProductDetailPage({
        params: Promise.resolve({ id: 'sig_7ad40676c42fb9c96e2a8136' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(PDP_DEGRADED_RENDER_ERROR);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 404, 408, 409, 422, 425, 429, 500, 502, 503])(
    'never 404s on bare HTTP %i with no allowlisted reason',
    async (status) => {
      getPdpV2Mock.mockRejectedValue(gatewayError(status));

      await expect(
        ProductDetailPage({
          params: Promise.resolve({ id: 'sig_7ad40676c42fb9c96e2a8136' }),
          searchParams: Promise.resolve({}),
        }),
      ).rejects.toThrow(PDP_DEGRADED_RENDER_ERROR);
      expect(notFoundMock).not.toHaveBeenCalled();
    },
  );

  it('keeps the 500 for a TRANSIENT timeout', async () => {
    getPdpV2Mock.mockRejectedValue(gatewayError(undefined, 'UPSTREAM_TIMEOUT'));

    await expect(
      ProductDetailPage({
        params: Promise.resolve({ id: 'sig_7ad40676c42fb9c96e2a8136' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(PDP_DEGRADED_RENDER_ERROR);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('treats a 200 with no mappable product as TRANSIENT (mid-ingestion / eligibility flap)', async () => {
    // getPdpV2Cached documents an empty payload as exactly this. It stays a
    // degraded 500, unchanged from before the static/ISR flip — a 404 here
    // would de-index products that are simply still being ingested.
    getPdpV2Mock.mockResolvedValue({ modules: [] });
    mapPdpV2ToPdpPayloadMock.mockReturnValue(null);

    await expect(
      ProductDetailPage({
        params: Promise.resolve({ id: 'sig_7ad40676c42fb9c96e2a8136' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(PDP_DEGRADED_RENDER_ERROR);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('also treats the getPdpV2Cached empty-payload sentinel as transient (the real canonical-route path)', async () => {
    // On the canonical route the cached read REJECTS an empty payload rather
    // than caching it, so this untagged Error — not the 200 branch above — is
    // what production actually hits.
    getPdpV2Mock.mockRejectedValue(new Error('pdp_empty_payload_not_cached'));

    await expect(
      ProductDetailPage({
        params: Promise.resolve({ id: 'sig_7ad40676c42fb9c96e2a8136' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(PDP_DEGRADED_RENDER_ERROR);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------
  // Retry scope
  // ---------------------------------------------------------------------

  it('never emits Product schema for an unbuildable (404) or degraded product', async () => {
    // The property the outcome guard exists for. `unbuildable` -> renderPdpPage
    // calls notFound(), `degraded` -> it throws; Next renders not-found.tsx /
    // error.tsx INSIDE this segment's layout, so without the guard we would
    // attach Product schema to a real 404 page or an error shell.
    getPdpV2Mock.mockRejectedValue(externalSeedInactiveError());
    const unbuildable = renderToStaticMarkup(
      (await ProductDetailLayout({
        params: Promise.resolve({ id: 'sig_unbuildable_guard' }),
        children: null,
      })) as any,
    );
    expect(unbuildable).not.toContain('application/ld+json');

    getPdpV2Mock.mockRejectedValue(gatewayError(503));
    const degraded = renderToStaticMarkup(
      (await ProductDetailLayout({
        params: Promise.resolve({ id: 'sig_degraded_guard' }),
        children: null,
      })) as any,
    );
    expect(degraded).not.toContain('application/ld+json');
  });

  it('RETRIES a timeout once and renders when the retry succeeds', async () => {
    getPdpV2Mock
      .mockRejectedValueOnce(gatewayError(undefined, 'UPSTREAM_TIMEOUT'))
      .mockResolvedValueOnce({
        modules: [{ type: 'canonical', data: { product_id: 'sig_retry', title: 'Recovered' } }],
      });
    mapPdpV2ToPdpPayloadMock.mockReturnValue({ product: { title: 'Recovered' } });

    // The retry must still yield a renderable product. Assert via the LAYOUT:
    // since #271 the canonical route's JSON-LD is emitted there (the page's own
    // output streams inside a CSR-bailed boundary crawlers never see).
    const element = await ProductDetailLayout({
      params: Promise.resolve({ id: 'sig_7ad40676c42fb9c96e2a8136' }),
      children: null,
    });

    expect(getPdpV2Mock).toHaveBeenCalledTimes(2);
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(element as any)).toContain('application/ld+json');
  });

  it('retries a genuine transport failure (fetch rejects with a TypeError)', async () => {
    getPdpV2Mock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      ProductDetailPage({
        params: Promise.resolve({ id: 'sig_7ad40676c42fb9c96e2a8136' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(PDP_DEGRADED_RENDER_ERROR);
    expect(getPdpV2Mock).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry the empty-payload sentinel — every mid-ingestion PDP would double its gateway calls', async () => {
    // getPdpV2Cached throws a bare Error with no status. A "no status means
    // network error" retry rule would fire on all of them.
    getPdpV2Mock.mockRejectedValue(new Error('pdp_empty_payload_not_cached'));

    await expect(
      ProductDetailPage({
        params: Promise.resolve({ id: 'sig_7ad40676c42fb9c96e2a8136' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(PDP_DEGRADED_RENDER_ERROR);
    expect(getPdpV2Mock).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry a programming error thrown by our own mapping code', async () => {
    // mapPdpV2ToPdpPayload / buildJsonLdProduct / readServerCanonicalRouteId
    // all run inside the try. A reproducible crash should not cost two calls.
    getPdpV2Mock.mockResolvedValue({ modules: [] });
    mapPdpV2ToPdpPayloadMock.mockImplementation(() => {
      throw new ReferenceError('x is not defined');
    });

    await expect(
      ProductDetailPage({
        params: Promise.resolve({ id: 'sig_7ad40676c42fb9c96e2a8136' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(PDP_DEGRADED_RENDER_ERROR);
    expect(getPdpV2Mock).toHaveBeenCalledTimes(1);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('does NOT retry a 5xx — doubling cold-fill traffic on an overloaded gateway makes the outage worse', async () => {
    getPdpV2Mock.mockRejectedValue(gatewayError(503));

    await expect(
      ProductDetailPage({
        params: Promise.resolve({ id: 'sig_7ad40676c42fb9c96e2a8136' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(PDP_DEGRADED_RENDER_ERROR);
    expect(getPdpV2Mock).toHaveBeenCalledTimes(1);
  });

  it('bounds the retry to a SMALLER timeout so a retry cannot double ISR fill latency', async () => {
    getPdpV2Mock.mockRejectedValue(gatewayError(undefined, 'UPSTREAM_TIMEOUT'));

    await expect(
      ProductDetailPage({
        params: Promise.resolve({ id: 'sig_7ad40676c42fb9c96e2a8136' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(PDP_DEGRADED_RENDER_ERROR);

    expect(getPdpV2Mock).toHaveBeenCalledTimes(2);
    const firstTimeout = getPdpV2Mock.mock.calls[0]?.[0]?.timeout_ms;
    const retryTimeout = getPdpV2Mock.mock.calls[1]?.[0]?.timeout_ms;
    expect(firstTimeout).toBe(9000);
    expect(retryTimeout).toBeLessThan(firstTimeout);
  });

  // ---------------------------------------------------------------------
  // Route scoping + metadata
  // ---------------------------------------------------------------------

  it('emits a hard noindex in METADATA for a permanently unbuildable canonical id', async () => {
    getPdpV2Mock.mockRejectedValue(externalSeedInactiveError());

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'sig_4f21951a14b8995c1afd0ea4a0a9b5f1' }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('does NOT noindex a canonical sig on the alias route, which renders a live 200 shell instead of 404ing', async () => {
    // The beforeFiles rewrite sends any request carrying ?merchant_id to the
    // alias route while the visible URL stays /products/<sig>. That route never
    // calls notFound(), so stamping noindex on its 200 would tell crawlers to
    // drop a product the client hydrates perfectly well. Non-canonical ids keep
    // their long-standing defensive noindex — only sitemap ids are protected.
    getPdpV2Mock.mockRejectedValue(externalSeedInactiveError());

    const metadata = await generatePersonalizedMetadata({
      params: Promise.resolve({ id: 'sig_4f21951a14b8995c1afd0ea4a0a9b5f1' }),
      searchParams: Promise.resolve({ merchant_id: 'merch_123' }),
    });

    expect(metadata.robots).toBeUndefined();
  });

  it('never 404s the force-dynamic alias route — a 4xx there can mean merchant scope, not gone', async () => {
    getPdpV2Mock.mockRejectedValue(externalSeedInactiveError());

    const element = await PersonalizedProductDetailPage({
      params: Promise.resolve({ id: 'plain-id' }),
      searchParams: Promise.resolve({ merchant_id: 'merch_123' }),
    });

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(noStoreMock).toHaveBeenCalled();
    renderToStaticMarkup(element as any);
  });

  it('does not touch dynamic APIs on the permanent-unbuildable path (static-render trigger guard)', async () => {
    getPdpV2Mock.mockRejectedValue(externalSeedInactiveError());
    const searchParamsAwaitTrap = buildSearchParamsAwaitTrap();

    await expect(
      ProductDetailPage({
        params: Promise.resolve({ id: 'sig_4f21951a14b8995c1afd0ea4a0a9b5f1' }),
        searchParams: searchParamsAwaitTrap.searchParams,
      }),
    ).rejects.toThrow(NOT_FOUND_THROWN);

    expect(searchParamsAwaitTrap.then).not.toHaveBeenCalled();
    expect(headersMock).not.toHaveBeenCalled();
  });
});
