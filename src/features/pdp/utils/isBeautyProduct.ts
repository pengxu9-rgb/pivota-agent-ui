import type { Product } from '@/features/pdp/types';

const BEAUTY_WORD_KEYWORDS = [
  'beauty',
  'makeup',
  'cosmetic',
  'cosmetics',
  'skincare',
  'serum',
  'cleanser',
  'toner',
  'moisturizer',
  'moisturiser',
  'lotion',
  'sunscreen',
  'spf',
  'shampoo',
  'conditioner',
  'fragrance',
  'perfume',
  'lip',
  'lips',
  'lipstick',
  'foundation',
  'concealer',
  'blush',
  'mascara',
  'eyeshadow',
];

const BEAUTY_PHRASE_KEYWORDS = ['skin care'];

const NON_BEAUTY_GUARD_KEYWORDS = [
  // Pets
  'dog',
  'cat',
  'pet',
  'leash',
  'collar',
  'harness',
  'treat',
  'toy',
];

function normalizeText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hasPhrase(haystack: string, phrase: string): boolean {
  if (!haystack || !phrase) return false;
  const normalizedHaystack = ` ${normalizeText(haystack)} `;
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase) return false;
  return normalizedHaystack.includes(` ${normalizedPhrase} `);
}

export function isBeautyProduct(product: Product): boolean {
  const category = (product.category_path || []).join(' ').toLowerCase();
  const title = String(product.title || '').toLowerCase();
  const subtitle = String(product.subtitle || '').toLowerCase();
  const brand = product.brand?.name ? String(product.brand.name).toLowerCase() : '';
  const tags = Array.isArray(product.tags) ? product.tags.join(' ').toLowerCase() : '';
  const department = product.department ? String(product.department).toLowerCase() : '';
  const combined = `${category} ${title} ${subtitle} ${brand} ${tags} ${department}`;
  const contentOnly = `${title} ${subtitle} ${brand} ${tags}`;

  const normalizedCombined = normalizeText(combined);
  const tokens = new Set(normalizedCombined.split(' ').filter(Boolean));
  const normalizedContent = normalizeText(contentOnly);
  const contentTokens = new Set(normalizedContent.split(' ').filter(Boolean));

  // Conservative guard: if product strongly indicates a non-beauty domain, never use beauty PDP.
  if (NON_BEAUTY_GUARD_KEYWORDS.some((kw) => tokens.has(kw))) return false;

  const hasBeautyMeta =
    (product.beauty_meta &&
      (Array.isArray(product.beauty_meta.best_for) ||
        Array.isArray(product.beauty_meta.important_info) ||
        Array.isArray(product.beauty_meta.popular_looks))) ||
    (Array.isArray(product.variants) &&
      product.variants.some((v) => {
        const meta = (v as any)?.beauty_meta || {};
        return Boolean(meta.shade_hex || meta.finish || meta.coverage || meta.undertone);
      }));

  const categoryLooksBeauty = hasPhrase(category, 'beauty') || hasPhrase(category, 'cosmetics') || hasPhrase(category, 'makeup');
  const departmentLooksBeauty = hasPhrase(department, 'beauty') || hasPhrase(department, 'cosmetic');

  if (BEAUTY_PHRASE_KEYWORDS.some((kw) => hasPhrase(contentOnly, kw))) return true;
  const hasBeautyTokens = BEAUTY_WORD_KEYWORDS.some((kw) => contentTokens.has(kw));

  // Strict mode: require some corroborating evidence beyond a single noisy category assignment.
  if (hasBeautyTokens) return true;
  if (hasBeautyMeta && (categoryLooksBeauty || departmentLooksBeauty)) return true;
  return false;
}
