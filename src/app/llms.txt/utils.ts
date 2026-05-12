/**
 * Helpers for /llms.txt. Lives in a separate module from route.ts
 * because Next.js App Router rejects non-route exports (GET/POST/etc.)
 * from a route handler file. Importing utilities from this file is the
 * canonical way to expose helpers for tests.
 */

import { getAllProducts } from '@/lib/api';
import {
  SITEMAP_BASE_URL,
  SITEMAP_SEED_PRODUCT_IDS,
  isMerchantIndexable,
  isProductIdSitemapEligible,
} from '../sitemap-seeds';

export const SITE_NAME = 'Pivota';
export const SITE_DESCRIPTION =
  'AI-native shopping platform — canonical product pages aggregated across merchants, designed for LLM agents to ground purchase recommendations against verified PDPs.';


export function _escapeMarkdown(text: string): string {
  // Conservative escape — strings we embed are titles + brand names +
  // short descriptions, never user-controlled HTML. Strip newlines
  // (would break list-item formatting), trim, cap length.
  return text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}


export interface IndexedProduct {
  product_id: string;
  title: string;
  brand: string;
  description: string;
}


export function _buildSeedSection(): IndexedProduct[] {
  // Hard-curated seeds — these always appear in llms.txt regardless
  // of API health. Mirror sitemap-seeds.ts so the two stay aligned.
  return SITEMAP_SEED_PRODUCT_IDS
    .filter(isProductIdSitemapEligible)
    .map((id) => ({
      product_id: id,
      // Static title fallbacks for the curated baseline. Used only
      // when the runtime API fetch fails — in normal operation
      // _enrichWithRuntimeProducts overwrites these with fresh names
      // from the backend.
      title:
        id === 'sig_8b17eff870a4cd631ea61c56f99b5f99'
          ? 'Multi-Peptide Lash and Brow Serum'
          : id === 'sig_bb9cdc5375aad0da780364a3a5df0b3f'
          ? 'Café Rose and Ombré Leather Duo Mini Set'
          : id === 'sig_811f3a4d781db76ad4a60768b1691b29'
          ? 'Mineral Unseen Sunscreen SPF 40'
          : id === 'sig_5241fe1b9ccca9f57cbffb4408395a3d'
          ? 'barrier restore cream'
          : id === 'sig_951fdc3a391d7878556e2ad3e7e58320'
          ? 'Poreless Clarifying Charcoal Mask Pink'
          : id === 'sig_a4dde0770eb3b4757016e2a10b8fe978'
          ? 'Revive Under Eye Patch: Ginseng + Retinal'
          : '',
      brand: '',
      description: '',
    }));
}


export async function _enrichWithRuntimeProducts(
  seeds: IndexedProduct[],
): Promise<IndexedProduct[]> {
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').trim();
  const canFetchProducts = /^https?:\/\//.test(apiBase);
  if (!canFetchProducts) return seeds;

  try {
    const products = await getAllProducts(50);
    const byId = new Map<string, IndexedProduct>();
    for (const p of products) {
      if (!isProductIdSitemapEligible(p.product_id)) continue;
      // Same indexability filter as sitemap.ts — test merchants
      // shouldn't appear in any LLM-facing surface.
      if (!isMerchantIndexable(p.merchant_id)) continue;
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

    const enrichedSeeds = seeds.map((s) => byId.get(s.product_id) || s);
    const seedIds = new Set(seeds.map((s) => s.product_id));
    const extras: IndexedProduct[] = [];
    for (const [id, p] of byId.entries()) {
      if (seedIds.has(id)) continue;
      extras.push(p);
      if (extras.length >= 14) break;
    }
    return [...enrichedSeeds, ...extras];
  } catch (error) {
    console.error(
      'Failed to enrich llms.txt with runtime products, falling back to seeds:',
      error,
    );
    return seeds;
  }
}


export function _renderProductLine(p: IndexedProduct): string {
  const url = `${SITEMAP_BASE_URL}/products/${p.product_id}`;
  const name = p.title || p.product_id;
  const trail: string[] = [];
  if (p.brand) trail.push(p.brand);
  if (p.description) trail.push(p.description);
  const trailing = trail.length ? `: ${trail.join(' — ')}` : '';
  return `- [${name}](${url})${trailing}`;
}


export function _renderMarkdown(products: IndexedProduct[]): string {
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
