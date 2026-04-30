import { describe, expect, it } from 'vitest';
import { buildProductVariants } from '@/features/pdp/utils/productVariants';
import type { ProductResponse } from '@/lib/api';

function buildProduct(args?: Partial<ProductResponse>): ProductResponse {
  return {
    product_id: 'prod_1',
    merchant_id: 'external_seed',
    title: 'Great Barrier Relief',
    description: 'Barrier serum',
    price: 28,
    currency: 'EUR',
    in_stock: true,
    ...(args || {}),
  };
}

describe('buildProductVariants', () => {
  it('uses option values when upstream variant titles are placeholders', () => {
    const product = buildProduct({
      variants: [
        {
          variant_id: 'v_std',
          title: 'Variant 1',
          options: [{ name: 'size', value: 'Standard - 45 mL' }],
          price: { current: { amount: 28, currency: 'EUR' } },
          availability: { in_stock: true, available_quantity: 9 },
        },
        {
          variant_id: 'v_jumbo',
          title: 'Variant 2',
          options: [{ name: 'size', value: 'Jumbo - 100 mL' }],
          price: { current: { amount: 40, currency: 'EUR' } },
          availability: { in_stock: true, available_quantity: 9 },
        },
      ],
    });

    expect(buildProductVariants(product)).toMatchObject([
      { variant_id: 'v_std', title: 'Standard - 45 mL' },
      { variant_id: 'v_jumbo', title: 'Jumbo - 100 mL' },
    ]);
  });

  it('marks default-only fallback variants as hidden from selector', () => {
    const [variant] = buildProductVariants(buildProduct());
    expect(variant.hidden_from_selector).toBe(true);
    expect(variant.source_quality_status).toBe('quarantined');
  });
});
