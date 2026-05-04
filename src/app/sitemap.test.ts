import { describe, expect, it } from 'vitest';
import { GET } from './sitemap.xml/route';

describe('sitemap', () => {
  it('returns a sitemap index that points at the ProductEntity sitemap', async () => {
    const response = await GET();
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/xml');
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<loc>https://agent.pivota.cc/sitemap-products.xml</loc>');
    expect(xml).not.toContain('https://agent.pivota.cc/products/ext_');
    expect(xml).not.toContain('<urlset');
  });
});
