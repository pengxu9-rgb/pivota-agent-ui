/**
 * THE CRAWLER GUARANTEE, asserted on real HTML from the real card.
 *
 * The sibling ProductsPageClient test mocks CatalogProductCard away, so it can
 * prove a title renders but cannot see an <a href> at all — which is the single
 * thing this whole change exists to produce. Review found two defects that only
 * a real-markup assertion catches: every href carried a `?return=` query string
 * (24 hydration mismatches, and the param was silently lost), and the grid is
 * wrapped in an inline opacity:0 from framer-motion's initial state.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/store/cartStore', () => ({
  useCartStore: (selector?: (s: any) => unknown) => {
    const state = { items: [], addItem: vi.fn(), open: vi.fn() };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/products',
}));

import { CatalogProductCard } from '@/components/catalog/CatalogProductCard';

function card(overrides: Record<string, unknown> = {}) {
  return {
    product_id: 'sig_000348608dab8c172868d835c91b3cf4',
    merchant_id: 'external_seed',
    platform: 'external_seed',
    title: 'Lovely Peach Foot Mask',
    brand: 'TONYMOLY',
    price: 5.5,
    currency: 'USD',
    image_url: 'https://cdn.example/a.jpg',
    pivota_canonical_url:
      'https://agent.pivota.cc/products/sig_000348608dab8c172868d835c91b3cf4',
    ...overrides,
  } as never;
}

describe('server-rendered product card markup', () => {
  it('emits the CLEAN canonical PDP href — no ?return= query string', () => {
    const html = renderToStaticMarkup(<CatalogProductCard product={card()} />);

    expect(html).toContain(
      'href="/products/sig_000348608dab8c172868d835c91b3cf4"',
    );
    // A query-stringed internal link wastes crawl budget and points at a
    // non-canonical variant of the URL the sitemap advertises.
    expect(html).not.toContain('return=');
  });

  it('links to a real PDP, never back to the listing', () => {
    const html = renderToStaticMarkup(<CatalogProductCard product={card()} />);
    expect(html).toMatch(/href="\/products\/sig_[0-9a-f]+"/);
  });
});
