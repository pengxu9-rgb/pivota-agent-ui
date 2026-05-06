import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { buildPaginationLinks, fetchIndexabilityPage } from './productsIndexability';
import { SITEMAP_SEED_PRODUCT_IDS } from '../../sitemap-seeds';

vi.mock('next/headers', () => ({
  headers: async () => ({
    get: () => null,
  }),
}));

describe('buildPaginationLinks', () => {
  it('returns dense list when totalPages ≤ 7', () => {
    expect(buildPaginationLinks(1, 1)).toEqual([1]);
    expect(buildPaginationLinks(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(buildPaginationLinks(7, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('windows around current page on long pagination', () => {
    // page 5 of 20 → [1, …, 3, 4, 5, 6, 7, …, 20]
    const out = buildPaginationLinks(5, 20);
    expect(out).toEqual([1, null, 3, 4, 5, 6, 7, null, 20]);
  });

  it('handles edge near page 1', () => {
    const out = buildPaginationLinks(1, 20);
    expect(out).toEqual([1, 2, 3, null, 20]);
  });

  it('handles edge near last page', () => {
    const out = buildPaginationLinks(20, 20);
    expect(out).toEqual([1, null, 18, 19, 20]);
  });

  it('avoids "..." when window is adjacent to anchor', () => {
    // page 3 of 20 → [1, 2, 3, 4, 5, ..., 20] (no gap between 1 and 2)
    const out = buildPaginationLinks(3, 20);
    expect(out).toEqual([1, 2, 3, 4, 5, null, 20]);
  });

  it('returns minimal anchor list when totalPages is unknown', () => {
    expect(buildPaginationLinks(1, null)).toEqual([1]);
    expect(buildPaginationLinks(5, null)).toEqual([4, 5]);
  });
});

describe('fetchIndexabilityPage — seed fallback', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('falls back to seeds when fetch throws (timeout, network error)', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('aborted'));
    const out = await fetchIndexabilityPage(1);
    expect(out.source).toBe('seeds');
    expect(out.products.length).toBe(SITEMAP_SEED_PRODUCT_IDS.length);
    expect(out.products[0].product_entity_id).toBe(SITEMAP_SEED_PRODUCT_IDS[0]);
    expect(out.errorMessage).toContain('Registry fetch failed');
  });

  it('falls back to seeds when registry returns 5xx', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 503,
    });
    const out = await fetchIndexabilityPage(1);
    expect(out.source).toBe('seeds');
    expect(out.errorMessage).toContain('HTTP 503');
  });

  it('falls back to seeds when registry returns empty products', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ products: [] }),
    });
    const out = await fetchIndexabilityPage(1);
    expect(out.source).toBe('seeds');
    expect(out.products.length).toBe(SITEMAP_SEED_PRODUCT_IDS.length);
  });

  it('seed fallback returns empty products for page > 1', async () => {
    // Seeds fit on one page; crawlers shouldn't get a duplicated seed
    // list across pagination when registry is down.
    (global.fetch as any).mockRejectedValueOnce(new Error('aborted'));
    const out = await fetchIndexabilityPage(2);
    expect(out.source).toBe('seeds');
    expect(out.products).toEqual([]);
    expect(out.hasMore).toBe(false);
  });

  it('happy path: registry feed contributes when 200 + non-empty', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        products: [
          { product_entity_id: 'sig_dynamic_1', title: 'Dynamic Product One', brand: 'Acme' },
          { product_entity_id: 'sig_dynamic_2', title: 'Dynamic Product Two' },
        ],
        total: 2,
      }),
    });
    const out = await fetchIndexabilityPage(1);
    expect(out.source).toBe('registry');
    expect(out.products.map((p) => p.product_entity_id)).toEqual([
      'sig_dynamic_1',
      'sig_dynamic_2',
    ]);
    expect(out.totalPages).toBe(1);
    expect(out.hasMore).toBe(false);
  });

  it('skips non-sig product entries in registry response', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        products: [
          { product_entity_id: 'sig_real', title: 'Real' },
          { product_entity_id: 'ext_alias', title: 'Alias' }, // dropped
          { title: 'No ID' }, // dropped
        ],
      }),
    });
    const out = await fetchIndexabilityPage(1);
    // ext_* and entries without sig_ id should be dropped — sitemap
    // canonicality requirement bleeds through.
    expect(out.products.map((p) => p.product_entity_id)).toEqual(['sig_real']);
  });
});
