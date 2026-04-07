const BROWSE_HISTORY_STORAGE_KEY = 'browse_history';
const BROWSE_HISTORY_MAX_ITEMS = 100;

export type LocalBrowseHistoryItem = {
  product_id: string;
  merchant_id?: string | null;
  title?: string | null;
  price?: number | null;
  image?: string | null;
  image_url?: string | null;
  description?: string | null;
  brand?: string | null;
  category?: string | null;
  product_type?: string | null;
  viewed_at?: string | null;
  timestamp?: number | null;
};

export type DiscoveryRecentViewLike = {
  merchant_id?: string | null;
  product_id: string;
  title?: string | null;
  description?: string | null;
  brand?: string | null;
  category?: string | null;
  product_type?: string | null;
  viewed_at?: string | null;
  history_source?: string | null;
};

function normalizeHistoryImageCandidate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/')) return trimmed;
  return null;
}

export function pickHistoryImage(product: any): string {
  const direct =
    normalizeHistoryImageCandidate(product?.image_url) ||
    normalizeHistoryImageCandidate(product?.imageUrl) ||
    normalizeHistoryImageCandidate(product?.image);
  if (direct) return direct;

  const images = Array.isArray(product?.images) ? product.images : [];
  for (const img of images) {
    if (typeof img === 'string') {
      const candidate = normalizeHistoryImageCandidate(img);
      if (candidate) return candidate;
      continue;
    }
    if (img && typeof img === 'object') {
      const candidate =
        normalizeHistoryImageCandidate((img as any).url) ||
        normalizeHistoryImageCandidate((img as any).image_url) ||
        normalizeHistoryImageCandidate((img as any).src);
      if (candidate) return candidate;
    }
  }
  return '/placeholder.svg';
}

export function upsertLocalBrowseHistory(item: LocalBrowseHistoryItem) {
  if (typeof window === 'undefined') return;
  const productId = String(item?.product_id || '').trim();
  if (!productId) return;

  try {
    const raw = window.localStorage.getItem(BROWSE_HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    const merchantId = String(item?.merchant_id || '').trim();
    const key = `${productId}::${merchantId}`;
    const deduped = list.filter((entry: any) => {
      const entryProductId = String(entry?.product_id || '').trim();
      const entryMerchantId = String(entry?.merchant_id || '').trim();
      return `${entryProductId}::${entryMerchantId}` !== key;
    });
    const next = [
      {
        ...item,
        product_id: productId,
        ...(merchantId ? { merchant_id: merchantId } : {}),
      },
      ...deduped,
    ].slice(0, BROWSE_HISTORY_MAX_ITEMS);
    window.localStorage.setItem(BROWSE_HISTORY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

function toEpochMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
    const asDate = Date.parse(value);
    if (Number.isFinite(asDate)) return asDate;
  }
  return null;
}

function normalizeRecentViewLike(
  input: any,
  fallbackSource: 'account' | 'local',
): (DiscoveryRecentViewLike & { __sort_ms: number }) | null {
  const productId = String(input?.product_id || input?.productId || '').trim();
  if (!productId) return null;

  const merchantId = String(input?.merchant_id || input?.merchantId || '').trim() || null;
  const viewedAtMs =
    toEpochMs(input?.viewed_at) ??
    toEpochMs(input?.viewedAt) ??
    toEpochMs(input?.timestamp) ??
    0;

  return {
    product_id: productId,
    ...(merchantId ? { merchant_id: merchantId } : {}),
    ...(input?.title ? { title: String(input.title).trim() } : {}),
    ...(input?.description ? { description: String(input.description).trim() } : {}),
    ...(input?.brand ? { brand: String(input.brand).trim() } : {}),
    ...(input?.category ? { category: String(input.category).trim() } : {}),
    ...(input?.product_type || input?.productType
      ? { product_type: String(input?.product_type || input?.productType).trim() }
      : {}),
    ...(viewedAtMs > 0 ? { viewed_at: new Date(viewedAtMs).toISOString() } : {}),
    history_source: String(input?.history_source || input?.historySource || fallbackSource).trim() || fallbackSource,
    __sort_ms: viewedAtMs,
  };
}

export function readLocalBrowseHistory(limit = 50): LocalBrowseHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(BROWSE_HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    return list
      .map((item) => {
        const normalized = normalizeRecentViewLike(item, 'local');
        if (!normalized) return null;
        return {
          product_id: normalized.product_id,
          merchant_id: normalized.merchant_id || null,
          title: normalized.title || null,
          description: normalized.description || null,
          brand: normalized.brand || null,
          category: normalized.category || null,
          product_type: normalized.product_type || null,
          viewed_at: normalized.viewed_at || null,
          timestamp: normalized.__sort_ms || null,
          image:
            normalizeHistoryImageCandidate(item?.image) ||
            normalizeHistoryImageCandidate(item?.image_url) ||
            '/placeholder.svg',
          image_url:
            normalizeHistoryImageCandidate(item?.image_url) ||
            normalizeHistoryImageCandidate(item?.image) ||
            '/placeholder.svg',
          price: Number.isFinite(Number(item?.price)) ? Number(item.price) : null,
        } satisfies LocalBrowseHistoryItem;
      })
      .filter(Boolean)
      .sort((a, b) => Number(b?.timestamp || 0) - Number(a?.timestamp || 0))
      .slice(0, Math.max(1, Math.min(Number(limit) || 50, BROWSE_HISTORY_MAX_ITEMS))) as LocalBrowseHistoryItem[];
  } catch {
    return [];
  }
}

export function mergeDiscoveryRecentViews(args: {
  accountItems?: unknown[];
  localItems?: LocalBrowseHistoryItem[];
  limit?: number;
}): DiscoveryRecentViewLike[] {
  const merged = [
    ...(Array.isArray(args.accountItems) ? args.accountItems : []).map((item) =>
      normalizeRecentViewLike(item, 'account'),
    ),
    ...(Array.isArray(args.localItems) ? args.localItems : []).map((item) =>
      normalizeRecentViewLike(item, 'local'),
    ),
  ]
    .filter(Boolean)
    .sort((a, b) => Number(b?.__sort_ms || 0) - Number(a?.__sort_ms || 0));

  const deduped: DiscoveryRecentViewLike[] = [];
  const seen = new Set<string>();
  const maxItems = Math.max(1, Math.min(Number(args.limit) || 50, BROWSE_HISTORY_MAX_ITEMS));

  for (const item of merged) {
    const key = `${String(item?.product_id || '').trim()}::${String(item?.merchant_id || '').trim()}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push({
      product_id: String(item?.product_id || '').trim(),
      ...(item?.merchant_id ? { merchant_id: String(item.merchant_id).trim() } : {}),
      ...(item?.title ? { title: String(item.title).trim() } : {}),
      ...(item?.description ? { description: String(item.description).trim() } : {}),
      ...(item?.brand ? { brand: String(item.brand).trim() } : {}),
      ...(item?.category ? { category: String(item.category).trim() } : {}),
      ...(item?.product_type ? { product_type: String(item.product_type).trim() } : {}),
      ...(item?.viewed_at ? { viewed_at: String(item.viewed_at) } : {}),
      ...(item?.history_source ? { history_source: String(item.history_source).trim() } : {}),
    });
    if (deduped.length >= maxItems) break;
  }

  return deduped;
}
