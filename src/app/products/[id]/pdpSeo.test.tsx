import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PivotaProductSeoSummary,
  buildOfferJsonLd,
  buildPivotaProductMetadata,
  buildProductJsonLd,
  canonicalPivotaProductUrl,
  getIndexableProductSitemapUrls,
  type PivotaProductSeoData,
} from './pdpSeo';

const cleanSeoData: PivotaProductSeoData = {
  productId: 'ext_skin1004_cleanser',
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
  canonicalUrl: 'https://agent.pivota.cc/products/ext_skin1004_cleanser',
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
  });
  it('uses product-specific metadata instead of the generic app shell title', () => {
    const metadata = buildPivotaProductMetadata(cleanSeoData);

    expect(metadata.title).toBe(
      'SKIN1004 Madagascar Centella Tone Brightening Cleansing Gel Foam 125ml | Pivota',
    );
    expect(metadata.title).not.toBe('Pivota Shopping AI');
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.alternates).toEqual({
      canonical: 'https://agent.pivota.cc/products/ext_skin1004_cleanser',
    });
  });

  it('canonical product URLs strip return and tracking params by construction', () => {
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

  it('renders source reference and product intelligence in server HTML', () => {
    render(<PivotaProductSeoSummary data={cleanSeoData} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      cleanSeoData.name,
    );
    expect(screen.getByText('SKIN1004')).toBeInTheDocument();
    expect(screen.getByText(/Verified merchant source/i)).toBeInTheDocument();
    expect(
      screen.getAllByText(/madagascar-centella-tone-brightening-cleansing-gel-foam/i)
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/Product intelligence/i)).toBeInTheDocument();
    expect(screen.getByText(/Similar \/ substitute highlight/i)).toBeInTheDocument();
  });

  it('sitemap helper includes the current pilot Pivota PDP URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ products: [] }),
      })),
    );

    const urls = await getIndexableProductSitemapUrls(20);

    expect(urls).toContain(
      'https://agent.pivota.cc/products/ext_d7c74bcb380cbc2bdd5d5d90',
    );
  });
});
