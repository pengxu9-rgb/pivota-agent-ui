// Guard for the committed static sitemaps in public/.
//
// The sitemaps are generated files (scripts/generate_sitemaps.mjs, refreshed
// by .github/workflows/sitemaps.yml) served as static assets — the durable fix
// for GSC "Couldn't fetch". This test fails CI if they are deleted, truncated,
// or hand-mangled.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PUBLIC_DIR = path.resolve(__dirname, '../../public');

function readPublicXml(name: string): string {
  return readFileSync(path.join(PUBLIC_DIR, name), 'utf8');
}

function locs(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]);
}

describe('committed static sitemaps in public/', () => {
  it('sitemap.xml is a valid index pointing at the two child sitemaps', () => {
    const xml = readPublicXml('sitemap.xml');

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trimEnd()).toMatch(/<\/sitemapindex>$/);
    expect(locs(xml)).toEqual([
      'https://agent.pivota.cc/sitemap-static.xml',
      'https://agent.pivota.cc/sitemap-products.xml',
    ]);
  });

  it('sitemap-static.xml carries exactly the public static app URLs, no lastmod', () => {
    const xml = readPublicXml('sitemap-static.xml');

    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trimEnd()).toMatch(/<\/urlset>$/);
    expect(xml).not.toContain('<lastmod>');
    expect(locs(xml)).toEqual(['https://agent.pivota.cc', 'https://agent.pivota.cc/products']);
  });

  it('sitemap-products.xml is a plausibly-complete product urlset', () => {
    const xml = readPublicXml('sitemap-products.xml');
    const urls = locs(xml);

    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trimEnd()).toMatch(/<\/urlset>$/);
    // The #219/#223 lesson: a stub sitemap must never ship over the full set.
    expect(urls.length).toBeGreaterThanOrEqual(1000);
    // Google's per-file limit; shard before this trips (VIS-5).
    expect(urls.length).toBeLessThanOrEqual(50000);
    for (const url of urls) {
      expect(url).toMatch(/^https:\/\/agent\.pivota\.cc\/products\/(sig_|ck_)/);
    }
    expect(xml).not.toContain('/products/ext_');
  });
});
