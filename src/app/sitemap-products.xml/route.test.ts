import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

async function readBody(res: Response): Promise<string> {
  return await res.text();
}

function canonicalProduct(id: string, updatedAt = '2026-05-01T12:00:00.000Z') {
  return { sig_id: id, updated_at: updatedAt };
}

function products(count: number, prefix = 'sig_mock_product') {
  return Array.from({ length: count }, (_, index) =>
    canonicalProduct(`${prefix}_${String(index).padStart(4, '0')}`),
  );
}

function sitemapLocs(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]);
}

describe('/sitemap-products.xml — serving-eligible product sitemap', () => {
  beforeEach(() => {
    vi.stubEnv('PIVOTA_BACKEND_BASE_URL', 'https://canonical.example.com');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('includes all mocked canonical products and response headers', async () => {
    const items = products(25);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ items, total: 25, limit: 1000, offset: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const res = await GET();
    const xml = await readBody(res);
    const locs = sitemapLocs(xml);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/xml/);
    expect(xml).toContain('<urlset');
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(locs).toHaveLength(25);
    expect(locs).toContain('https://agent.pivota.cc/products/sig_mock_product_0000');
    expect(locs).toContain('https://agent.pivota.cc/products/sig_mock_product_0024');
    expect(xml).toContain('<lastmod>2026-05-01T12:00:00.000Z</lastmod>');
    expect(xml).toContain('<changefreq>weekly</changefreq>');
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400');
    expect(res.headers.get('x-pivota-sitemap-source')).toBe('serving_eligible');
    expect(res.headers.get('x-pivota-sitemap-url-count')).toBe('25');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const fetchedUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(fetchedUrl.origin).toBe('https://canonical.example.com');
    expect(fetchedUrl.pathname).toBe('/api/canonical/products');
    expect(fetchedUrl.searchParams.get('limit')).toBe('1000');
    expect(fetchedUrl.searchParams.get('offset')).toBe('0');
  });

  it('paginates canonical products until the endpoint is exhausted', async () => {
    const firstPage = products(1000, 'sig_page_one');
    const secondPage = [canonicalProduct('sig_page_two_0000')];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const offset = new URL(String(input)).searchParams.get('offset');
      const items = offset === '0' ? firstPage : secondPage;
      return new Response(
        JSON.stringify({ items, total: 1001, limit: 1000, offset: Number(offset || 0) }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const res = await GET();
    const xml = await readBody(res);
    const locs = sitemapLocs(xml);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('offset')).toBe('0');
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get('offset')).toBe('1000');
    expect(locs).toHaveLength(1001);
    expect(locs).toContain('https://agent.pivota.cc/products/sig_page_one_0000');
    expect(locs).toContain('https://agent.pivota.cc/products/sig_page_two_0000');
    expect(res.headers.get('x-pivota-sitemap-url-count')).toBe('1001');
  });

  it('returns valid empty XML when the canonical endpoint has no products', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ items: [], total: 0, limit: 1000, offset: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const res = await GET();
    const xml = await readBody(res);

    expect(res.status).toBe(200);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).not.toContain('<url>');
    expect(res.headers.get('x-pivota-sitemap-source')).toBe('serving_eligible');
    expect(res.headers.get('x-pivota-sitemap-url-count')).toBe('0');
  });

  it('filters non-sig rows, explicit non-serving rows, and duplicate sigs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            canonicalProduct('sig_keep_me'),
            canonicalProduct('sig_keep_me'),
            { sig_id: 'ext_alias' },
            { sig_id: 'sig_blocked', serving_eligible: false },
            { sig_id: 'sig_also_blocked', is_indexable: 'false' },
          ],
          total: 5,
          limit: 1000,
          offset: 0,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const xml = await readBody(await GET());
    const locs = sitemapLocs(xml);

    expect(locs).toEqual(['https://agent.pivota.cc/products/sig_keep_me']);
    expect(xml).not.toContain('ext_alias');
    expect(xml).not.toContain('sig_blocked');
    expect(xml).not.toContain('sig_also_blocked');
  });
});
