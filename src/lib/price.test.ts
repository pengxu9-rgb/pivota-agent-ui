import { describe, expect, it } from 'vitest';

import {
  extractPositivePriceAmount,
  extractPositivePriceFromProductLike,
} from './price';

describe('price extraction', () => {
  it('extracts positive amounts from known money shapes', () => {
    expect(extractPositivePriceAmount({ current: { amount: 28, currency: 'USD' } })).toBe(28);
    expect(extractPositivePriceAmount({ price_amount: '1,299.50' })).toBe(1299.5);
    expect(extractPositivePriceAmount({ sale: { value: '19.99' } })).toBe(19.99);
    expect(extractPositivePriceAmount(0)).toBe(0);
  });

  it('prefers matched variant and offer prices before product fallback', () => {
    expect(
      extractPositivePriceFromProductLike(
        {
          product: {
            product_id: 'prod_1',
            price: { current: { amount: 100 } },
            variants: [
              { variant_id: 'sku_1', price: { current: { amount: 42 } } },
            ],
          },
          offers: [
            { merchant_id: 'merchant_1', product_id: 'prod_1', price: { amount: 35 } },
          ],
        },
        { productId: 'sku_1', merchantId: 'merchant_1' },
      ),
    ).toBe(42);
  });

  it('extracts prices from canonical PDP module payloads', () => {
    expect(
      extractPositivePriceFromProductLike({
        modules: [
          {
            type: 'canonical',
            data: {
              pdp_payload: {
                product: { product_id: 'ext_1' },
                offers: [
                  { merchant_id: 'external_seed', price: { current: { amount: 28 } } },
                ],
              },
            },
          },
        ],
      }),
    ).toBe(28);
  });
});
