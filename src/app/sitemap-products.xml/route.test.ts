import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

describe('ProductEntity sitemap', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns only canonical ProductEntity PDP URLs with lastmod', async () => {
    vi.stubEnv(
      'PIVOTA_PRODUCT_ENTITY_INDEX_REGISTRY_URL',
      'https://portal.example.test/api/agent-center/product-entity-index/public',
    );
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        product_entity_sitemap_entries: Array.from({ length: 12 }, (_, index) => ({
          id:
            index === 0
              ? 'sig_7ad40676c42fb9c96e2a8136'
              : `sig_registryready${index}`,
          canonicalUrl:
            index === 0
              ? 'https://agent.pivota.cc/products/sig_7ad40676c42fb9c96e2a8136'
              : `https://agent.pivota.cc/products/sig_registryready${index}`,
          productName: `Registry Product ${index}`,
          updatedAt: '2026-05-04T18:00:39Z',
        })),
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET();
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/xml');
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain(
      '<loc>https://agent.pivota.cc/products/sig_7ad40676c42fb9c96e2a8136</loc>',
    );
    expect(xml.match(/https:\/\/agent\.pivota\.cc\/products\/sig_/g)?.length || 0).toBeGreaterThanOrEqual(10);
    expect(xml).not.toContain('https://agent.pivota.cc/products/sig_1bf9aa542630047f9b2f9f28');
    expect(xml).not.toContain('https://agent.pivota.cc/products/sig_65c65851414613cc2df011ff');
    expect(xml).not.toContain('/products/ext_');
    expect(xml).not.toContain('return=');
    expect(xml).not.toContain('<html');
    expect(xml).not.toContain('Pivota Shopping AI');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://portal.example.test/api/agent-center/product-entity-index/public?limit=5000&shape=sitemap',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });
});
