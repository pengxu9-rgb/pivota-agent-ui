import type { Product } from '@/features/pdp/types';

const BEAUTY_WORD_KEYWORDS = [
  'beauty',
  'makeup',
  'cosmetic',
  'cosmetics',
  'skincare',
  'lip',
  'lips',
  'lipstick',
  'foundation',
  'concealer',
  'blush',
  'mascara',
  'eyeshadow',
  'fragrance',
  'perfume',
];

const BEAUTY_PHRASE_KEYWORDS = ['skin care'];

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

  // Strict signal: beauty_meta is only populated for beauty PDP experiences.
  if (product.beauty_meta && Object.values(product.beauty_meta).some((v) => Array.isArray(v) && v.length > 0)) {
    return true;
  }

  const normalizedCombined = normalizeText(combined);
  const tokens = new Set(normalizedCombined.split(' ').filter(Boolean));

  if (BEAUTY_PHRASE_KEYWORDS.some((kw) => hasPhrase(combined, kw))) return true;
  return BEAUTY_WORD_KEYWORDS.some((kw) => tokens.has(kw));
}
