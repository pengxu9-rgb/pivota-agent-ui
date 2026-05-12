const EXTERNAL_SEED_MERCHANT_ID = 'external_seed';

type ProductRouteLike = {
  product_id?: unknown;
  productId?: unknown;
  pivota_signature_id?: unknown;
  pivotaSignatureId?: unknown;
  product_group_id?: unknown;
  productGroupId?: unknown;
  sellable_item_group_id?: unknown;
  sellableItemGroupId?: unknown;
  merchant_id?: unknown;
  merchantId?: unknown;
  pivota_canonical_url?: unknown;
  pivotaCanonicalUrl?: unknown;
  canonical_url?: unknown;
  canonicalUrl?: unknown;
};

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
}

export function isProductGroupRouteId(productId: unknown): boolean {
  const normalizedProductId = String(productId || '').trim().toLowerCase();
  return normalizedProductId.startsWith('pg_') || normalizedProductId.startsWith('pg:');
}

export function isSelfFallbackProductGroupRouteId(productId: unknown): boolean {
  return String(productId || '').trim().toLowerCase().startsWith('pg:pid:');
}

export function isPublicProductGroupRouteId(productId: unknown): boolean {
  return isProductGroupRouteId(productId) && !isSelfFallbackProductGroupRouteId(productId);
}

export function isPivotaSignatureRouteId(productId: unknown): boolean {
  return String(productId || '').trim().toLowerCase().startsWith('sig_');
}

export function isCanonicalProductRouteId(productId: unknown): boolean {
  return isPivotaSignatureRouteId(productId) || isProductGroupRouteId(productId);
}

function readProductRouteIdFromUrl(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = raw.startsWith('/') ? new URL(raw, 'https://agent.pivota.cc') : new URL(raw);
    const parts = url.pathname.split('/').filter(Boolean);
    const productsIndex = parts.findIndex((part) => part === 'products');
    const routeId = productsIndex >= 0 ? decodeURIComponent(parts[productsIndex + 1] || '') : '';
    return isCanonicalProductRouteId(routeId) ? routeId : '';
  } catch {
    const match = raw.match(/\/products\/([^/?#]+)/);
    const routeId = match?.[1] ? decodeURIComponent(match[1]) : '';
    return isCanonicalProductRouteId(routeId) ? routeId : '';
  }
}

export function normalizeProductRouteMerchantId(
  value: unknown,
  productId?: unknown,
): string | undefined {
  if (isCanonicalProductRouteId(productId)) return undefined;
  const merchantId = String(value || '').trim();
  if (!merchantId) return undefined;
  return merchantId === EXTERNAL_SEED_MERCHANT_ID ? undefined : merchantId;
}

export function inferCanonicalPdpMerchantId(
  productId: unknown,
  merchantId?: unknown,
): string | undefined {
  const explicitMerchantId = String(merchantId || '').trim();
  if (explicitMerchantId) return explicitMerchantId;

  const normalizedProductId = String(productId || '').trim().toLowerCase();
  if (!normalizedProductId) return undefined;
  if (isProductGroupRouteId(normalizedProductId)) return undefined;
  if (normalizedProductId.startsWith('ext_') || normalizedProductId.startsWith('ext:')) {
    return EXTERNAL_SEED_MERCHANT_ID;
  }
  return undefined;
}

export function buildProductHref(productId: string, merchantId?: string | null): string {
  const normalizedProductId = String(productId || '').trim();
  const normalizedMerchantId = normalizeProductRouteMerchantId(merchantId, normalizedProductId);
  const baseHref = `/products/${encodeURIComponent(normalizedProductId)}`;
  return normalizedMerchantId
    ? `${baseHref}?merchant_id=${encodeURIComponent(normalizedMerchantId)}`
    : baseHref;
}

export function resolveProductRouteId(product: ProductRouteLike): string {
  const canonicalUrlId = readProductRouteIdFromUrl(
    firstNonEmptyString(
      product.pivota_canonical_url,
      product.pivotaCanonicalUrl,
      product.canonical_url,
      product.canonicalUrl,
    ),
  );
  if (canonicalUrlId) return canonicalUrlId;

  const signatureId = firstNonEmptyString(product.pivota_signature_id, product.pivotaSignatureId);
  if (isPivotaSignatureRouteId(signatureId)) return signatureId;

  const productGroupId = firstNonEmptyString(
    product.product_group_id,
    product.productGroupId,
    product.sellable_item_group_id,
    product.sellableItemGroupId,
  );
  if (isPublicProductGroupRouteId(productGroupId)) return productGroupId;

  return firstNonEmptyString(product.product_id, product.productId);
}

export function buildProductHrefForProduct(product: ProductRouteLike): string {
  const routeId = resolveProductRouteId(product);
  const productId = firstNonEmptyString(product.product_id, product.productId);
  const routeIsMerchantScopedProduct = routeId && routeId === productId && !isCanonicalProductRouteId(routeId);
  return buildProductHref(
    routeId || productId,
    routeIsMerchantScopedProduct ? firstNonEmptyString(product.merchant_id, product.merchantId) : undefined,
  );
}
