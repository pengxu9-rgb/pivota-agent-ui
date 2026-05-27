import type { Product } from '@/features/pdp/types';

export const MOCK_ANCHOR_PRODUCTS: Product[] = [
  {
    product_id: 'serum',
    title: 'Glow Niacinamide Renew Serum',
    brand: { name: 'Beauty of Joseon' },
    category_path: ['beauty', 'skincare', 'treat', 'serum'],
    tags: ['niacinamide', 'serum', 'glow'],
    pdp_schema_profile: 'beauty_formula',
    category_kind: 'beauty',
    default_variant_id: 'serum-default',
    variants: [{ variant_id: 'serum-default', title: 'Default' }],
  },
  {
    product_id: 'lash',
    title: 'Heartleaf Repair Lash Serum',
    brand: { name: 'Hince' },
    category_path: ['beauty', 'eyes', 'treat', 'lash-serum'],
    tags: ['lash', 'heartleaf', 'repair'],
    pdp_schema_profile: 'beauty_formula',
    category_kind: 'beauty',
    default_variant_id: 'lash-default',
    variants: [{ variant_id: 'lash-default', title: 'Default' }],
  },
  {
    product_id: 'mask',
    title: 'Water Sleeping Mask EX',
    brand: { name: 'Laneige' },
    category_path: ['beauty', 'skincare', 'mask'],
    tags: ['sleeping mask', 'hydration', 'skin'],
    pdp_schema_profile: 'beauty_formula',
    category_kind: 'beauty',
    default_variant_id: 'mask-default',
    variants: [{ variant_id: 'mask-default', title: 'Default' }],
  },
];
