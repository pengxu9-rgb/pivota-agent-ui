import { describe, expect, it } from 'vitest';

import {
  buildProductHref,
  buildProductHrefForProduct,
  inferCanonicalPdpMerchantId,
  isPivotaSignatureRouteId,
  isPublicProductGroupRouteId,
  isSelfFallbackProductGroupRouteId,
  isProductGroupRouteId,
  normalizeProductRouteMerchantId,
  resolveProductRouteId,
} from './productHref';

describe('productHref helpers', () => {
  it('drops external_seed merchant ids only when the product_id lets PDP infer the source', () => {
    // Canonical, ext_-prefixed, and internal prod_* ids let PDP resolve without the pseudo merchant query param.
    expect(normalizeProductRouteMerchantId('external_seed', 'sig_abc')).toBeUndefined();
    expect(normalizeProductRouteMerchantId('external_seed', 'ext_123')).toBeUndefined();
    expect(normalizeProductRouteMerchantId('external_seed', 'ext:abc')).toBeUndefined();
    expect(normalizeProductRouteMerchantId('external_seed', 'prod_123')).toBeUndefined();
    expect(normalizeProductRouteMerchantId('external_seed', 'prod:abc')).toBeUndefined();
    expect(buildProductHref('ext_123', 'external_seed')).toBe('/products/ext_123');
    expect(buildProductHref('prod_123', 'external_seed')).toBe('/products/prod_123');

    // Non-inferable ids (e.g. domain:hash external seeds) must keep the merchant_id
    // so PDP can resolve identity.
    expect(normalizeProductRouteMerchantId('external_seed', 'ulta:hash')).toBe('external_seed');
    expect(buildProductHref('ulta:hash', 'external_seed')).toBe(
      '/products/ulta%3Ahash?merchant_id=external_seed',
    );

    // No product_id context → preserve external_seed (route-level safety).
    expect(normalizeProductRouteMerchantId('external_seed')).toBe('external_seed');
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
    expect(isPublicProductGroupRouteId('pg_catalog_abc123')).toBe(true);
    expect(isSelfFallbackProductGroupRouteId('pg:pid:prod_1')).toBe(true);
    expect(isPublicProductGroupRouteId('pg:pid:prod_1')).toBe(false);
    expect(inferCanonicalPdpMerchantId('pg_catalog_abc123')).toBeUndefined();
    expect(buildProductHref('pg_catalog_abc123', 'external_seed')).toBe('/products/pg_catalog_abc123');
  });

  it('keeps pivota signature route ids unscoped', () => {
    expect(isPivotaSignatureRouteId('sig_abc123')).toBe(true);
    expect(buildProductHref('sig_abc123', 'merchant_a')).toBe('/products/sig_abc123');
  });

  it('prefers canonical URL and signature ids over raw merchant product ids', () => {
    expect(
      resolveProductRouteId({
        product_id: '10064558129449',
        merchant_id: 'merch_1',
        pivota_canonical_url: 'https://agent.pivota.cc/products/sig_from_url',
        pivota_signature_id: 'sig_from_product',
      }),
    ).toBe('sig_from_url');

    expect(
      buildProductHrefForProduct({
        product_id: '10064558129449',
        merchant_id: 'merch_1',
        pivota_signature_id: 'sig_from_product',
      }),
    ).toBe('/products/sig_from_product');
  });

  it('falls back to merchant-scoped numeric URLs only when no canonical id exists', () => {
    expect(
      buildProductHrefForProduct({
        product_id: '10064558129449',
        merchant_id: 'merch_1',
      }),
    ).toBe('/products/10064558129449?merchant_id=merch_1');
  });
});
