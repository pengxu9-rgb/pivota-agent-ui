const EXTERNAL_SEED_MERCHANT_ID = 'external_seed';

export function normalizeProductRouteMerchantId(value: unknown): string | undefined {
  const merchantId = String(value || '').trim();
  if (!merchantId) return undefined;
  return merchantId === EXTERNAL_SEED_MERCHANT_ID ? undefined : merchantId;
}

export function isExternalSeedProductId(value: unknown): boolean {
  const normalizedProductId = String(value || '').trim().toLowerCase();
  if (!normalizedProductId) return false;
  return normalizedProductId.startsWith('ext_') || normalizedProductId.startsWith('ext:');
}

export function resolveProductRouteMerchantId(
  productId: unknown,
  merchantId?: unknown,
): string | undefined {
  if (isExternalSeedProductId(productId)) return undefined;
  return normalizeProductRouteMerchantId(merchantId);
}

export function inferCanonicalPdpMerchantId(
  productId: unknown,
  merchantId?: unknown,
): string | undefined {
  if (isExternalSeedProductId(productId)) {
    return EXTERNAL_SEED_MERCHANT_ID;
  }

  const explicitMerchantId = String(merchantId || '').trim();
  if (explicitMerchantId) return explicitMerchantId;
  return undefined;
}

export function buildProductHref(productId: string, merchantId?: string | null): string {
  const normalizedProductId = String(productId || '').trim();
  const normalizedMerchantId = resolveProductRouteMerchantId(normalizedProductId, merchantId);
  const baseHref = `/products/${encodeURIComponent(normalizedProductId)}`;
  return normalizedMerchantId
    ? `${baseHref}?merchant_id=${encodeURIComponent(normalizedMerchantId)}`
    : baseHref;
}
