import type { Product } from '@/lib/pdp/types';

const BEAUTY_KEYWORDS = [
  'beauty',
  'makeup',
  'cosmetic',
  'skincare',
  'skin care',
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

export function isBeautyProduct(product: Product): boolean {
  const category = (product.category_path || []).join(' ').toLowerCase();
  const title = String(product.title || '').toLowerCase();
  const combined = `${category} ${title}`;
  return BEAUTY_KEYWORDS.some((kw) => combined.includes(kw));
}

