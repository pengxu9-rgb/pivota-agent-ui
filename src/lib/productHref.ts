const EXTERNAL_SEED_MERCHANT_ID = 'external_seed';

export function normalizeProductRouteMerchantId(value: unknown): string | undefined {
  const merchantId = String(value || '').trim();
  if (!merchantId) return undefined;
  return merchantId === EXTERNAL_SEED_MERCHANT_ID ? undefined : merchantId;
}

export function buildProductHref(productId: string, merchantId?: string | null): string {
  const normalizedProductId = String(productId || '').trim();
  const normalizedMerchantId = normalizeProductRouteMerchantId(merchantId);
  const baseHref = `/products/${encodeURIComponent(normalizedProductId)}`;
  return normalizedMerchantId
    ? `${baseHref}?merchant_id=${encodeURIComponent(normalizedMerchantId)}`
    : baseHref;
}
