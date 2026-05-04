import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PivotaProductSeoSummary,
  buildOfferJsonLd,
  buildPivotaProductMetadata,
  buildProductJsonLd,
  canonicalPivotaProductEntityUrl,
  canonicalPivotaProductUrl,
  getIndexableProductSitemapUrls,
  getPivotaProductSeoData,
  type PivotaProductSeoData,
} from './pdpSeo';

const cleanSeoData: PivotaProductSeoData = {
  productId: 'ext_skin1004_cleanser',
  productEntityId: 'pe_skin1004_cleanser',
  canonicalProductSlug: 'skin1004-madagascar-centella-tone-brightening-cleanser',
  externalSeedIds: ['ext_skin1004_cleanser'],
  name: 'SKIN1004 Madagascar Centella Tone Brightening Cleansing Gel Foam 125ml',
  brand: 'SKIN1004',
  sku: 'USSKL013',
  variant: '125ml',
  category: 'Skincare > Cleanser',
  overview:
    'Agent-facing Pivota product page for SKIN1004 Madagascar Centella Tone Brightening Cleansing Gel Foam 125ml.',
  intelligenceSummary:
    'A centella cleansing gel foam positioned for tone brightening, daily cleansing, and lightweight skincare routines.',
  keyBenefits: ['tone brightening', 'daily cleansing'],
  useCases: ['centella cleanser', 'daily brightening cleanser'],
  activeIngredients: ['centella asiatica', 'brightening complex'],
  texture: 'gel foam',
  finish: 'fresh rinse',
  skinType: 'dull or uneven-looking skin',
  differentiators: ['centella positioning', 'brightening cleanser use case'],
  claimEvidence: 'merchant source and Pivota product intelligence',
  image: 'https://cdn.example.test/skin1004.jpg',
  canonicalUrl:
    'https://agent.pivota.cc/products/skin1004-madagascar-centella-tone-brightening-cleanser',
  sourceReferences: [
    {
      sourceType: 'external_seed',
      sourceId: 'ext_skin1004_cleanser',
      mapsToProductEntityId: 'pe_skin1004_cleanser',
      confidence: 'source_alias',
    },
    {
      sourceType: 'official_merchant_pdp',
      sourceUrl:
        'https://skin1004.com/products/madagascar-centella-tone-brightening-cleansing-gel-foam',
      merchantName: 'SKIN1004 Official',
      mapsToProductEntityId: 'pe_skin1004_cleanser',
      confidence: 'high',
    },
  ],
  merchantSource: {
    merchantName: 'SKIN1004 Official',
    sourceUrl:
      'https://skin1004.com/products/madagascar-centella-tone-brightening-cleansing-gel-foam',
    sourceType: 'official_merchant_pdp',
    verifiedAt: '2026-05-03T00:00:00.000Z',
    confidence: 'high',
  },
  offers: [
    {
      offerId: 'offer_skin1004_cleanser',
      merchantName: 'SKIN1004 Official',
      sourceUrl:
        'https://skin1004.com/products/madagascar-centella-tone-brightening-cleansing-gel-foam',
      price: 18,
      currency: 'USD',
      availability: 'https://schema.org/InStock',
    },
  ],
  similarHighlights: ['Differentiate against other K-beauty brightening cleansers.'],
  source: 'gateway',
};

describe('Pivota PDP SEO rendering', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it('uses product-specific metadata instead of the generic app shell title', () => {
    const metadata = buildPivotaProductMetadata(cleanSeoData);

    expect(metadata.title).toBe(
      'SKIN1004 Madagascar Centella Tone Brightening Cleansing Gel Foam 125ml | Pivota',
    );
    expect(metadata.title).not.toBe('Pivota Shopping AI');
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.alternates).toEqual({
      canonical:
        'https://agent.pivota.cc/products/skin1004-madagascar-centella-tone-brightening-cleanser',
    });
  });

  it('canonical ProductEntity URLs strip return and tracking params by construction', () => {
    expect(
      canonicalPivotaProductEntityUrl({
        productEntityId: 'pe_skin1004_cleanser',
        canonicalProductSlug: 'skin1004-madagascar-centella-tone-brightening-cleanser',
      }),
    ).toBe(
      'https://agent.pivota.cc/products/skin1004-madagascar-centella-tone-brightening-cleanser',
    );
    expect(canonicalPivotaProductUrl('ext_skin1004_cleanser')).toBe(
      'https://agent.pivota.cc/products/ext_skin1004_cleanser',
    );
  });

  it('renders Product JSON-LD with required product fields', () => {
    const jsonLd = buildProductJsonLd(cleanSeoData);

    expect(jsonLd).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: cleanSeoData.name,
      sku: 'USSKL013',
      url: cleanSeoData.canonicalUrl,
      description: cleanSeoData.overview,
      category: 'Skincare > Cleanser',
    });
    expect(jsonLd.brand).toEqual({ '@type': 'Brand', name: 'SKIN1004' });
  });

  it('renders Offer JSON-LD only with verified price fields when present', () => {
    const jsonLd = buildOfferJsonLd(cleanSeoData);
    const withoutPrice = buildOfferJsonLd({
      ...cleanSeoData,
      offers: [
        {
          offerId: 'offer_no_price',
          merchantName: 'SKIN1004 Official',
          sourceUrl: cleanSeoData.merchantSource?.sourceUrl,
          availability: 'https://schema.org/InStock',
        },
      ],
    });

    expect(jsonLd).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Offer',
      price: 18,
      priceCurrency: 'USD',
    });
    expect(withoutPrice).not.toHaveProperty('price');
    expect(withoutPrice).not.toHaveProperty('priceCurrency');
  });

  it('does not fabricate missing PDP SEO fields from placeholders', () => {
    const sparseData: PivotaProductSeoData = {
      ...cleanSeoData,
      brand: '',
      sku: undefined,
      category: undefined,
      overview: '',
      intelligenceSummary: '',
      keyBenefits: [],
      useCases: [],
      activeIngredients: [],
      differentiators: [],
      offers: [
        {
          offerId: 'offer_without_verified_inventory',
          sourceUrl: cleanSeoData.merchantSource?.sourceUrl,
        },
      ],
    };
    const metadata = buildPivotaProductMetadata(sparseData);
    const productJsonLd = buildProductJsonLd(sparseData);
    const offerJsonLd = buildOfferJsonLd(sparseData);
    const { container } = render(<PivotaProductSeoSummary data={sparseData} />);

    expect(metadata).not.toHaveProperty('description');
    expect(metadata.openGraph).not.toHaveProperty('description');
    expect(productJsonLd).not.toHaveProperty('brand');
    expect(productJsonLd).not.toHaveProperty('sku');
    expect(productJsonLd).not.toHaveProperty('description');
    expect(productJsonLd).not.toHaveProperty('category');
    expect(offerJsonLd).not.toHaveProperty('availability');
    expect(container.querySelector('[data-pivota-product-brand]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-pivota-product-overview]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-pivota-product-intelligence]')).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('Pivota product intelligence summary');
    expect(container.textContent).not.toContain('Agent-facing Pivota product page');
  });

  it('renders AggregateOffer JSON-LD for ProductEntity PDPs with multiple merchant offers', () => {
    const jsonLd = buildOfferJsonLd({
      ...cleanSeoData,
      offers: [
        ...cleanSeoData.offers,
        {
          offerId: 'offer_skin1004_retail_partner',
          merchantName: 'Retail Partner',
          sourceUrl: 'https://retailer.example.test/skin1004-cleanser',
          price: 19,
          currency: 'USD',
          availability: 'https://schema.org/InStock',
        },
      ],
    });

    expect(jsonLd).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'AggregateOffer',
      url: cleanSeoData.canonicalUrl,
      offerCount: 2,
      lowPrice: 18,
      highPrice: 19,
      priceCurrency: 'USD',
    });
    expect((jsonLd as any).offers).toHaveLength(2);
  });

  it('renders machine-readable SEO signals without adding a visible PDP header module', () => {
    const { container } = render(<PivotaProductSeoSummary data={cleanSeoData} />);
    const summary = container.querySelector('[data-pivota-public-product-summary]');

    expect(summary).toBeInTheDocument();
    expect(summary).toHaveAttribute('aria-hidden', 'true');
    expect(summary?.textContent).toContain(cleanSeoData.name);
    expect(summary?.textContent).toContain('SKIN1004');
    expect(summary?.textContent).toContain('pe_skin1004_cleanser');
    expect(summary?.textContent).toContain('ext_skin1004_cleanser');
    expect(summary?.textContent).not.toContain('Pivota verified product page');
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(container.querySelector('[data-pivota-product-source-references]')).toBeInTheDocument();
  });

  it('returns no SEO success data and marks metadata noindex when gateway SEO data is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({}),
      })),
    );

    const data = await getPivotaProductSeoData('ext_d7c74bcb380cbc2bdd5d5d90');
    const metadata = buildPivotaProductMetadata(data);

    expect(data).toBeNull();
    expect(metadata.title).toBe('Pivota Shopping AI');
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(buildProductJsonLd(data)).toBeNull();
    expect(buildOfferJsonLd(data)).toBeNull();
  });

  it('resolves canonical ProductEntity routes through explicit source alias bindings', async () => {
    const requestedProductIds: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        const body = JSON.parse(String((init as RequestInit)?.body || '{}'));
        const requestedProductId = body?.payload?.product_ref?.product_id;
        requestedProductIds.push(requestedProductId);
        if (requestedProductId === 'sig_7ad40676c42fb9c96e2a8136') {
          return {
            ok: false,
            json: async () => ({}),
          };
        }
        return {
          ok: true,
          json: async () => ({
            subject: {
              type: 'product_group',
              id: 'sig_7ad40676c42fb9c96e2a8136',
            },
            modules: [
              {
                type: 'canonical',
                data: {
                  product_group_id: 'sig_7ad40676c42fb9c96e2a8136',
                  pdp_payload: {
                    product: {
                      product_id: 'ext_d7c74bcb380cbc2bdd5d5d90',
                      title: 'Multi-Peptide Lash and Brow Serum',
                      brand: { name: 'the ordinary' },
                      description:
                        'A lightweight serum for fuller-looking lashes and brows.',
                      category_path: ['Beauty', 'Serum'],
                    },
                    modules: [],
                    offers: [
                      {
                        offer_id:
                          'of:v1:external_seed:sig_7ad40676c42fb9c96e2a8136:merchant:default__ext_d7c74bcb380cbc2bdd5d5d90',
                        merchant_name: 'the ordinary',
                        price: { amount: 11.47, currency: 'USD' },
                        inventory: { in_stock: true },
                        action: {
                          url: 'https://theordinary.com/en-us/multi-peptide-lash-brow-serum-100111.html',
                        },
                      },
                    ],
                    actions: [],
                  },
                },
              },
            ],
          }),
        };
      }),
    );

    const data = await getPivotaProductSeoData('sig_7ad40676c42fb9c96e2a8136');

    expect(requestedProductIds).toEqual([
      'sig_7ad40676c42fb9c96e2a8136',
      'ext_d7c74bcb380cbc2bdd5d5d90',
    ]);
    expect(data).toMatchObject({
      productId: 'sig_7ad40676c42fb9c96e2a8136',
      productEntityId: 'sig_7ad40676c42fb9c96e2a8136',
      name: 'Multi-Peptide Lash and Brow Serum',
      brand: 'the ordinary',
      canonicalUrl: 'https://agent.pivota.cc/products/sig_7ad40676c42fb9c96e2a8136',
    });
    expect(data?.externalSeedIds).toContain('ext_d7c74bcb380cbc2bdd5d5d90');
    expect(data?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'external_seed',
          sourceId: 'ext_d7c74bcb380cbc2bdd5d5d90',
          mapsToProductEntityId: 'sig_7ad40676c42fb9c96e2a8136',
        }),
      ]),
    );
  });

  it('sitemap helper includes ProductEntity URLs only from configured or discovered main-path data', async () => {
    vi.stubEnv('PIVOTA_SITEMAP_DYNAMIC_PRODUCTS_ENABLED', 'true');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          products: [
            {
              product_id: 'ext_d7c74bcb380cbc2bdd5d5d90',
              product_group_id: 'sig_7ad40676c42fb9c96e2a8136',
            },
          ],
        }),
      })),
    );

    const urls = await getIndexableProductSitemapUrls(20);

    expect(urls).toContain(
      'https://agent.pivota.cc/products/sig_7ad40676c42fb9c96e2a8136',
    );
    expect(urls).not.toContain(
      'https://agent.pivota.cc/products/ext_d7c74bcb380cbc2bdd5d5d90',
    );
  });

  it('sitemap helper uses the safe ProductEntity allowlist without gateway fallback content', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const urls = await getIndexableProductSitemapUrls(20);

    expect(urls).toContain(
      'https://agent.pivota.cc/products/sig_7ad40676c42fb9c96e2a8136',
    );
    expect(urls.some((url) => url.includes('/products/ext_'))).toBe(false);
    expect(urls.some((url) => url.includes('return='))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
