import { afterEach, describe, expect, it, vi } from 'vitest';
import sitemap from './sitemap';

describe('sitemap', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('includes canonical ProductEntity URLs with lastmod, not external seed aliases or return params', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    const canonicalUrl =
      'https://agent.pivota.cc/products/sig_7ad40676c42fb9c96e2a8136';

    expect(urls).toContain(canonicalUrl);
    expect(urls).toContain('https://agent.pivota.cc/products/indexability');
    expect(urls).not.toContain(
      'https://agent.pivota.cc/products/ext_d7c74bcb380cbc2bdd5d5d90',
    );
    expect(urls.some((url) => url.includes('return='))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    const canonicalEntry = entries.find((entry) => entry.url === canonicalUrl);
    expect(canonicalEntry?.lastModified).toBeInstanceOf(Date);
  });
});
