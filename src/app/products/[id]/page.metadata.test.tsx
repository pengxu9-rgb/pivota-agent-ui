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
  });

  it('falls back to the site title when PDP metadata cannot be resolved', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'missing' }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe('Pivota Shopping AI');
  });
});
