import { describe, expect, it } from 'vitest';
import {
  GET as getSitemapIndex,
  HEAD as headSitemapIndex,
} from './sitemap.xml/route';
import {
  GET as getStaticSitemap,
  HEAD as headStaticSitemap,
} from './sitemap-static.xml/route';
import { sitemapIndexEntries, staticSitemapEntries } from './sitemap-routes';

const STATIC_URLS = [
  'https://agent.pivota.cc',
  'https://agent.pivota.cc/products',
] as const;

function locs(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]);
}

describe('/sitemap.xml — sitemap index', () => {
  it('points crawlers to static and product sitemaps', async () => {
    const entries = sitemapIndexEntries(new Date('2026-05-25T00:00:00.000Z'));

    expect(entries.map((e) => e.loc)).toEqual([
      'https://agent.pivota.cc/sitemap-static.xml',
      'https://agent.pivota.cc/sitemap-products.xml',
    ]);
  });

  it('returns valid sitemap index XML', async () => {
    const res = await getSitemapIndex();
    const xml = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/xml/);
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=3600, s-maxage=3600, stale-while-revalidate=3600',
    );
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(locs(xml)).toEqual([
      'https://agent.pivota.cc/sitemap-static.xml',
      'https://agent.pivota.cc/sitemap-products.xml',
    ]);
  });

  it('answers HEAD probes without a body', async () => {
    const res = await headSitemapIndex();

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=3600, s-maxage=3600, stale-while-revalidate=3600',
    );
  });
});

describe('/sitemap-static.xml — static urlset', () => {
  it('emits only public static app URLs', () => {
    const entries = staticSitemapEntries(new Date('2026-05-25T00:00:00.000Z'));
    const urls = entries.map((e) => e.loc);

    expect(urls).toEqual(STATIC_URLS);
    expect(urls).not.toContain('https://agent.pivota.cc/order');
  });

  it('keeps product PDP URLs out of the static urlset', () => {
    const entries = staticSitemapEntries();
    const urls = entries.map((e) => e.loc);

    expect(urls.some((url) => /\/products\/sig_/.test(url))).toBe(false);
  });

  it('keeps crawler-friendly freshness hints for static routes', async () => {
    const entries = staticSitemapEntries();

    expect(entries.find((e) => e.loc === 'https://agent.pivota.cc')?.changefreq).toBe('daily');
    expect(entries.find((e) => e.loc === 'https://agent.pivota.cc/products')?.priority).toBe(0.9);
  });

  it('returns valid static sitemap XML', async () => {
    const res = await getStaticSitemap();
    const xml = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/xml/);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(locs(xml)).toEqual([...STATIC_URLS]);
  });

  it('answers HEAD probes without a body', async () => {
    const res = await headStaticSitemap();

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });
});
