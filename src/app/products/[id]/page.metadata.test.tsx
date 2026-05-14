import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ProductDetailPage, { generateMetadata } from './page';

const getPdpV2Mock = vi.hoisted(() => vi.fn());
const mapPdpV2ToPdpPayloadMock = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({
    'x-forwarded-host': 'agent.pivota.cc',
    'x-forwarded-proto': 'https',
  })),
}));

vi.mock('@/lib/api', () => ({
  getPdpV2: (...args: unknown[]) => getPdpV2Mock(...args),
}));

vi.mock('@/features/pdp/adapter/mapPdpV2ToPdpPayload', () => ({
  mapPdpV2ToPdpPayload: (...args: unknown[]) => mapPdpV2ToPdpPayloadMock(...args),
}));

vi.mock('./ProductDetailClient', () => ({
  default: () => null,
}));

const fullPdpInclude = [
  'offers',
  'variant_selector',
  'product_intel',
  'active_ingredients',
  'ingredients_inci',
  'how_to_use',
  'product_overview',
  'supplemental_details',
  'reviews_preview',
  'similar',
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

describe('product page metadata', () => {
  beforeEach(() => {
    getPdpV2Mock.mockReset();
    mapPdpV2ToPdpPayloadMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'sig_7ad40676c42fb9c96e2a8136' }),
      searchParams: Promise.resolve({}),
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
        include: fullPdpInclude,
        timeout_ms: 9000,
        gatewayBaseUrl: 'https://agent.pivota.cc/api/gateway',
      }),
    );
    expect(getPdpV2Mock.mock.calls[0]?.[0]).not.toHaveProperty('merchant_id');
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

  it('falls back to the site title when PDP metadata cannot be resolved', async () => {
    getPdpV2Mock.mockRejectedValue(new Error('missing'));

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'missing' }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe('Pivota Shopping AI');
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

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: '10064558129449' }),
      searchParams: Promise.resolve({ merchant_id: 'merch_1' }),
    });

    expect(getPdpV2Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: '10064558129449',
        merchant_id: 'merch_1',
        include: fullPdpInclude,
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

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: '10064558129449' }),
      searchParams: Promise.resolve({ merchant_id: 'merch_1' }),
    });

    expect((metadata.alternates as any)?.canonical).toBe(
      'https://agent.pivota.cc/products/sig_singleton123',
    );
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
    expect(parsed.itemList).toMatchObject({
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
