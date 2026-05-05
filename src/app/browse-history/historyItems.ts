export interface HistoryItem {
  product_id: string;
  merchant_id?: string;
  title: string;
  price: number;
  image: string;
  description?: string;
  timestamp: number;
}

function historyKey(item: Pick<HistoryItem, 'product_id' | 'merchant_id'>): string {
  return `${String(item.product_id || '').trim()}::${String(item.merchant_id || '').trim()}`;
}

function hasPositivePrice(item: Pick<HistoryItem, 'price'> | undefined): boolean {
  return Boolean(item && Number.isFinite(Number(item.price)) && Number(item.price) > 0);
}

export function mergeHistoryItems(remoteItems: HistoryItem[], localItems: HistoryItem[]): HistoryItem[] {
  const localByKey = new Map<string, HistoryItem>();
  for (const item of localItems) {
    const key = historyKey(item);
    if (!key || localByKey.has(key)) continue;
    localByKey.set(key, item);
  }

  const merged: HistoryItem[] = [];
  const seen = new Set<string>();

  for (const item of remoteItems) {
    const key = historyKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const localMatch = localByKey.get(key);
    const fallbackPrice = hasPositivePrice(localMatch) ? Number(localMatch?.price) : item.price;
    merged.push({
      ...item,
      price: hasPositivePrice(item) ? item.price : fallbackPrice,
    });
  }

  for (const item of localItems) {
    const key = historyKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return merged.sort((a, b) => b.timestamp - a.timestamp).slice(0, 100);
}
