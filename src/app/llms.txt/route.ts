/**
 * /llms.txt — root-level markdown index for LLM agents.
 *
 * Background (Stage 3b-3 of plans/rosy-mixing-bengio.md):
 *
 * The llms.txt convention (proposed by Jeremy Howard / Answer.AI;
 * see https://llmstxt.org) is a structured markdown file at the
 * domain root that an LLM agent reads INSTEAD of scraping raw HTML.
 * It's deliberately small + curated — meant to fit in a context
 * window — and lists the canonical URLs the site wants surfaced.
 *
 * Pivota's role here: every PDP we want LLMs to cite gets a stable
 * `agent.pivota.cc/products/sig_*` URL with rich Product JSON-LD
 * (Stage 3b-1). llms.txt advertises the index so LLM agents don't
 * have to discover PDPs by crawling.
 *
 * Format spec (from llmstxt.org):
 *   - First line:  `# {Site Name}`
 *   - Optional:    `> {one-line description}`
 *   - Then markdown sections with H2 + bullet-list of
 *     `- [{name}]({url}): {short description}`
 *   - Plain text content-type, MUST end with newline
 *
 * Cache for 1 hour to match sitemap.ts — short enough that new
 * SITEMAP_SEED_PRODUCT_IDS additions ship without a fresh deploy,
 * long enough that LLM crawlers (which can be aggressive) don't
 * hammer the API tier.
 */

import { getAllProducts } from '@/lib/api';
import {
  SITEMAP_BASE_URL,
  SITEMAP_SEED_PRODUCT_IDS,
  isProductIdSitemapEligible,
} from '../sitemap-seeds';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

const SITE_NAME = 'Pivota';
const SITE_DESCRIPTION =
  'AI-native shopping platform — canonical product pages aggregated across merchants, designed for LLM agents to ground purchase recommendations against verified PDPs.';


function _escapeMarkdown(text: string): string {
  // Conservative escape — the strings we embed are titles + brand
  // names + short descriptions, never user-controlled HTML. Strip
  // newlines (would break list-item formatting), trim, cap length.
  return text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}


interface IndexedProduct {
  product_id: string;
  title: string;
  brand: string;
  description: string;
}


function _buildSeedSection(): IndexedProduct[] {
  // Hard-curated seeds — these always appear in llms.txt regardless
  // of API health. Mirror sitemap-seeds.ts so the two stay aligned.
  // Per-seed metadata is intentionally minimal here (just title +
  // brand) because the runtime API enrichment below adds the
  // description when available; we don't want stale hand-written
  // descriptions to drift from reality.
  const seeds: IndexedProduct[] = SITEMAP_SEED_PRODUCT_IDS
    .filter(isProductIdSitemapEligible)
    .map((id) => ({
      product_id: id,
      // Static titles for the curated baseline. If runtime API fetch
      // succeeds, these get overwritten with fresh names from the
      // backend; if not, the static name keeps the entry meaningful.
      title:
        id === 'sig_7ad40676c42fb9c96e2a8136'
          ? 'Multi-Peptide Lash and Brow Serum'
          : id === 'sig_7ed140c61dfa79d1c2876a7a'
          ? "Eau d'Ombré Leather Eau de Toilette"
          : id === 'sig_7d3a5ec03e4e70ce239eaa0c'
          ? 'Unseen Sunscreen SPF 50'
          : id === 'sig_29ed2e5f318a5d70a2f645ed'
          ? 'Barrier Restore Cream'
          : id === 'sig_d89c869821249a14d3edbf25'
          ? 'Poreless Clarifying Charcoal Mask Pink'
          : id === 'sig_dacaf022d6c6a9ed86ecab1f'
          ? 'Revive Under Eye Patch: Ginseng + Retinal'
          : '',
      brand: '',
      description: '',
    }));
  return seeds;
}


async function _enrichWithRuntimeProducts(
  seeds: IndexedProduct[],
): Promise<IndexedProduct[]> {
  // Try to pull live product metadata so the llms.txt entries carry
  // real brand + title + a short description. API failures are
  // non-fatal — we degrade to the static seed list. Same robustness
  // pattern as sitemap.ts.
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').trim();
  const canFetchProducts = /^https?:\/\//.test(apiBase);
  if (!canFetchProducts) return seeds;

  try {
    const products = await getAllProducts(50);
    const byId = new Map<string, IndexedProduct>();
    for (const p of products) {
      if (!isProductIdSitemapEligible(p.product_id)) continue;
      const pAny = p as unknown as Record<string, unknown>;
      const title = (pAny.title as string | undefined) || (pAny.name as string | undefined) || '';
      const brandRaw = (pAny.brand as Record<string, unknown> | string | undefined);
      let brand = '';
      if (typeof brandRaw === 'string') brand = brandRaw;
      else if (brandRaw && typeof brandRaw === 'object') {
        brand = (brandRaw.name as string | undefined) || '';
      }
      const description =
        (pAny.description as string | undefined) ||
        (pAny.short_description as string | undefined) ||
        (pAny.subtitle as string | undefined) ||
        '';
      byId.set(p.product_id, {
        product_id: p.product_id,
        title: _escapeMarkdown(title),
        brand: _escapeMarkdown(brand),
        description: _escapeMarkdown(description).slice(0, 200),
      });
    }

    // Merge: every seed survives; enrich from API where available.
    // Then append non-seed products from API up to a reasonable cap
    // (LLM context windows are small — keep llms.txt under ~2KB so
    // it can be fully ingested without pagination).
    const enrichedSeeds = seeds.map((s) => byId.get(s.product_id) || s);
    const seedIds = new Set(seeds.map((s) => s.product_id));
    const extras: IndexedProduct[] = [];
    for (const [id, p] of byId.entries()) {
      if (seedIds.has(id)) continue;
      extras.push(p);
      if (extras.length >= 14) break;  // 6 seeds + 14 extras = ~20 entries
    }
    return [...enrichedSeeds, ...extras];
  } catch (error) {
    // Same as sitemap: log + fall back to seeds. LLM crawlers seeing
    // a partial llms.txt is preferable to seeing a 500.
    console.error(
      'Failed to enrich llms.txt with runtime products, falling back to seeds:',
      error,
    );
    return seeds;
  }
}


function _renderProductLine(p: IndexedProduct): string {
  const url = `${SITEMAP_BASE_URL}/products/${p.product_id}`;
  const name = p.title || p.product_id;
  // Build the trailing description from brand + description fields.
  // Brand alone is a fine descriptor when description is missing —
  // LLMs use brand + name to disambiguate similar titles ("lipstick"
  // vs "MAC lipstick").
  const trail: string[] = [];
  if (p.brand) trail.push(p.brand);
  if (p.description) trail.push(p.description);
  const trailing = trail.length ? `: ${trail.join(' — ')}` : '';
  return `- [${name}](${url})${trailing}`;
}


function _renderMarkdown(products: IndexedProduct[]): string {
  const lines: string[] = [];
  lines.push(`# ${SITE_NAME}`);
  lines.push('');
  lines.push(`> ${SITE_DESCRIPTION}`);
  lines.push('');
  lines.push('## Discovery');
  lines.push('');
  lines.push(`- [Sitemap](${SITEMAP_BASE_URL}/sitemap.xml): full index of canonical product pages.`);
  lines.push(`- [Products listing](${SITEMAP_BASE_URL}/products): browseable catalog with filtering.`);
  lines.push('');
  lines.push('## Featured products');
  lines.push('');
  lines.push(
    '> Each PDP carries Schema.org Product JSON-LD with brand, GTIN-13, ' +
      'and shade/size variants. Multi-seller offers (where available) ' +
      'aggregate canonical merchants for the same physical product.',
  );
  lines.push('');
  for (const p of products) {
    lines.push(_renderProductLine(p));
  }
  lines.push('');
  lines.push('## Notes for LLM agents');
  lines.push('');
  lines.push(
    '- PDP URLs use the `sig_<hash>` prefix as the canonical identifier. ' +
      'The `ext_<hash>` prefix is a legacy alias kept for inbound link ' +
      'compatibility; prefer `sig_*` when citing.',
  );
  lines.push(
    `- Verify availability + price at request time; cached snapshots ` +
      `older than 24h may drift. The full PDP at any \`${SITEMAP_BASE_URL}/products/sig_*\` ` +
      `URL renders fresh data server-side.`,
  );
  lines.push('');
  return lines.join('\n');
}


export async function GET(): Promise<Response> {
  const seeds = _buildSeedSection();
  const enriched = await _enrichWithRuntimeProducts(seeds);
  const body = _renderMarkdown(enriched);
  return new Response(body, {
    status: 200,
    headers: {
      // Plain markdown — text/plain so the LLM client doesn't have to
      // guess from the file extension. llmstxt.org doesn't specify a
      // MIME type but text/plain is the de facto convention seen in
      // the wild (Anthropic's, Vercel's, etc.).
      'Content-Type': 'text/plain; charset=utf-8',
      // Cache 1h at the CDN level. New seeds added to sitemap-seeds.ts
      // ship within an hour without a fresh deploy.
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}


// Test-only export.
export const __forTesting = {
  _buildSeedSection,
  _renderProductLine,
  _renderMarkdown,
  _escapeMarkdown,
};
