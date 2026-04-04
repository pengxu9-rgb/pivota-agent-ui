export function normalizeProductRouteMerchantId(merchantId?: string | null): string | undefined {
  const normalized = String(merchantId || '').trim();
  if (!normalized) return undefined;
  if (normalized.toLowerCase() === 'external_seed') return undefined;
  return normalized;
}

export function shouldPersistProductRouteMerchantId(merchantId?: string | null): boolean {
  return Boolean(normalizeProductRouteMerchantId(merchantId));
}

export function buildProductHref(productId: string, merchantId?: string | null): string {
  const normalizedProductId = String(productId || '').trim();
  const scopedMerchantId = normalizeProductRouteMerchantId(merchantId);
  const baseHref = `/products/${encodeURIComponent(normalizedProductId)}`;
  if (!scopedMerchantId) return baseHref;
  return `${baseHref}?merchant_id=${encodeURIComponent(scopedMerchantId)}`;
}
