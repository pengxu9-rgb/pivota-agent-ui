import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAllProductsMock = vi.fn();

vi.mock('@/lib/api', () => ({
  getAllProducts: (...args: unknown[]) => getAllProductsMock(...args),
}));

import { GET } from './route';
import {
  _buildSeedSection,
  _escapeMarkdown,
  _renderMarkdown,
  _renderProductLine,
} from './utils';
import { SITEMAP_BASE_URL, SITEMAP_SEED_PRODUCT_IDS } from '../sitemap-seeds';


describe('llms.txt — markdown shape', () => {
  beforeEach(() => {
    getAllProductsMock.mockReset();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it('starts with H1 title + blockquote description per llmstxt.org spec', () => {
    const md = _renderMarkdown([]);
    const lines = md.split('\n');
    expect(lines[0]).toBe('# Pivota');
    // Allowed blank line before the blockquote
    expect(lines.find((l) => l.startsWith('> '))).toBeDefined();
  });

  it('ends with a trailing newline (spec requirement for unix-line tooling)', () => {
    const md = _renderMarkdown([]);
    expect(md.endsWith('\n')).toBe(true);
  });

  it('renders a product line as `- [name](url): brand — description`', () => {
    const out = _renderProductLine({
      product_id: 'sig_x',
      title: 'Plum Plump Serum',
      brand: 'Glow Recipe',
      description: 'Hydrating hyaluronic serum.',
    });
    expect(out).toBe(
      `- [Plum Plump Serum](${SITEMAP_BASE_URL}/products/sig_x): Glow Recipe — Hydrating hyaluronic serum.`,
    );
  });

  it('falls back to product_id when title is missing (defensive)', () => {
    const out = _renderProductLine({
      product_id: 'sig_x',
      title: '',
      brand: '',
      description: '',
    });
    expect(out).toBe(`- [sig_x](${SITEMAP_BASE_URL}/products/sig_x)`);
  });

  it('omits trailing colon section when brand + description both empty', () => {
    const out = _renderProductLine({
      product_id: 'sig_x',
      title: 'Title only',
      brand: '',
      description: '',
    });
    expect(out).toBe(`- [Title only](${SITEMAP_BASE_URL}/products/sig_x)`);
  });
});


describe('llms.txt — text safety', () => {
  it('strips newlines from titles so they don\'t break list-item formatting', () => {
    expect(_escapeMarkdown('Foo\nBar\rBaz')).toBe('Foo Bar Baz');
  });

  it('collapses internal whitespace runs', () => {
    expect(_escapeMarkdown('Foo    Bar')).toBe('Foo Bar');
  });

  it('returns empty string on empty input (defensive)', () => {
    expect(_escapeMarkdown('')).toBe('');
    expect(_escapeMarkdown('   ')).toBe('');
  });
});


describe('llms.txt — seed section', () => {
  it('includes all SITEMAP_SEED_PRODUCT_IDS as IndexedProduct entries', () => {
    const seeds = _buildSeedSection();
    expect(seeds.map((s) => s.product_id)).toEqual(
      SITEMAP_SEED_PRODUCT_IDS.slice(),
    );
  });

  it('attaches stable static titles to known seed IDs', () => {
    const seeds = _buildSeedSection();
    // Updated 2026-05-12 to the current prod sig (was sig_7ad40676…
    // which 404'd because it predated mig 071's sig schema change).
    const lashSeed = seeds.find((s) => s.product_id === 'sig_8b17eff870a4cd631ea61c56f99b5f99');
    expect(lashSeed?.title).toBe('Multi-Peptide Lash and Brow Serum');
  });
});


describe('llms.txt — GET endpoint', () => {
  beforeEach(() => {
    getAllProductsMock.mockReset();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it('returns text/plain with the llms.txt body', async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
    const body = await res.text();
    expect(body).toContain('# Pivota');
    expect(body).toContain('## Featured products');
  });

  it('caches via Cache-Control public max-age + s-maxage', async () => {
    const res = await GET();
    const cc = res.headers.get('cache-control') || '';
    expect(cc).toMatch(/public/);
    expect(cc).toMatch(/max-age=3600/);
    expect(cc).toMatch(/s-maxage=3600/);
  });

  it('falls back to seed list when API fetch fails', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    getAllProductsMock.mockRejectedValueOnce(new Error('upstream down'));
    const res = await GET();
    const body = await res.text();
    // Every seed product URL must appear even when API is down
    for (const id of SITEMAP_SEED_PRODUCT_IDS) {
      expect(body).toContain(`/products/${id}`);
    }
  });

  it('enriches with API products when fetch succeeds', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    getAllProductsMock.mockResolvedValueOnce([
      {
        product_id: 'sig_runtime_x',
        title: 'Runtime Discovered Product',
        brand: { name: 'New Brand' },
        description: 'Found at request time.',
      },
    ]);
    const res = await GET();
    const body = await res.text();
    expect(body).toContain('sig_runtime_x');
    expect(body).toContain('Runtime Discovered Product');
    expect(body).toContain('New Brand');
  });

  it('excludes ext_* alias URLs from the runtime enrichment list', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    getAllProductsMock.mockResolvedValueOnce([
      { product_id: 'ext_alias_x', title: 'Aliased', brand: 'X' },
      { product_id: 'sig_canonical_y', title: 'Canonical', brand: 'Y' },
    ]);
    const res = await GET();
    const body = await res.text();
    expect(body).not.toContain('/products/ext_alias_x');
    expect(body).toContain('/products/sig_canonical_y');
  });

  it('excludes test-merchant PDPs from the runtime enrichment list', async () => {
    // MOYU products would fail checkout if LLMs cited them. Filter
    // matches sitemap.ts — TEST_MERCHANT_IDS exclusion.
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    getAllProductsMock.mockResolvedValueOnce([
      { product_id: 'sig_moyu_test', merchant_id: 'merch_efbc46b4619cfbdf', title: 'MOYU Test', brand: 'MOYU' },
      { product_id: 'sig_ext_seed_real', merchant_id: 'external_seed', title: 'Real External', brand: 'TomFord' },
    ]);
    const res = await GET();
    const body = await res.text();
    expect(body).not.toContain('/products/sig_moyu_test');
    expect(body).toContain('/products/sig_ext_seed_real');
  });

  it('caps total products to keep llms.txt under context-window-friendly size', async () => {
    // Generate 100 fake products; expect llms.txt to truncate to ~20 entries.
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    const fakes = Array.from({ length: 100 }, (_, i) => ({
      product_id: `sig_fake_${i.toString().padStart(3, '0')}`,
      title: `Fake Product ${i}`,
      brand: 'TestBrand',
    }));
    getAllProductsMock.mockResolvedValueOnce(fakes);
    const res = await GET();
    const body = await res.text();
    // Total product-line entries should stay bounded — count `- [...](url)` lines
    const productLines = body.match(/^- \[.+\]\(.+\/products\//gm) || [];
    // 6 seeds + at most 14 extras = 20
    expect(productLines.length).toBeLessThanOrEqual(20);
  });

  it('points crawlers to the canonical sitemap', async () => {
    const res = await GET();
    const body = await res.text();
    expect(body).toContain(`${SITEMAP_BASE_URL}/sitemap.xml`);
  });

  it('includes the sig_/ext_ guidance for LLM agents', async () => {
    const res = await GET();
    const body = await res.text();
    expect(body).toMatch(/sig_/i);
    expect(body).toMatch(/ext_/i);
    expect(body).toMatch(/canonical/i);
  });
});
