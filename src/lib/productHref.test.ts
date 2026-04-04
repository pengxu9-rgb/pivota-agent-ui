import { describe, expect, it } from 'vitest';

import {
  buildProductHref,
  normalizeProductRouteMerchantId,
  shouldPersistProductRouteMerchantId,
} from './productHref';

describe('productHref helpers', () => {
  it('omits external_seed merchant scope from product routes', () => {
    expect(normalizeProductRouteMerchantId('external_seed')).toBeUndefined();
    expect(normalizeProductRouteMerchantId('EXTERNAL_SEED')).toBeUndefined();
    expect(shouldPersistProductRouteMerchantId('external_seed')).toBe(false);
    expect(buildProductHref('ext_123', 'external_seed')).toBe('/products/ext_123');
  });

  it('keeps non-external merchant scope intact', () => {
    expect(normalizeProductRouteMerchantId('merchant_1')).toBe('merchant_1');
    expect(shouldPersistProductRouteMerchantId('merchant_1')).toBe(true);
    expect(buildProductHref('prod_1', 'merchant_1')).toBe('/products/prod_1?merchant_id=merchant_1');
  });
});
