/**
 * Tiny in-memory merchant-name registry.
 *
 * The cart line schema persists `merchant_name` when add-to-cart callers
 * supply it (Browse, Chat, Catalog cards). PDP is frozen so its
 * add-to-cart path doesn't write merchant_name today — that means an
 * item added straight from PDP renders as `merchant_id` in the cart.
 *
 * This registry closes the gap without touching frozen files: any time a
 * product surfaces somewhere in the app (Browse feed render, Chat product
 * pill, Catalog card, editorial ProductCard, etc.) we record the
 * (merchant_id → merchant_name) pair. The cart drawer falls back to the
 * registry when a cart line lacks `merchant_name`.
 *
 * Persistence model:
 *  - Hot map in module-scope memory for the session.
 *  - Mirror to `sessionStorage` so a hard refresh doesn't lose entries
 *    that were just collected from a Browse pageview.
 *  - No expiry / TTL — merchant-name strings don't churn in practice and
 *    the dataset is tiny (one short string per merchant the user has
 *    encountered this session).
 *
 * Honesty contract: we only record names the backend emitted. We never
 * derive or synthesize a name. If a merchant has only ever been seen as
 * a bare `merchant_id`, the registry leaves it absent and the cart
 * continues to fall back to the id (the existing degraded path).
 */

const STORAGE_KEY = 'pivota-merchant-registry';

const memory = new Map<string, string>();
let hydrated = false;

function safeSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  const storage = safeSessionStorage();
  if (!storage) return;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      for (const [id, name] of Object.entries(parsed)) {
        if (typeof id === 'string' && typeof name === 'string') {
          const tid = id.trim();
          const tname = name.trim();
          if (tid && tname) memory.set(tid, tname);
        }
      }
    }
  } catch {
    // Corrupt storage entry — ignore and let new writes overwrite.
  }
}

function persist(): void {
  const storage = safeSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(memory)));
  } catch {
    // Quota exceeded etc. — drop silently; the in-memory map is the source
    // of truth for the current page.
  }
}

/**
 * Record one merchant. No-op for missing/blank inputs or when the name
 * equals the id (callers sometimes default to id when name is missing —
 * we don't want to memoize that fallback).
 */
export function recordMerchantName(
  merchantId: string | null | undefined,
  merchantName: string | null | undefined,
): void {
  hydrate();
  const id = String(merchantId || '').trim();
  const name = String(merchantName || '').trim();
  if (!id || !name) return;
  if (id === name) return;
  if (memory.get(id) === name) return;
  memory.set(id, name);
  persist();
}

/**
 * Bulk version — record many at once. Safe with arrays of products that
 * may not all carry merchant data.
 */
export function recordMerchantNamesFromProducts(
  products: Array<{ merchant_id?: string | null; merchant_name?: string | null } | null | undefined>,
): void {
  if (!Array.isArray(products) || products.length === 0) return;
  let changed = false;
  hydrate();
  for (const product of products) {
    if (!product) continue;
    const id = String(product.merchant_id || '').trim();
    const name = String(product.merchant_name || '').trim();
    if (!id || !name || id === name) continue;
    if (memory.get(id) === name) continue;
    memory.set(id, name);
    changed = true;
  }
  if (changed) persist();
}

/**
 * Lookup. Returns null when the id is unknown.
 */
export function lookupMerchantName(
  merchantId: string | null | undefined,
): string | null {
  hydrate();
  const id = String(merchantId || '').trim();
  if (!id) return null;
  const value = memory.get(id);
  return value || null;
}

/**
 * Test/debug-only — clears the registry. Not exported through any UI path.
 */
export function clearMerchantRegistry(): void {
  memory.clear();
  hydrated = true;
  const storage = safeSessionStorage();
  if (storage) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
