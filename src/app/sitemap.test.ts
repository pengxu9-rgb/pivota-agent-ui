import { describe, expect, it } from 'vitest';
import sitemap from './sitemap';

const STATIC_URLS = [
  'https://agent.pivota.cc',
  'https://agent.pivota.cc/products',
  'https://agent.pivota.cc/order',
] as const;

describe('sitemap.ts — main static sitemap', () => {
  it('emits the static app URLs', async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toEqual(STATIC_URLS);
  });

  it('keeps product PDP URLs out of the main sitemap urlset', async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls.some((url) => /\/products\/sig_/.test(url))).toBe(false);
  });

  it('keeps crawler-friendly freshness hints for static routes', async () => {
    const entries = await sitemap();

    expect(entries.find((e) => e.url === 'https://agent.pivota.cc')?.changeFrequency).toBe('daily');
    expect(entries.find((e) => e.url === 'https://agent.pivota.cc/products')?.priority).toBe(0.9);
    expect(entries.find((e) => e.url === 'https://agent.pivota.cc/order')?.changeFrequency).toBe('monthly');
  });
});
