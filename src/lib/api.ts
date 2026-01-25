// Centralized API helpers for calling the Pivota Agent Gateway and Accounts API
// All UI components should import functions from here instead of using fetch directly.

// Point to the public Agent Gateway by default; override via NEXT_PUBLIC_API_URL if needed.
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  '/api/gateway'; // default to same-origin proxy to avoid CORS

// Accounts API is proxied through same-origin routes so auth cookies remain first-party.
// This avoids third-party cookie issues (e.g. in-app browsers / iOS Safari) and reduces CORS risk.
const ACCOUNTS_API_BASE = '/api/accounts';
const ACCOUNTS_ROOT_API_BASE = '/api/accounts-root';

type ApiError = Error & { code?: string; status?: number; detail?: any };
type AmbiguousProductError = ApiError & {
  code: 'AMBIGUOUS_PRODUCT_ID';
  candidates: ProductResponse[];
};

function isAmbiguousProductError(err: unknown): err is AmbiguousProductError {
  return Boolean(
    err &&
      typeof err === 'object' &&
      (err as any).code === 'AMBIGUOUS_PRODUCT_ID' &&
      Array.isArray((err as any).candidates),
  );
}

function friendlyMessageForCode(args: {
  code?: string | null;
  operation?: string | null;
  details?: any;
}): string | null {
  const code = String(args.code || '').trim().toUpperCase();
  const op = String(args.operation || '').trim();
  const opSuffix = op ? ` (${op})` : '';

  if (!code) return null;

  if (code === 'TEMPORARY_UNAVAILABLE') {
    return `Service is temporarily busy${opSuffix}. Please retry in a few seconds.`;
  }
  if (code === 'UPSTREAM_TIMEOUT') {
    return `The request timed out${opSuffix}. Please retry.`;
  }
  if (code === 'QUOTE_EXPIRED') {
    return `Your quote expired${opSuffix}. Please retry to refresh totals.`;
  }
  if (code === 'QUOTE_MISMATCH') {
    return `Checkout details changed${opSuffix}. Please retry to refresh totals.`;
  }
  if (code === 'OUT_OF_STOCK') {
    return `Some items are out of stock${opSuffix}. Please update your cart and try again.`;
  }
  if (code === 'INSUFFICIENT_INVENTORY') {
    return `Some items don’t have enough stock${opSuffix}. Please adjust quantity and try again.`;
  }
  if (code === 'SHOPIFY_PRICING_UNAVAILABLE') {
    return `Unable to calculate totals${opSuffix}. Please verify your shipping address and try again.`;
  }

  return null;
}

// Merchant is provided via env or can be overridden at runtime (e.g., via query param / localStorage).
export function getMerchantId(overrideId?: string): string {
  if (overrideId) return overrideId;

  // Prefer runtime override stored in the browser (set via query param or user input)
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem('pivota_merchant_id');
    if (stored) return stored;
  }

  // Fallback to env
  const envId = process.env.NEXT_PUBLIC_MERCHANT_ID || '';
  if (envId) return envId;

  throw new Error(
    'Missing merchant configuration (NEXT_PUBLIC_MERCHANT_ID or runtime override)',
  );
}

export function setMerchantId(merchantId: string) {
  if (typeof window !== 'undefined' && merchantId) {
    window.localStorage.setItem('pivota_merchant_id', merchantId);
  }
}

// Product shape from real API
interface RealAPIProduct {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  image_url?: string;
  product_type?: string;
  inventory_quantity: number;
  sku?: string;
  variants?: any[];
  platform?: string;
}

// Normalized product used across the UI
export interface ProductResponse {
  product_id: string;
  merchant_id?: string;
  merchant_name?: string;
  external_redirect_url?: string;
  external_seed_id?: string;
  source?: string;
  disclosure_text?: string;
  platform?: string;
  platform_product_id?: string;
  // Some backends include a "primary" variant id / sku id at the product level.
  variant_id?: string;
  sku_id?: string;
  sku?: string;
  product_ref?: {
    platform?: string;
    platform_product_id?: string;
    variant_id?: string;
    sku_id?: string;
  };
  title: string;
  description: string;
  price: number;
  currency: string;
  image_url?: string;
  category?: string;
  in_stock: boolean;
  product_type?: string;
  tags?: string[];
  department?: string;
  brand?: string;
  images?: any[];
  media?: any[];
  variants?: any[];
  review_summary?: any;
  shipping?: any;
  returns?: any;
  raw_detail?: any;
  attributes?: any;
  options?: any[] | null;
  product_options?: any[] | null;
  seller_feedback_summary?: any;
}

export type ResolveProductCandidatesOffer = {
  offer_id: string;
  product_id?: string;
  merchant_id: string;
  merchant_name?: string;
  price?: { amount?: number; currency?: string } | number;
  shipping?: any;
  returns?: any;
  inventory?: any;
  fulfillment_type?: string;
  risk_tier?: string;
};

export type ResolveProductCandidatesResponse = {
  status?: string;
  product_group_id?: string;
  canonical_product_ref?: {
    merchant_id: string;
    product_id: string;
    platform?: string;
  } | null;
  offers_count?: number;
  offers?: ResolveProductCandidatesOffer[];
  default_offer_id?: string;
  best_price_offer_id?: string;
  cache?: {
    hit?: boolean;
    age_ms?: number;
    ttl_ms?: number;
  };
};

export type ResolveProductGroupMember = {
  merchant_id: string;
  merchant_name?: string;
  product_id: string;
  platform?: string;
  is_primary?: boolean;
};

export type ResolveProductGroupResponse = {
  status?: string;
  product_group_id?: string;
  canonical_product_ref?: {
    merchant_id: string;
    product_id: string;
    platform?: string;
  } | null;
  members?: ResolveProductGroupMember[];
};

export type GetPdpV2Module = {
  type: string;
  required?: boolean;
  data: any;
  reason?: string;
};

export type GetPdpV2Response = {
  status?: string;
  pdp_version?: string;
  request_id?: string;
  build_id?: string | null;
  generated_at?: string;
  subject?: {
    type?: string;
    id?: string;
    canonical_product_ref?: {
      merchant_id: string;
      product_id: string;
      platform?: string;
    } | null;
  };
  capabilities?: {
    client?: string | null;
    client_version?: string | null;
  };
  modules?: GetPdpV2Module[];
  warnings?: any[];
  missing?: Array<{ type: string; reason?: string }>;
};

function normalizeProduct(
  p: RealAPIProduct | ProductResponse,
): ProductResponse {
  const anyP = p as any;
  const rawPrice = anyP.price;
  let normalizedPrice = 0;

  if (typeof rawPrice === 'number') {
    normalizedPrice = rawPrice;
  } else if (typeof rawPrice === 'string') {
    normalizedPrice = Number(rawPrice) || 0;
  } else if (rawPrice && typeof rawPrice.amount === 'number') {
    normalizedPrice = rawPrice.amount;
  } else if (rawPrice && typeof rawPrice.amount === 'string') {
    normalizedPrice = Number(rawPrice.amount) || 0;
  }

  // Fallback: try variant price when main price is missing/zero
  if (
    normalizedPrice <= 0 &&
    Array.isArray(anyP.variants) &&
    anyP.variants.length > 0
  ) {
    const variantWithPrice = anyP.variants.find(
      (v: any) => typeof v?.price !== 'undefined',
    );
    const variantPrice = variantWithPrice?.price;
    if (typeof variantPrice === 'number') {
      normalizedPrice = variantPrice;
    } else if (typeof variantPrice === 'string') {
      normalizedPrice = Number(variantPrice) || normalizedPrice;
    }
  }

  const normalizedCurrency =
    anyP.currency ||
    rawPrice?.currency ||
    rawPrice?.currency_code ||
    'USD';

  let normalizedImage =
    anyP.image_url ||
    anyP.image ||
    (Array.isArray(anyP.images) ? anyP.images[0] : undefined) ||
    (Array.isArray(anyP.variants) ? anyP.variants[0]?.image_url : undefined);

  // Use image proxy for external images to avoid CORS issues
  if (normalizedImage && (normalizedImage.includes('amazon') || normalizedImage.includes('http'))) {
    normalizedImage = `/api/image-proxy?url=${encodeURIComponent(normalizedImage)}`;
  }

  const description =
    typeof anyP.description === 'string'
      ? anyP.description
      : anyP.description?.text || '';

  const images = Array.isArray(anyP.images)
    ? anyP.images
    : Array.isArray(anyP.image_urls)
      ? anyP.image_urls
      : undefined;

  const media = Array.isArray(anyP.media) ? anyP.media : undefined;
  const variants = Array.isArray(anyP.variants) ? anyP.variants : undefined;
  const reviewSummary =
    anyP.review_summary || anyP.reviews_summary || anyP.reviews?.summary;

  return {
    product_id: anyP.product_id || anyP.id,
    merchant_id:
      anyP.merchant_id ||
      anyP.merchant?.id ||
      anyP.merchant_uuid ||
      anyP.store_id,
    merchant_name: anyP.merchant_name || anyP.store_name,
    external_redirect_url:
      anyP.external_redirect_url ||
      anyP.redirect_url ||
      anyP.action?.redirect_url,
    external_seed_id: anyP.external_seed_id || anyP.seed_id,
    source: anyP.source,
    disclosure_text: anyP.disclosure_text,
    platform: anyP.platform,
    platform_product_id: anyP.platform_product_id || anyP.product_id || anyP.id,
    variant_id:
      anyP.variant_id ||
      anyP.variantId ||
      anyP.product_ref?.variant_id ||
      anyP.productRef?.variant_id ||
      undefined,
    sku_id:
      anyP.sku_id ||
      anyP.skuId ||
      anyP.product_ref?.sku_id ||
      anyP.productRef?.sku_id ||
      undefined,
    sku: anyP.sku || anyP.sku_id || anyP.skuId || undefined,
    product_ref: anyP.product_ref || anyP.productRef || undefined,
    title: anyP.title || anyP.name || 'Untitled product',
    description,
    price: normalizedPrice,
    currency: normalizedCurrency,
    image_url: normalizedImage,
    category: anyP.category || anyP.product_type || 'General',
    in_stock:
      typeof anyP.in_stock === 'boolean'
        ? anyP.in_stock
        : (anyP.inventory_quantity ||
            anyP.quantity ||
            anyP.stock ||
            0) > 0,
    product_type: anyP.product_type,
    tags: Array.isArray(anyP.tags) ? anyP.tags : undefined,
    department: anyP.department,
    brand: anyP.brand?.name || anyP.brand,
    images,
    media,
    variants,
    review_summary: reviewSummary,
    shipping: anyP.shipping,
    returns: anyP.returns,
    raw_detail: anyP,
    attributes: anyP.attributes,
    options: anyP.options ?? null,
    product_options: anyP.product_options ?? null,
    seller_feedback_summary: anyP.seller_feedback_summary,
  };
}

interface InvokeBody {
  operation: string;
  payload: any;
  metadata?: Record<string, any>;
}

const RECENT_QUERIES_STORAGE_KEY = 'pivota_recent_queries_v1';
const MAX_RECENT_QUERIES = 8;
const EVAL_META_STORAGE_KEY = 'pivota_eval_meta_v1';

type ShoppingScopeCatalog = 'global' | 'category' | 'promo_pool';
type ShoppingScope = {
  catalog: ShoppingScopeCatalog;
  region: string | null;
  language: string | null;
};

type ShoppingEvalMeta = {
  run_id?: string;
  variant?: 'A' | 'B' | string;
  suite_id?: string;
  convo_id?: string;
  turn_id?: number;
};

type ShoppingEntry =
  | 'home'
  | 'search'
  | 'plp'
  | 'pdp'
  | 'cart'
  | 'checkout'
  | 'order'
  | 'chat'
  | 'other';

const SHOPPING_ENTRY_VALUES: ReadonlySet<ShoppingEntry> = new Set([
  'home',
  'search',
  'plp',
  'pdp',
  'cart',
  'checkout',
  'order',
  'chat',
  'other',
]);

function getBrowserLanguage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const lang = String(window.navigator?.language || '').trim();
    return lang || null;
  } catch {
    return null;
  }
}

function inferRegionFromLanguage(language: string | null): string | null {
  if (!language) return null;
  // e.g. "en-US" => "US", "zh-CN" => "CN"
  const match = language.match(/-([A-Za-z]{2}|\d{3})$/);
  const region = match?.[1] ? String(match[1]).toUpperCase() : null;
  return region || null;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readEvalMetaFromSessionStorage(): ShoppingEvalMeta | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(EVAL_META_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return isPlainObject(parsed) ? (parsed as ShoppingEvalMeta) : null;
  } catch {
    return null;
  }
}

function writeEvalMetaToSessionStorage(meta: ShoppingEvalMeta) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(EVAL_META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // ignore storage errors
  }
}

function readEvalMetaFromUrl(): ShoppingEvalMeta | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(String(window.location?.search || ''));

    const run_id = String(params.get('eval_run_id') || '').trim() || undefined;
    const variant = String(params.get('eval_variant') || '').trim() || undefined;
    const suite_id = String(params.get('eval_suite_id') || '').trim() || undefined;
    const convo_id = String(params.get('eval_convo_id') || '').trim() || undefined;
    const turnRaw = String(params.get('eval_turn_id') || '').trim();
    const turn_id = turnRaw && Number.isFinite(Number(turnRaw)) ? Number(turnRaw) : undefined;

    if (!run_id && !variant && !suite_id && !convo_id && turn_id == null) return null;

    return { run_id, variant, suite_id, convo_id, turn_id };
  } catch {
    return null;
  }
}

function getEvalMetaBase(): ShoppingEvalMeta | null {
  if (typeof window === 'undefined') return null;
  const fromUrl = readEvalMetaFromUrl();
  if (fromUrl) {
    writeEvalMetaToSessionStorage(fromUrl);
    return fromUrl;
  }
  return readEvalMetaFromSessionStorage();
}

function getEvalVariant(): 'A' | 'B' | null {
  const meta = getEvalMetaBase();
  const raw = String(meta?.variant || '').trim().toUpperCase();
  if (raw === 'A') return 'A';
  if (raw === 'B') return 'B';
  return null;
}

function getDefaultShoppingScope(): ShoppingScope {
  const language = getBrowserLanguage();
  const region = inferRegionFromLanguage(language);
  return {
    catalog: 'global',
    region,
    language,
  };
}

function inferShoppingEntryFromLocation(body: InvokeBody): ShoppingEntry {
  if (typeof window === 'undefined') return 'other';

  const pathname = String(window.location?.pathname || '').trim() || '/';
  const params = new URLSearchParams(String(window.location?.search || ''));

  // Exact routes first.
  if (pathname === '/') return 'home';
  if (pathname === '/chat') return 'chat';
  if (pathname === '/cart') return 'cart';
  if (pathname.startsWith('/checkout')) return 'checkout';

  // Checkout flow in this app lives under /order.
  if (pathname === '/order' || pathname.startsWith('/order/')) {
    // /order/track is an order-related surface (not checkout form itself).
    if (pathname.startsWith('/order/track')) return 'order';
    return 'checkout';
  }

  // Orders surfaces.
  if (
    pathname === '/my-orders' ||
    pathname.startsWith('/orders') ||
    pathname.startsWith('/after-sale')
  ) {
    return 'order';
  }

  // PDP (detail) routes.
  if (pathname.startsWith('/products/')) return 'pdp';

  // Search / listing routes.
  if (pathname.startsWith('/search')) return 'search';
  if (
    pathname.startsWith('/category') ||
    pathname.startsWith('/collection') ||
    pathname.startsWith('/c/')
  ) {
    return 'plp';
  }

  // /products is used as both PLP and a search results page in this UI.
  if (pathname === '/products') {
    const urlQ = (params.get('q') || '').trim();
    const payloadQ = String((body as any)?.payload?.search?.query || '').trim();
    const hasSearchIntent = Boolean(urlQ || payloadQ);
    return hasSearchIntent ? 'search' : 'plp';
  }

  return 'other';
}

function readRecentQueries(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_QUERIES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean)
      .slice(0, MAX_RECENT_QUERIES);
  } catch {
    return [];
  }
}

function writeRecentQueries(queries: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      RECENT_QUERIES_STORAGE_KEY,
      JSON.stringify(queries.slice(0, MAX_RECENT_QUERIES)),
    );
  } catch {
    // ignore storage errors
  }
}

function rememberRecentQuery(query: string) {
  const q = String(query || '').trim();
  if (!q) return;
  const existing = readRecentQueries();
  const next = [q, ...existing.filter((x) => x !== q)].slice(
    0,
    MAX_RECENT_QUERIES,
  );
  writeRecentQueries(next);
}

function getCheckoutToken(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const params = new URLSearchParams(window.location.search);
    const token =
      params.get('checkout_token') ||
      params.get('checkoutToken') ||
      null;
    if (token) {
      window.sessionStorage.setItem('pivota_checkout_token', token);
      return token;
    }
  } catch {
    // ignore
  }

  try {
    return window.sessionStorage.getItem('pivota_checkout_token');
  } catch {
    return null;
  }
}

type GatewayCallOptions = {
  signal?: AbortSignal;
};

async function callGateway(body: InvokeBody, options: GatewayCallOptions = {}) {
  // If API_BASE is our same-origin proxy (/api/gateway), hit it directly; otherwise append the invoke path.
  const isProxy = API_BASE.startsWith('/api/gateway');
  const url = isProxy ? API_BASE : `${API_BASE}/agent/shop/v1/invoke`;
  const checkoutToken = getCheckoutToken();
  // Lock the "shopping agent retrieval contract" for reproducible evaluation.
  // Even if the backend doesn't use these fields yet, we always send them.
  const gatewaySource = process.env.NEXT_PUBLIC_GATEWAY_SOURCE || 'shopping_agent';
  const defaultScope = getDefaultShoppingScope();
  const requestMetadata = isPlainObject(body.metadata) ? body.metadata : {};
  const scopeOverride = isPlainObject(requestMetadata.scope) ? requestMetadata.scope : {};
  const inferredEntry = inferShoppingEntryFromLocation(body);
  const entryOverride =
    typeof requestMetadata.entry === 'string' &&
    SHOPPING_ENTRY_VALUES.has(requestMetadata.entry as ShoppingEntry)
      ? (requestMetadata.entry as ShoppingEntry)
      : null;
  const evalFromRuntime = getEvalMetaBase();
  const evalFromCaller = isPlainObject(requestMetadata.eval)
    ? (requestMetadata.eval as ShoppingEvalMeta)
    : null;
  const evalMerged =
    evalFromRuntime || evalFromCaller
      ? ({ ...(evalFromRuntime || {}), ...(evalFromCaller || {}) } as ShoppingEvalMeta)
      : null;

  const requestBody: InvokeBody = {
    ...body,
    metadata: {
      ...requestMetadata,
      // Merge scope but always ensure required keys exist.
      scope: {
        ...defaultScope,
        ...scopeOverride,
      },
      entry: entryOverride || inferredEntry,
      ...(evalMerged ? { eval: evalMerged } : {}),
      // Never allow callers to override the source in this UI.
      source: gatewaySource,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(checkoutToken ? { 'X-Checkout-Token': checkoutToken } : {}),
    },
    signal: options.signal,
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const topMessage = (errorData as any)?.message;
    const topError = (errorData as any)?.error;
    const gatewayError =
      (errorData as any)?.error ||
      (errorData as any)?.detail?.error ||
      (errorData as any)?.detail ||
      null;
    const details = gatewayError?.details || gatewayError?.detail || null;

    const codeCandidate =
      (typeof details?.error === 'string' && details.error) ||
      (typeof details?.code === 'string' && details.code) ||
      (typeof topError === 'string' && /^[A-Z0-9_]+$/.test(topError) ? topError : null) ||
      (typeof gatewayError?.message === 'string' &&
      /^[A-Z0-9_]+$/.test(gatewayError.message)
        ? gatewayError.message
        : null) ||
      (typeof gatewayError?.code === 'string' && gatewayError.code) ||
      (typeof gatewayError === 'string' && /^[A-Z0-9_]+$/.test(gatewayError) ? gatewayError : null) ||
      (typeof topMessage === 'string' && /^[A-Z0-9_]+$/.test(topMessage)
        ? topMessage
        : null) ||
      null;

    const operation =
      (errorData as any)?.operation ||
      (body as any)?.operation ||
      null;
    const friendlyTopError =
      typeof topError === 'string'
        ? topError === 'UPSTREAM_TIMEOUT'
          ? `Request timed out${operation ? ` (${operation})` : ''}. Please retry shortly.`
          : topError === 'TEMPORARY_UNAVAILABLE'
            ? `Temporary service issue${operation ? ` (${operation})` : ''}. Please retry shortly.`
            : operation
              ? `${topError} (${operation})`
              : topError
        : null;
    let messageCandidate =
      (typeof details?.message === 'string' && details.message) ||
      (typeof gatewayError?.details?.message === 'string' && gatewayError.details.message) ||
      (typeof gatewayError?.message === 'string' && gatewayError.message) ||
      (typeof topMessage === 'string' && topMessage) ||
      friendlyTopError ||
      `Gateway error: ${res.status} ${res.statusText}`;

    const err = new Error(messageCandidate) as ApiError;
    err.code = codeCandidate || undefined;
    err.status = res.status;
    err.detail = errorData;

    const friendly = friendlyMessageForCode({
      code: err.code,
      operation,
      details,
    });
    if (friendly) {
      err.message = friendly;
    }
    throw err;
  }

  return res.json();
}

async function callGatewayWithTimeout<T = any>(
  body: InvokeBody,
  timeoutMs?: number,
): Promise<T> {
  const ms = Number(timeoutMs);
  if (!Number.isFinite(ms) || ms <= 0) return (await callGateway(body)) as T;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return (await callGateway(body, { signal: controller.signal })) as T;
  } catch (err) {
    if ((err as any)?.name === 'AbortError') {
      const timeoutErr = new Error('The request timed out. Please retry.') as ApiError;
      timeoutErr.code = 'UPSTREAM_TIMEOUT';
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}


export type ProductReviewMedia = {
  id: number;
  type: string;
  url: string;
};

export type ProductReviewItem = {
  review_id: number;
  merchant_id: string;
  rating: number;
  verification?: string | null;
  title?: string | null;
  body?: string | null;
  snippet?: string | null;
  created_at?: string | null;
  media?: ProductReviewMedia[];
  is_featured?: boolean;
  merge?: any;
};

export type ReviewsListResponse = {
  items: ProductReviewItem[];
  next_cursor: string | null;
  limit: number;
};

export async function listSkuReviews(args: {
  sku: {
    merchant_id: string;
    platform: string;
    platform_product_id: string;
    variant_id?: string | null;
  };
  filters?: {
    featured_only?: boolean;
    has_media?: boolean;
    rating?: number | null;
    limit?: number;
    cursor?: string | null;
  };
}): Promise<ReviewsListResponse> {
  return (await callGateway({
    operation: 'list_sku_reviews',
    payload: args,
  })) as ReviewsListResponse;
}

export async function listGroupReviews(args: {
  group_id: number;
  filters?: {
    merchant_ids?: string[] | null;
    featured_only?: boolean;
    has_media?: boolean;
    limit?: number;
    cursor?: string | null;
  };
}): Promise<ReviewsListResponse> {
  return (await callGateway({
    operation: 'list_group_reviews',
    payload: args,
  })) as ReviewsListResponse;
}

// -------- Accounts API helpers --------

export type UgcCapabilityReason =
  | 'NOT_AUTHENTICATED'
  | 'NOT_PURCHASER'
  | 'ALREADY_REVIEWED'
  | 'RATE_LIMITED';

export type UgcCapabilities = {
  canUploadMedia: boolean;
  canWriteReview: boolean;
  canAskQuestion: boolean;
  reasons?: {
    upload?: UgcCapabilityReason;
    review?: UgcCapabilityReason;
    question?: UgcCapabilityReason;
  };
};

export type GetPdpV2PersonalizationResponse = {
  ugcCapabilities?: UgcCapabilities;
};

export type ReviewEligibilityResponse = {
  eligible: boolean;
  reason?: 'NOT_PURCHASER' | 'ALREADY_REVIEWED';
};

async function callAccountsBase(
  base: string,
  path: string,
  options: RequestInit & { skipJson?: boolean } = {},
) {
  const url = `${base}${path}`;
  const { skipJson, headers, method, body, ...rest } = options as any;
  const res = await fetch(url, {
    ...rest,
    method: method || 'GET',
    credentials: 'include', // rely on HttpOnly cookies
    headers: {
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
    body,
  });

  if (skipJson) {
    return res;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code =
      (data as any)?.detail?.error?.code ||
      (typeof (data as any)?.detail === 'string' ? (data as any).detail : undefined) ||
      (data as any)?.error?.code ||
      undefined;
    const message =
      (data as any)?.detail?.error?.message ||
      (typeof (data as any)?.detail === 'string' ? (data as any).detail : undefined) ||
      (data as any)?.error?.message ||
      res.statusText;
    const err = new Error(message) as ApiError;
    err.code = code;
    err.status = res.status;
    err.detail = data;
    throw err;
  }
  return data;
}

async function callAccounts(path: string, options: RequestInit & { skipJson?: boolean } = {}) {
  return callAccountsBase(ACCOUNTS_API_BASE, path, options);
}

async function callAccountsRoot(path: string, options: RequestInit & { skipJson?: boolean } = {}) {
  return callAccountsBase(ACCOUNTS_ROOT_API_BASE, path, options);
}

export async function getPdpV2Personalization(args: {
  productId: string;
  productGroupId?: string | null;
}): Promise<GetPdpV2PersonalizationResponse | null> {
  const productId = String(args.productId || '').trim();
  if (!productId) return null;

  const params = new URLSearchParams({ productId });
  const groupId = String(args.productGroupId || '').trim();
  if (groupId) params.set('productGroupId', groupId);

  try {
    return (await callAccounts(`/pdp/v2/personalization?${params.toString()}`, {
      cache: 'no-store',
    })) as GetPdpV2PersonalizationResponse;
  } catch (err: any) {
    if (err?.status === 401 || err?.code === 'NOT_AUTHENTICATED' || err?.code === 'UNAUTHENTICATED') {
      return { ugcCapabilities: undefined };
    }
    throw err;
  }
}

export async function getReviewEligibility(args: {
  productId: string;
  productGroupId?: string | null;
}): Promise<ReviewEligibilityResponse | null> {
  const productId = String(args.productId || '').trim();
  if (!productId) return null;

  const params = new URLSearchParams({ productId });
  const groupId = String(args.productGroupId || '').trim();
  if (groupId) params.set('productGroupId', groupId);

  try {
    return (await callAccounts(`/reviews/eligibility?${params.toString()}`, {
      cache: 'no-store',
    })) as ReviewEligibilityResponse;
  } catch (err: any) {
    if (err?.status === 401 || err?.code === 'NOT_AUTHENTICATED' || err?.code === 'UNAUTHENTICATED') {
      return null;
    }
    throw err;
  }
}

export async function createReviewFromUser(args: {
  productId: string;
  productGroupId?: string | null;
  subject: {
    merchant_id: string;
    platform: string;
    platform_product_id: string;
    variant_id?: string | null;
  };
  rating: number;
  title?: string | null;
  body?: string | null;
}): Promise<{ status?: string; review_id?: number; moderation_state?: string } | null> {
  const productId = String(args.productId || '').trim();
  if (!productId) return null;

  return (await callAccountsRoot('/buyer/reviews/v1/reviews/from_user', {
    method: 'POST',
    cache: 'no-store',
    body: JSON.stringify({
      product_id: productId,
      ...(args.productGroupId ? { product_group_id: String(args.productGroupId) } : {}),
      subject: {
        merchant_id: String(args.subject?.merchant_id || ''),
        platform: String(args.subject?.platform || ''),
        platform_product_id: String(args.subject?.platform_product_id || ''),
        variant_id: args.subject?.variant_id == null ? null : String(args.subject.variant_id),
      },
      rating: Number(args.rating),
      title: args.title == null ? null : String(args.title),
      body: args.body == null ? null : String(args.body),
    }),
  })) as any;
}

export async function postQuestion(args: {
  productId: string;
  productGroupId?: string | null;
  question: string;
}): Promise<{ status?: string; question_id?: number } | null> {
  const productId = String(args.productId || '').trim();
  if (!productId) return null;

  return (await callAccountsRoot('/questions', {
    method: 'POST',
    cache: 'no-store',
    body: JSON.stringify({
      productId,
      ...(args.productGroupId ? { productGroupId: String(args.productGroupId) } : {}),
      question: String(args.question || ''),
    }),
  })) as any;
}

// -------- Product search helpers --------

// Chat entrypoint: search products by free text query with graceful fallback
export async function sendMessage(
  message: string,
  merchantIdOverride?: string,
  options?: { metadata?: Record<string, any> },
): Promise<ProductResponse[]> {
  const query = message.trim();
  const recentQueries = getEvalVariant() === 'A' ? [] : readRecentQueries();

  const data = await callGateway({
    operation: 'find_products_multi',
    payload: {
      search: {
        // Cross-merchant search; backend will route across merchants
        in_stock_only: false, // allow showing results even if inventory is zero for demo
        query,
        limit: 10,
      },
      user: {
        // Provide lightweight context to stabilize intent/constraint extraction
        // across follow-up queries (aligned with creator-agent contract).
        recent_queries: recentQueries,
      },
    },
    ...(isPlainObject(options?.metadata) ? { metadata: options?.metadata } : {}),
  });

  let products = ((data as any).products || []).map(
    (p: RealAPIProduct | ProductResponse) => normalizeProduct(p),
  );

  // Fallback: if gateway search returns no products for a non-empty query,
  // run a broader local filter over the general catalog so common queries
  // like "tee" can still surface relevant items.
  if (!products.length && query) {
    try {
      const all = await getAllProducts(50);
      const term = query.toLowerCase();
      const fallback = all.filter((p) => {
        const title = (p.title || '').toLowerCase();
        const desc = (p.description || '').toLowerCase();
        const category = (p.category || '').toLowerCase();
        return (
          title.includes(term) ||
          desc.includes(term) ||
          category.includes(term)
        );
      });
      if (fallback.length) {
        products = fallback;
      } else if (all.length) {
        // As a last resort, if we still don't have any matches but the catalog
        // itself has products, return a generic set of recommendations instead
        // of an empty list so the user always sees something useful.
        products = all;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Fallback product search error:', err);
    }
  }

  // Update the local recent query list after using the previous context.
  rememberRecentQuery(query);

  return products;
}

// Generic product list (Hot Deals, history, etc.)
export async function getAllProducts(
  limit = 20,
  merchantIdOverride?: string,
): Promise<ProductResponse[]> {
  // If we have a merchant id, use single-merchant search; otherwise fallback to multi.
  let merchantId: string | undefined = merchantIdOverride;
  if (!merchantId) {
    try {
      merchantId = getMerchantId();
    } catch (e) {
      merchantId = undefined;
    }
  }

  const searchPayload = {
    search: {
      in_stock_only: false,
      query: '',
      limit,
      ...(merchantId ? { merchant_id: merchantId } : {}),
    },
  };

  const data = await callGateway({
    operation: merchantId ? 'find_products' : 'find_products_multi',
    payload: searchPayload as any,
  });

  const products = (data as any).products || [];
  return products.map((p: RealAPIProduct | ProductResponse) =>
    normalizeProduct(p),
  );
}

export async function resolveProductCandidates(args: {
  product_id: string;
  merchant_id?: string | null;
  country?: string | null;
  postal_code?: string | null;
  limit?: number;
  include_offers?: boolean;
  timeout_ms?: number;
  debug?: boolean;
  cache_bypass?: boolean;
}): Promise<ResolveProductCandidatesResponse | null> {
  const productId = String(args.product_id || '').trim();
  if (!productId) return null;

  const data = await callGatewayWithTimeout(
    {
      operation: 'resolve_product_candidates',
      payload: {
        product_ref: {
          product_id: productId,
          ...(args.merchant_id ? { merchant_id: args.merchant_id } : {}),
        },
        context: {
          ...(args.country ? { country: args.country } : {}),
          ...(args.postal_code ? { postal_code: args.postal_code } : {}),
        },
        options: {
          limit: Math.min(Math.max(1, Number(args.limit || 10) || 10), 50),
          include_offers: args.include_offers !== false,
          ...(args.debug ? { debug: true } : {}),
          ...(args.cache_bypass ? { cache_bypass: true } : {}),
        },
      },
    },
    args.timeout_ms,
  );

  return data as ResolveProductCandidatesResponse;
}

export async function resolveProductGroup(args: {
  product_id: string;
  merchant_id?: string | null;
  timeout_ms?: number;
  debug?: boolean;
  cache_bypass?: boolean;
}): Promise<ResolveProductGroupResponse | null> {
  const productId = String(args.product_id || '').trim();
  if (!productId) return null;

  const data = await callGatewayWithTimeout(
    {
      operation: 'resolve_product_group',
      payload: {
        product_ref: {
          product_id: productId,
          ...(args.merchant_id ? { merchant_id: args.merchant_id } : {}),
        },
        options: {
          ...(args.debug ? { debug: true } : {}),
          ...(args.cache_bypass ? { cache_bypass: true } : {}),
        },
      },
    },
    args.timeout_ms,
  );

  return data as ResolveProductGroupResponse;
}

export async function getPdpV2(args: {
  product_id: string;
  merchant_id?: string | null;
  include?: string[] | string | null;
  timeout_ms?: number;
  debug?: boolean;
  cache_bypass?: boolean;
}): Promise<GetPdpV2Response> {
  const productId = String(args.product_id || '').trim();
  if (!productId) {
    throw new Error('product_id is required');
  }

  const include =
    args.include == null
      ? ['offers', 'reviews_preview']
      : args.include;

  const data = await callGatewayWithTimeout(
    {
      operation: 'get_pdp_v2',
      payload: {
        product_ref: {
          product_id: productId,
          ...(args.merchant_id ? { merchant_id: args.merchant_id } : {}),
        },
        ...(include ? { include } : {}),
        options: {
          ...(args.debug ? { debug: true } : {}),
          ...(args.cache_bypass ? { cache_bypass: true } : {}),
        },
        capabilities: {
          client: 'shopping',
          client_version: process.env.NEXT_PUBLIC_APP_VERSION || null,
        },
      },
    },
    args.timeout_ms,
  );

  return data as GetPdpV2Response;
}

function _inferReviewSubjectFromProduct(product: ProductResponse): {
  merchant_id: string;
  platform: string;
  platform_product_id: string;
  variant_id: string | null;
} | null {
  const merchantId = String(product.merchant_id || '').trim();
  const platform = String(product.platform || product.product_ref?.platform || '').trim();
  const platformProductId = String(
    product.platform_product_id || product.product_ref?.platform_product_id || product.product_id || '',
  ).trim();

  if (!merchantId || !platform || !platformProductId) return null;

  // PDP-level summary: aggregate across variants by omitting variant_id.
  return {
    merchant_id: merchantId,
    platform,
    platform_product_id: platformProductId,
    variant_id: null,
  };
}

async function _attachReviewSummaryBestEffort(product: ProductResponse): Promise<ProductResponse> {
  if (!product || (product as any).review_summary) return product;
  const subject = _inferReviewSubjectFromProduct(product);
  if (!subject) return product;

  try {
    const data = await callGateway({
      operation: 'get_review_summary',
      payload: { sku: subject },
    });
    const summary = (data as any)?.review_summary;
    if (!summary || typeof summary !== 'object') return product;

    return {
      ...product,
      review_summary: summary,
      raw_detail: {
        ...(product as any).raw_detail,
        review_summary: summary,
      },
    };
  } catch {
    return product;
  }
}

// Single product detail
export async function getProductDetail(
  productId: string,
  merchantIdOverride?: string,
  options?: {
    allowBroadScan?: boolean;
    timeout_ms?: number;
    useConfiguredMerchantId?: boolean;
    throwOnError?: boolean;
    includeReviewSummary?: boolean;
  },
): Promise<ProductResponse | null> {
  const allowBroadScan = options?.allowBroadScan !== false;
  const timeoutMs = options?.timeout_ms;
  const useConfiguredMerchantId = options?.useConfiguredMerchantId !== false;
  const throwOnError = options?.throwOnError === true;
  const includeReviewSummary = options?.includeReviewSummary === true;

  // Try to resolve merchant_id, fallback to cross-merchant search if missing.
  let merchantId: string | undefined = merchantIdOverride;
  if (!merchantId && useConfiguredMerchantId) {
    try {
      merchantId = getMerchantId();
    } catch (e) {
      // ignore, will fallback
    }
  }

  try {
    if (merchantId) {
      const data = await callGatewayWithTimeout(
        {
          operation: 'get_product_detail',
          payload: {
            product: {
              merchant_id: merchantId,
              product_id: productId,
            },
          },
        },
        timeoutMs,
      );

      const product = (data as any).product;
      if (product) {
        const enriched = {
          ...product,
          ...(typeof (data as any).product_group_id === 'string'
            ? { product_group_id: (data as any).product_group_id }
            : {}),
          ...(Array.isArray((data as any).offers) ? { offers: (data as any).offers } : {}),
          ...((data as any).offers_count != null ? { offers_count: (data as any).offers_count } : {}),
          ...(typeof (data as any).default_offer_id === 'string'
            ? { default_offer_id: (data as any).default_offer_id }
            : {}),
          ...(typeof (data as any).best_price_offer_id === 'string'
            ? { best_price_offer_id: (data as any).best_price_offer_id }
            : {}),
        };
        const normalized = normalizeProduct(enriched) as ProductResponse;
        return includeReviewSummary
          ? await _attachReviewSummaryBestEffort(normalized)
          : normalized;
      }
    }
  } catch (err) {
    // In MOCK mode or when backend returns 404, gracefully fall back to list search
    console.error('getProductDetail primary error, falling back to list:', err);
    if (throwOnError) throw err;
  }

  try {
    // Fallback: cross-merchant search to locate the product and its merchant_id
    const searchAndFind = async (query: string, limit = 500) => {
      const data = await callGatewayWithTimeout(
        {
          operation: 'find_products_multi',
          payload: {
            search: {
              query,
              limit,
            },
          },
        },
        timeoutMs,
      );
      const products: ProductResponse[] = ((data as any).products || []).map(
        (p: RealAPIProduct | ProductResponse) => normalizeProduct(p) as ProductResponse,
      );
      const matches = products.filter((p: ProductResponse) => p.product_id === productId);
      const deduped = Array.from(
        new Map(matches.map((p) => [String(p.merchant_id || ''), p])).values(),
      ).filter((p) => p.merchant_id);

      if (deduped.length === 1) return { found: deduped[0], candidates: deduped };
      if (deduped.length > 1) return { found: null, candidates: deduped };
      return { found: null, candidates: [] };
    };

    let found: ProductResponse | null = null;
    let candidates: ProductResponse[] = [];

    // Prefer an ID-targeted search first.
    // This avoids slow "empty query" catalog scans when the upstream supports identifier search.
    const first = await searchAndFind(productId, 100);
    found = first.found;
    candidates = first.candidates;

    if (!found && candidates.length === 0 && allowBroadScan) {
      const broad = await searchAndFind('', 100);
      found = broad.found;
      candidates = broad.candidates;
    }

    if (!found && candidates.length > 1) {
      const err = new Error('Multiple sellers found for this product. Please choose a seller.') as AmbiguousProductError;
      err.code = 'AMBIGUOUS_PRODUCT_ID';
      err.candidates = candidates;
      throw err;
    }

    return found && includeReviewSummary
      ? await _attachReviewSummaryBestEffort(found)
      : found;
  } catch (err) {
    if (isAmbiguousProductError(err)) throw err;
    if (throwOnError) throw err;
    return null;
  }
}

// -------- Order & payment helpers --------

export async function createOrder(orderData: {
  merchant_id: string;
  customer_email: string;
  currency?: string;
  offer_id?: string;
  items: Array<{
    merchant_id: string;
    product_id: string;
    product_title: string;
    variant_id?: string;
    sku?: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
  shipping_address: {
    name: string;
    address_line1: string;
    address_line2?: string;
    city: string;
    state?: string;
    country: string;
    postal_code: string;
    phone?: string;
  };
  customer_notes?: string;
  preferred_psp?: string;
  quote_id?: string;
  discount_codes?: string[];
  selected_delivery_option?: any;
  metadata?: Record<string, any>;
}) {
  const data = await callGateway({
    operation: 'create_order',
    payload: {
      order: orderData,
    },
  });

  return data;
}

export async function previewQuote(quote: {
  merchant_id?: string;
  offer_id?: string;
  items: Array<{ product_id: string; variant_id: string; quantity: number }>;
  customer_email?: string;
  shipping_address?: any;
  discount_codes?: string[];
  selected_delivery_option?: any;
}) {
  const data = await callGateway({
    operation: 'preview_quote',
    payload: {
      quote,
    },
  });
  return data;
}

export async function processPayment(paymentData: {
  order_id: string;
  total_amount: number;
  currency: string;
  payment_method: {
    type: string;
  };
  return_url?: string;
}) {
  const data = await callGateway({
    operation: 'submit_payment',
    payload: {
      payment: {
        order_id: paymentData.order_id,
        expected_amount: paymentData.total_amount,
        currency: paymentData.currency,
        payment_method_hint: paymentData.payment_method.type,
        ...(paymentData.return_url && { return_url: paymentData.return_url }),
      },
    },
  });

  return data;
}

export async function confirmOrderPayment(orderId: string) {
  const data = await callGateway({
    operation: 'confirm_payment',
    payload: {
      order: {
        order_id: orderId,
      },
    },
  });

  return data;
}

export async function getOrderStatus(orderId: string) {
  const data = await callGateway({
    operation: 'get_order_status',
    payload: {
      order: { order_id: orderId },
    },
  });

  return data;
}


// -------- Accounts API: Auth & Orders --------

export interface AccountsUser {
  id: string;
  email: string | null;
  phone: string | null;
  primary_role: string;
  is_guest: boolean;
  has_password?: boolean;
}

export interface Membership {
  merchant_id: string;
  role: string;
}

type OrdersPermissions = {
  can_pay: boolean;
  can_cancel: boolean;
  can_reorder: boolean;
};

type OrdersListItem = {
  order_id: string;
  currency: string;
  total_amount_minor: number;
  status: string;
  payment_status: string;
  fulfillment_status: string;
  delivery_status: string;
  created_at: string;
  shipping_city?: string | null;
  shipping_country?: string | null;
  items_summary?: string;
  permissions?: OrdersPermissions;
};

export async function accountsLogin(email: string) {
  return callAccounts('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ channel: 'email', email }),
  });
}

export async function accountsVerify(email: string, otp: string) {
  return callAccounts('/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ channel: 'email', email, otp }),
  });
}

export async function accountsLoginWithPassword(email: string, password: string) {
  return callAccounts('/auth/password/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function accountsSetPassword(newPassword: string, currentPassword?: string) {
  return callAccounts('/auth/password/set', {
    method: 'POST',
    body: JSON.stringify({
      new_password: newPassword,
      current_password: currentPassword || undefined,
    }),
  });
}

export async function accountsMe() {
  return callAccounts('/auth/me');
}

export async function accountsRefresh() {
  return callAccounts('/auth/refresh', { method: 'POST' });
}

export async function accountsLogout() {
  return callAccounts('/auth/logout', { method: 'POST' });
}

export async function listMyOrders(cursor?: string | null, limit = 20) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (cursor) params.set('cursor', cursor);
  return callAccounts(`/orders/list?${params.toString()}`);
}

export async function getAccountOrder(orderId: string) {
  return callAccounts(`/orders/${orderId}`);
}

export async function cancelAccountOrder(orderId: string, reason?: string) {
  return callAccounts(`/orders/${orderId}/cancel`, {
    method: "POST",
    body: reason ? JSON.stringify({ reason }) : undefined,
  });
}

export async function publicOrderLookup(orderId: string, email: string) {
  const params = new URLSearchParams({ order_id: orderId, email });
  return callAccounts(`/public/order-lookup?${params.toString()}`);
}

export async function publicOrderTrack(orderId: string, email: string) {
  const params = new URLSearchParams({ order_id: orderId, email });
  return callAccounts(`/public/track?${params.toString()}`);
}
