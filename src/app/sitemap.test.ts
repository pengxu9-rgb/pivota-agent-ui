import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAllProductsMock = vi.fn();

vi.mock('@/lib/api', () => ({
  getAllProducts: (...args: unknown[]) => getAllProductsMock(...args),
}));

import sitemap from './sitemap';

const SEED_ID = 'sig_7ad40676c42fb9c96e2a8136';
const SEED_URL = `https://agent.pivota.cc/products/${SEED_ID}`;
const STATIC_URLS = new Set([
  'https://agent.pivota.cc',
  'https://agent.pivota.cc/products',
  'https://agent.pivota.cc/order',
]);

describe('sitemap.ts — main sitemap (seed product IDs always included)', () => {
  beforeEach(() => {
    getAllProductsMock.mockReset();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it('includes seed product URL when NEXT_PUBLIC_API_URL is unset', async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(SEED_URL);
    for (const u of STATIC_URLS) expect(urls).toContain(u);
    expect(getAllProductsMock).not.toHaveBeenCalled();
  });

  it('includes seed product URL when getAllProducts throws', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    getAllProductsMock.mockRejectedValueOnce(new Error('upstream down'));
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(SEED_URL);
  });

  it('merges seeds + dynamic products, de-duping on URL', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    getAllProductsMock.mockResolvedValueOnce([
      { product_id: SEED_ID },
      { product_id: 'sig_other_product_999' },
    ]);
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls.filter((u) => u === SEED_URL).length).toBe(1);
    expect(urls).toContain('https://agent.pivota.cc/products/sig_other_product_999');
  });

  it('excludes ext_* alias URLs from dynamic feed (canonical-only sitemap)', async () => {
    // Per pivota-pdp-indexing-discoverability runbook: ext_* aliases
    // must not appear in the products sitemap.
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    getAllProductsMock.mockResolvedValueOnce([
      { product_id: SEED_ID },
      { product_id: 'ext_aliased_product_abc' },
      { product_id: 'sig_canonical_xyz' },
    ]);
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls.some((u) => u.includes('/products/ext_'))).toBe(false);
    expect(urls).toContain('https://agent.pivota.cc/products/sig_canonical_xyz');
  });

  it('returns seeds + static pages only when api base is non-http', async () => {
    process.env.NEXT_PUBLIC_API_URL = '/api/gateway';
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(SEED_URL);
    expect(getAllProductsMock).not.toHaveBeenCalled();
  });

  it('seed product entry has crawler-friendly priority + frequency', async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    const entries = await sitemap();
    const seed = entries.find((e) => e.url === SEED_URL);
    expect(seed).toBeDefined();
    expect(seed!.priority).toBe(0.8);
    expect(seed!.changeFrequency).toBe('weekly');
  });

  // -------------------------------------------------------------------
  // Stage 3b-1: dedupe by product_group_id + real lastmod
  // -------------------------------------------------------------------

  it('dedupes by product_group_id — Tom Ford-style group produces 1 sitemap URL', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    getAllProductsMock.mockResolvedValueOnce([
      { product_id: 'sig_a', product_group_id: 'pg_tom_ford_foundation' },
      { product_id: 'sig_b', product_group_id: 'pg_tom_ford_foundation' },
      { product_id: 'sig_c', product_group_id: 'pg_tom_ford_foundation' },
      { product_id: 'sig_d', product_group_id: 'pg_other_product' },
    ]);
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    // Only the FIRST of the 3 grouped members survives — one canonical
    // URL per group, as Stage 2b-i intended.
    const tfUrls = urls.filter((u) =>
      u === 'https://agent.pivota.cc/products/sig_a' ||
      u === 'https://agent.pivota.cc/products/sig_b' ||
      u === 'https://agent.pivota.cc/products/sig_c',
    );
    expect(tfUrls).toHaveLength(1);
    expect(urls).toContain('https://agent.pivota.cc/products/sig_d');
  });

  it('uses product.updated_at as lastmod instead of build-time now()', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    const realDate = '2026-03-15T10:30:00.000Z';
    getAllProductsMock.mockResolvedValueOnce([
      { product_id: 'sig_with_date', updated_at: realDate },
    ]);
    const entries = await sitemap();
    const e = entries.find((x) => x.url === 'https://agent.pivota.cc/products/sig_with_date');
    expect(e).toBeDefined();
    expect((e!.lastModified as Date).toISOString()).toBe(realDate);
  });

  it('falls back to current time when updated_at is missing or malformed', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    getAllProductsMock.mockResolvedValueOnce([
      { product_id: 'sig_no_date' },
      { product_id: 'sig_bad_date', updated_at: 'not-a-date' },
    ]);
    const entries = await sitemap();
    for (const id of ['sig_no_date', 'sig_bad_date']) {
      const e = entries.find((x) => x.url === `https://agent.pivota.cc/products/${id}`);
      expect(e).toBeDefined();
      expect((e!.lastModified as Date).getTime()).toBeGreaterThan(0);
    }
  });
});
