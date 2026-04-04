import { describe, expect, it } from 'vitest';

import { buildProductHref, normalizeProductRouteMerchantId } from './productHref';

describe('productHref helpers', () => {
  it('drops external_seed merchant ids from canonical product URLs', () => {
    expect(normalizeProductRouteMerchantId('external_seed')).toBeUndefined();
    expect(buildProductHref('ext_123', 'external_seed')).toBe('/products/ext_123');
  });

  it('preserves scoped merchant ids for real merchants', () => {
    expect(normalizeProductRouteMerchantId('merchant_a')).toBe('merchant_a');
    expect(buildProductHref('prod_1', 'merchant_a')).toBe('/products/prod_1?merchant_id=merchant_a');
  });

  it('builds an unscoped product URL when no merchant is present', () => {
    expect(buildProductHref('prod 1', '')).toBe('/products/prod%201');
  });
});
