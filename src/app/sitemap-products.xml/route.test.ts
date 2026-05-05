import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

describe('ProductEntity sitemap', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns only canonical ProductEntity PDP URLs with lastmod', async () => {
    const fetchMock = vi.fn();
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
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
