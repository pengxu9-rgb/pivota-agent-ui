import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAllProductsMock = vi.fn();

vi.mock('@/lib/api', () => ({
  getAllProducts: (...args: unknown[]) => getAllProductsMock(...args),
}));

import { GET } from './route';

const SEED_ID = 'sig_7ad40676c42fb9c96e2a8136';
const SEED_URL = `https://agent.pivota.cc/products/${SEED_ID}`;

async function readBody(res: Response): Promise<string> {
  // Next.js's NextResponse extends standard Response; .text() works.
  return await res.text();
}

describe('/sitemap-products.xml — products-only sitemap', () => {
  beforeEach(() => {
    getAllProductsMock.mockReset();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.PIVOTA_BACKEND_BASE_URL;
    delete process.env.NEXT_PUBLIC_PIVOTA_BACKEND_BASE_URL;
    vi.restoreAllMocks();
  });

  it('returns 200 with application/xml content-type', async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/xml/);
  });

  it('includes the seed PDP even when dynamic feed is unavailable', async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    const res = await GET();
    const xml = await readBody(res);
    expect(xml).toContain(SEED_URL);
    expect(xml).toContain('<urlset');
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    // Source header reports we shipped seeds-only.
    expect(res.headers.get('x-pivota-sitemap-source')).toBe('seeds');
  });

  it('merges dynamic products with seeds when API is reachable', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    getAllProductsMock.mockResolvedValueOnce([
      { product_id: SEED_ID },
      { product_id: 'sig_dynamic_product_xyz' },
    ]);
    const res = await GET();
    const xml = await readBody(res);
    // Seed appears exactly once (de-duped against the dynamic feed).
    expect(xml.match(new RegExp(SEED_URL, 'g'))!.length).toBe(1);
    expect(xml).toContain('https://agent.pivota.cc/products/sig_dynamic_product_xyz');
    expect(res.headers.get('x-pivota-sitemap-source')).toBe('seeds+dynamic');
  });

  it('excludes ext_* alias URLs from the products sitemap', async () => {
    // Critical regression guard for the runbook requirement.
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    getAllProductsMock.mockResolvedValueOnce([
      { product_id: 'ext_aliased_thing' },
      { product_id: 'sig_canonical_thing' },
    ]);
    const res = await GET();
    const xml = await readBody(res);
    expect(xml).not.toContain('/products/ext_');
    expect(xml).toContain('https://agent.pivota.cc/products/sig_canonical_thing');
  });

  it('falls back to seeds-only when dynamic fetch throws', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    getAllProductsMock.mockRejectedValueOnce(new Error('upstream 503'));
    const res = await GET();
    const xml = await readBody(res);
    expect(xml).toContain(SEED_URL);
    expect(res.headers.get('x-pivota-sitemap-source')).toBe('seeds');
  });

  it('escapes XML special characters in product IDs', async () => {
    // Extreme defensive case: the URL builder uses sig_* IDs which are
    // hex, but if a future seed ever had `&` or `<`, it must be escaped.
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    getAllProductsMock.mockResolvedValueOnce([
      { product_id: 'sig_with&special' },
    ]);
    const res = await GET();
    const xml = await readBody(res);
    expect(xml).toContain('sig_with&amp;special');
    expect(xml).not.toContain('sig_with&special</loc>');
  });

  it('merges canonical resolver sigs when PIVOTA_BACKEND_BASE_URL is set', async () => {
    // Phase C-2: merchant-onboarded SKUs that the audit lazy-mints into
    // sig_* canonical URLs must show up in the products sitemap so
    // Google can index them.
    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.PIVOTA_BACKEND_BASE_URL = 'https://canonical.example.com';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            { sig_id: 'sig_canonical_aaa', canonical_url: 'x', last_modified: null },
            { sig_id: 'sig_canonical_bbb', canonical_url: 'x', last_modified: null },
          ],
          total: 2,
          limit: 1000,
          offset: 0,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const res = await GET();
    const xml = await readBody(res);
    expect(xml).toContain('https://agent.pivota.cc/products/sig_canonical_aaa');
    expect(xml).toContain('https://agent.pivota.cc/products/sig_canonical_bbb');
    expect(res.headers.get('x-pivota-sitemap-source')).toBe('seeds+canonical');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://canonical.example.com/api/canonical/products');
  });

  it('reports url count via X-Pivota-Sitemap-Url-Count header', async () => {
    // Robust against seed-list growth: load the seeds module and assert
    // the count = (eligible seeds) + (distinct eligible dynamic products
    // that aren't already in the seed list).
    const { SITEMAP_SEED_PRODUCT_IDS, isProductIdSitemapEligible } =
      await import('../sitemap-seeds');
    const eligibleSeeds = SITEMAP_SEED_PRODUCT_IDS.filter(isProductIdSitemapEligible);

    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    getAllProductsMock.mockResolvedValueOnce([
      { product_id: SEED_ID }, // already in seeds → de-duped
      { product_id: 'sig_dynamic_a' },
      { product_id: 'sig_dynamic_b' },
    ]);
    const res = await GET();
    const expected = String(eligibleSeeds.length + 2);
    expect(res.headers.get('x-pivota-sitemap-url-count')).toBe(expected);
  });
});
