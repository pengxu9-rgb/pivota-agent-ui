import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

describe('internal indexability check', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports ready when Googlebot can fetch canonical PDP content and sitemap/internal links include it', async () => {
    const productEntityId = 'sig_7ad40676c42fb9c96e2a8136';
    const url = `https://agent.pivota.cc/products/${productEntityId}`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        if (input === url) {
          return {
            status: 200,
            text: async () => `
              <html>
                <head>
                  <link rel="canonical" href="${url}" />
                  <script type="application/ld+json">
                    {"@context":"https://schema.org","@type":"Product","name":"Serum","offers":{"@type":"Offer","url":"${url}"}}
                  </script>
                </head>
                <body>
                  <script type="application/json" data-pivota-product-seo-signals>
                    {
                      "product_name":"Serum",
                      "brand":"The Ordinary",
                      "overview":"Lightweight lash and brow serum."
                    }
                  </script>
                </body>
              </html>
            `,
          };
        }
        if (input === 'https://agent.pivota.cc/sitemap-products.xml') {
          return {
            status: 200,
            text: async () => `<urlset><url><loc>${url}</loc></url></urlset>`,
          };
        }
        return {
          status: 200,
          text: async () => `<a href="/products/${productEntityId}">Serum</a>`,
        };
      }),
    );

    const response = await GET(
      new Request(`https://agent.pivota.cc/api/internal/indexability-check?product_entity_id=${productEntityId}`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      url,
      http_status: 200,
      canonical_present: true,
      server_rendered_content: {
        product_name: true,
        brand: true,
        description: true,
      },
      jsonld: {
        product: true,
        offer: true,
      },
      sitemap_included: true,
      indexability_status: 'ready',
    });
    expect(body.internal_links_count).toBeGreaterThanOrEqual(1);
  });

  it('rejects non-canonical ProductEntity IDs', async () => {
    const response = await GET(
      new Request('https://agent.pivota.cc/api/internal/indexability-check?product_entity_id=ext_bad'),
    );

    expect(response.status).toBe(400);
  });
});
