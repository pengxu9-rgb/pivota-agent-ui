import type { ProductResponse } from '@/lib/api';

export function buildCatalogProductKey(product: ProductResponse): string {
  const sellableGroupId = String(product?.sellable_item_group_id || '').trim();
  if (sellableGroupId) return `sellable_item_group::${sellableGroupId}`;
  return `${String(product?.merchant_id || '').trim()}::${String(product?.product_id || '').trim()}`;
}

export function mergeUniqueCatalogProducts(
  current: ProductResponse[],
  incoming: ProductResponse[],
) {
  const map = new Map<string, ProductResponse>();
  current.forEach((item) => map.set(buildCatalogProductKey(item), item));
  const before = map.size;
  incoming.forEach((item) => map.set(buildCatalogProductKey(item), item));
  return {
    merged: Array.from(map.values()),
    added: map.size - before,
  };
}
