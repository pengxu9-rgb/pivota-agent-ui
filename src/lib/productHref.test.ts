import { describe, expect, it } from 'vitest';

import {
  buildProductHref,
  inferCanonicalPdpMerchantId,
  isProductGroupRouteId,
  normalizeProductRouteMerchantId,
} from './productHref';

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

  it('keeps product group route ids unscoped', () => {
    expect(isProductGroupRouteId('pg_catalog_abc123')).toBe(true);
    expect(isProductGroupRouteId('pg:pid:prod_1')).toBe(true);
    expect(inferCanonicalPdpMerchantId('pg_catalog_abc123')).toBeUndefined();
    expect(buildProductHref('pg_catalog_abc123', 'external_seed')).toBe('/products/pg_catalog_abc123');
  });
});
