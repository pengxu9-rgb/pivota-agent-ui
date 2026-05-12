import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateMetadata } from './page';

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({
    'x-forwarded-host': 'agent.pivota.cc',
    'x-forwarded-proto': 'https',
  })),
}));

vi.mock('./ProductDetailClient', () => ({
  default: () => null,
}));

describe('product page metadata', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses canonical PDP product data for server-rendered title and social metadata', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          modules: [
            {
              type: 'canonical',
              data: {
                pdp_payload: {
                  product: {
                    title: 'Multi-Peptide Lash and Brow Serum',
                    description: 'A lightweight lash and brow serum.',
                    brand: { name: 'the ordinary' },
                    image_url: 'https://example.com/lash-serum.png',
                  },
                },
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

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
    expect(fetchMock).toHaveBeenCalledWith(
      'https://agent.pivota.cc/api/gateway',
      expect.objectContaining({
        method: 'POST',
      }),
    );
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
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'missing' }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe('Pivota Shopping AI');
  });

  it('uses product-group canonical metadata for multi-merchant PDP responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            subject: { type: 'product_group', id: 'pg_catalog_abc123' },
            modules: [
              {
                type: 'canonical',
                data: {
                  product_group_id: 'pg_catalog_abc123',
                  canonical_scope: 'multi_merchant_canonical',
                  pdp_payload: {
                    product: {
                      title: 'Barrier Serum',
                      description: 'A serum with multiple sellers.',
                    },
                  },
                },
              },
              {
                type: 'offers',
                data: { offers_count: 2 },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: '10064558129449' }),
      searchParams: Promise.resolve({ merchant_id: 'merch_1' }),
    });

    expect((metadata.alternates as any)?.canonical).toBe(
      'https://agent.pivota.cc/products/pg_catalog_abc123',
    );
    expect((metadata.openGraph as any)?.url).toBe(
      'https://agent.pivota.cc/products/pg_catalog_abc123',
    );
  });

  it('uses signature canonical metadata for singleton product-group responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            subject: { type: 'product_group', id: 'pg_catalog_singleton' },
            modules: [
              {
                type: 'canonical',
                data: {
                  product_group_id: 'pg_catalog_singleton',
                  pdp_payload: {
                    product: {
                      title: 'Singleton Serum',
                      description: 'A grouped catalog product.',
                      pivota_signature_id: 'sig_singleton123',
                    },
                  },
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: '10064558129449' }),
      searchParams: Promise.resolve({ merchant_id: 'merch_1' }),
    });

    expect((metadata.alternates as any)?.canonical).toBe(
      'https://agent.pivota.cc/products/sig_singleton123',
    );
  });
});
