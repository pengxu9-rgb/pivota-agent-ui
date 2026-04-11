// Centralized API helpers for calling the Pivota Agent Gateway and Accounts API
// All UI components should import functions from here instead of using fetch directly.
import {
  getCheckoutContextFromBrowser,
  normalizeCheckoutSource,
  persistCheckoutContext,
} from '@/lib/checkoutToken'
import { ensureAuroraSession, shouldUseAuroraAutoExchange } from '@/lib/auroraOrdersAuth'
import { formatDescriptionText } from '@/features/pdp/utils/formatDescriptionText'
import type { RecommendationsData } from '@/features/pdp/types'

// Point to the public Agent Gateway by default; override via NEXT_PUBLIC_API_URL if needed.
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  '/api/gateway'; // default to same-origin proxy to avoid CORS
const SEARCH_LIMIT_MAX = Math.max(
  1,
  Math.min(Number(process.env.NEXT_PUBLIC_SEARCH_LIMIT_MAX || 200) || 200, 200),
);
const BROWSE_DISCOVERY_MIN_LIMIT = 12;

// Accounts API is proxied through same-origin routes so auth cookies remain first-party.
// This avoids third-party cookie issues (e.g. in-app browsers / iOS Safari) and reduces CORS risk.
const ACCOUNTS_API_BASE = '/api/accounts';
const ACCOUNTS_ROOT_API_BASE = '/api/accounts-root';
const CHECKOUT_CONTEXTUAL_OPS = new Set([
  'preview_quote',
  'create_order',
  'submit_payment',
  'confirm_payment',
  'get_order_status',
]);
type CanonicalCheckoutSource = 'creator_agent' | 'shopping_agent';

function clampSearchLimit(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return Math.max(1, Math.min(fallback, SEARCH_LIMIT_MAX));
  return Math.max(1, Math.min(Math.floor(n), SEARCH_LIMIT_MAX));
}

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
  if (code === 'UPSTREAM_UNAVAILABLE') {
    return `The upstream service is temporarily unavailable${opSuffix}. Please retry.`;
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
  externalRedirectUrl?: string;
  affiliate_url?: string;
  external_url?: string;
  redirect_url?: string;
  url?: string;
  product_url?: string;
  canonical_url?: string;
  destination_url?: string;
  source_url?: string;
  external_seed_id?: string;
  source?: string;
  commerce_mode?: string;
  checkout_handoff?: string;
  purchase_route?: string;
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
  sellable_item_group_id?: string;
  product_line_id?: string;
  review_family_id?: string;
  identity_confidence?: number;
  match_basis?: string[];
  canonical_scope?: string;
  identity_graph?: {
    source_listing_ref?: string;
    sellable_item_group_id?: string;
    product_line_id?: string | null;
    review_family_id?: string | null;
    grouped_candidate_count?: number;
  };
  group_members?: Array<{
    merchant_id?: string;
    product_id?: string;
    source_kind?: string;
    source_tier?: string;
    source_listing_ref?: string;
  }>;
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
  card_title?: string;
  card_subtitle?: string;
  card_highlight?: string;
  card_badge?: string;
  card_intro?: string;
  market_signal_badges?: Array<{
    badge_type?: string;
    badge_label: string;
  }>;
  search_card?: {
    title_candidate?: string;
    compact_candidate?: string;
    highlight_candidate?: string;
    proof_badge_candidate?: string;
    intro_candidate?: string;
  };
  shopping_card?: {
    title?: string;
    subtitle?: string;
    highlight?: string;
    proof_badge?: string;
    intro?: string;
    [key: string]: any;
  };
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

export function normalizeProductDescriptionText(value: unknown): string {
  const raw =
    typeof value === 'string'
      ? value
      : typeof (value as any)?.text === 'string'
        ? (value as any).text
        : '';
  if (!raw) return '';

  return raw
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li\b[^>]*>/gi, '\n- ')
    .replace(/<\s*\/\s*(?:p|div|section|article|li|ul|ol|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/\r/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readFirstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}

function normalizeMarketSignalBadges(
  value: unknown,
): ProductResponse['market_signal_badges'] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value
    .map((item) => {
      const row = isRecord(item) ? item : null;
      const badgeLabel = readFirstString(row?.badge_label, row?.label, item);
      if (!badgeLabel) return null;
      return {
        ...(readFirstString(row?.badge_type, row?.type)
          ? { badge_type: readFirstString(row?.badge_type, row?.type) }
          : {}),
        badge_label: badgeLabel,
      };
    })
    .filter(Boolean) as Array<{ badge_type?: string; badge_label: string }>;
  return rows.length ? rows : undefined;
}

export function normalizeProduct(
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

  const getImageCandidate = (value: unknown): string => {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const nestedImage =
        obj.image && typeof obj.image === 'object'
          ? (obj.image as Record<string, unknown>)
          : null;
      const fromObject =
        obj.url ||
        obj.image_url ||
        obj.imageUrl ||
        obj.src ||
        obj.main_image_url ||
        obj.thumbnail_url ||
        obj.thumbnailUrl ||
        obj.preview_image_url ||
        obj.previewImageUrl ||
        nestedImage?.url ||
        nestedImage?.image_url ||
        nestedImage?.imageUrl ||
        nestedImage?.src ||
        '';
      return typeof fromObject === 'string' ? fromObject.trim() : '';
    }
    return '';
  };

  const firstFromArray = (arr: unknown): string => {
    if (!Array.isArray(arr)) return '';
    for (const item of arr) {
      const candidate = getImageCandidate(item);
      if (candidate) return candidate;
    }
    return '';
  };

  const firstFromSeedData = (seedData: unknown): string => {
    if (!seedData || typeof seedData !== 'object') return '';
    const seedObj = seedData as Record<string, unknown>;
    const snapshot =
      seedObj.snapshot && typeof seedObj.snapshot === 'object'
        ? (seedObj.snapshot as Record<string, unknown>)
        : null;
    return (
      getImageCandidate(seedObj.image_url) ||
      getImageCandidate(seedObj.imageUrl) ||
      getImageCandidate(seedObj.image) ||
      firstFromArray(seedObj.images) ||
      firstFromArray(seedObj.image_urls) ||
      getImageCandidate(snapshot?.image_url) ||
      getImageCandidate(snapshot?.imageUrl) ||
      getImageCandidate(snapshot?.image) ||
      firstFromArray(snapshot?.images) ||
      firstFromArray(snapshot?.image_urls) ||
      ''
    );
  };

  let normalizedImage =
    getImageCandidate(anyP.image_url) ||
    getImageCandidate(anyP.imageUrl) ||
    getImageCandidate(anyP.image) ||
    firstFromArray(anyP.images) ||
    firstFromArray(anyP.image_urls) ||
    firstFromSeedData(anyP.seed_data) ||
    firstFromArray(anyP.variants) ||
    firstFromArray(anyP.media);

  // Use image proxy for external images to avoid CORS issues
  if (normalizedImage && /^https?:\/\//i.test(normalizedImage)) {
    normalizedImage = `/api/image-proxy?url=${encodeURIComponent(normalizedImage)}`;
  } else if (!normalizedImage) {
    normalizedImage = '/placeholder.svg';
  }

  const description = normalizeProductDescriptionText(anyP.description);

  const images = Array.isArray(anyP.images)
    ? anyP.images
    : Array.isArray(anyP.image_urls)
      ? anyP.image_urls
      : undefined;

  const media = Array.isArray(anyP.media) ? anyP.media : undefined;
  const variants = Array.isArray(anyP.variants) ? anyP.variants : undefined;
  const reviewSummary =
    anyP.review_summary || anyP.reviews_summary || anyP.reviews?.summary;
  const rawDetail = isRecord(anyP.raw_detail) ? anyP.raw_detail : null;
  const rawSearchCard =
    (isRecord(anyP.search_card) ? anyP.search_card : null) ||
    (isRecord(anyP.searchCard) ? anyP.searchCard : null) ||
    (isRecord(anyP.card) ? anyP.card : null) ||
    (isRecord(rawDetail?.search_card) ? rawDetail?.search_card : null) ||
    (isRecord(rawDetail?.searchCard) ? rawDetail?.searchCard : null);
  const rawShoppingCard =
    (isRecord(anyP.shopping_card) ? anyP.shopping_card : null) ||
    (isRecord(anyP.shoppingCard) ? anyP.shoppingCard : null) ||
    (isRecord(rawDetail?.shopping_card) ? rawDetail?.shopping_card : null) ||
    (isRecord(rawDetail?.shoppingCard) ? rawDetail?.shoppingCard : null);
  const marketSignalBadges =
    normalizeMarketSignalBadges(anyP.market_signal_badges) ||
    normalizeMarketSignalBadges(anyP.marketSignals) ||
    normalizeMarketSignalBadges(anyP.product_intel?.market_signal_badges) ||
    normalizeMarketSignalBadges(rawSearchCard?.market_signal_badges) ||
    normalizeMarketSignalBadges(rawShoppingCard?.market_signal_badges);
  const cardTitle = readFirstString(
    anyP.card_title,
    anyP.cardTitle,
    anyP.search_card_title_candidate,
    rawSearchCard?.title_candidate,
    rawSearchCard?.title,
    rawShoppingCard?.title,
  );
  const cardSubtitle = readFirstString(
    anyP.card_subtitle,
    anyP.cardSubtitle,
    anyP.search_card_compact_candidate,
    rawSearchCard?.compact_candidate,
    rawSearchCard?.subtitle,
    rawShoppingCard?.subtitle,
    anyP.subtitle,
    anyP.sub_title,
  );
  const cardHighlight = readFirstString(
    anyP.card_highlight,
    anyP.cardHighlight,
    anyP.search_card_highlight_candidate,
    rawSearchCard?.highlight_candidate,
    rawSearchCard?.highlight,
    rawShoppingCard?.highlight,
  );
  const cardBadge = readFirstString(
    anyP.card_badge,
    anyP.cardBadge,
    anyP.search_card_proof_badge_candidate,
    rawSearchCard?.proof_badge_candidate,
    rawShoppingCard?.proof_badge,
    marketSignalBadges?.[0]?.badge_label,
  );
  const cardIntro = readFirstString(
    anyP.card_intro,
    anyP.cardIntro,
    anyP.search_card_intro_candidate,
    rawSearchCard?.intro_candidate,
    rawSearchCard?.intro,
    rawShoppingCard?.intro,
  );

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
    sellable_item_group_id: anyP.sellable_item_group_id || anyP.sellableItemGroupId || undefined,
    product_line_id: anyP.product_line_id || anyP.productLineId || undefined,
    review_family_id: anyP.review_family_id || anyP.reviewFamilyId || undefined,
    identity_confidence:
      Number.isFinite(Number(anyP.identity_confidence ?? anyP.identityConfidence))
        ? Number(anyP.identity_confidence ?? anyP.identityConfidence)
        : undefined,
    match_basis: Array.isArray(anyP.match_basis)
      ? anyP.match_basis.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : Array.isArray(anyP.matchBasis)
        ? anyP.matchBasis.map((item: unknown) => String(item || '').trim()).filter(Boolean)
        : undefined,
    canonical_scope: anyP.canonical_scope || anyP.canonicalScope || undefined,
    identity_graph:
      anyP.identity_graph && typeof anyP.identity_graph === 'object'
        ? anyP.identity_graph
        : anyP.identityGraph && typeof anyP.identityGraph === 'object'
          ? anyP.identityGraph
          : undefined,
    group_members: Array.isArray(anyP.group_members)
      ? anyP.group_members
      : Array.isArray(anyP.groupMembers)
        ? anyP.groupMembers
        : undefined,
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
    ...(cardTitle ? { card_title: cardTitle } : {}),
    ...(cardSubtitle ? { card_subtitle: cardSubtitle } : {}),
    ...(cardHighlight ? { card_highlight: cardHighlight } : {}),
    ...(cardBadge ? { card_badge: cardBadge } : {}),
    ...(cardIntro ? { card_intro: cardIntro } : {}),
    ...(marketSignalBadges ? { market_signal_badges: marketSignalBadges } : {}),
    ...(rawSearchCard
      ? {
          search_card: {
            ...(readFirstString(rawSearchCard?.title_candidate, rawSearchCard?.title)
              ? {
                  title_candidate: readFirstString(
                    rawSearchCard?.title_candidate,
                    rawSearchCard?.title,
                  ),
                }
              : {}),
            ...(readFirstString(rawSearchCard?.compact_candidate, rawSearchCard?.subtitle)
              ? {
                  compact_candidate: readFirstString(
                    rawSearchCard?.compact_candidate,
                    rawSearchCard?.subtitle,
                  ),
                }
              : {}),
            ...(readFirstString(rawSearchCard?.highlight_candidate, rawSearchCard?.highlight)
              ? {
                  highlight_candidate: readFirstString(
                    rawSearchCard?.highlight_candidate,
                    rawSearchCard?.highlight,
                  ),
                }
              : {}),
            ...(readFirstString(rawSearchCard?.proof_badge_candidate)
              ? { proof_badge_candidate: readFirstString(rawSearchCard?.proof_badge_candidate) }
              : {}),
            ...(readFirstString(rawSearchCard?.intro_candidate, rawSearchCard?.intro)
              ? {
                  intro_candidate: readFirstString(
                    rawSearchCard?.intro_candidate,
                    rawSearchCard?.intro,
                  ),
                }
              : {}),
          },
        }
      : {}),
    ...(rawShoppingCard
      ? {
          shopping_card: {
            ...(readFirstString(rawShoppingCard?.title) ? { title: readFirstString(rawShoppingCard?.title) } : {}),
            ...(readFirstString(rawShoppingCard?.subtitle)
              ? { subtitle: readFirstString(rawShoppingCard?.subtitle) }
              : {}),
            ...(readFirstString(rawShoppingCard?.highlight)
              ? { highlight: readFirstString(rawShoppingCard?.highlight) }
              : {}),
            ...(readFirstString(rawShoppingCard?.proof_badge)
              ? { proof_badge: readFirstString(rawShoppingCard?.proof_badge) }
              : {}),
            ...(readFirstString(rawShoppingCard?.intro) ? { intro: readFirstString(rawShoppingCard?.intro) } : {}),
          },
        }
      : {}),
  };
}

interface InvokeBody {
  operation: string;
  payload: any;
  metadata?: Record<string, any>;
}

const RECENT_QUERIES_STORAGE_KEY_PREFIX = 'pivota_recent_queries_v1';
const DEVICE_ID_STORAGE_KEY = 'pivota_shopping_device_id_v1';
const MAX_RECENT_QUERIES = 8;
const EVAL_META_STORAGE_KEY = 'pivota_eval_meta_v1';

type ShoppingScopeCatalog = 'global' | 'category' | 'promo_pool';
type ShoppingScope = {
  catalog: ShoppingScopeCatalog;
  region: string | null;
  language: string | null;
};

export type ShoppingDiscoverySurface = 'home_hot_deals' | 'browse_products';

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
  if (pathname.startsWith('/brands/')) return 'plp';
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

function getOrCreateBehaviorDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && existing.trim()) return existing.trim();
    const generated =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `device_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return 'anonymous';
  }
}

function getRecentQueriesStorageKey(userId?: string | null): string {
  const normalizedUserId = String(userId || '').trim();
  if (normalizedUserId) {
    return `${RECENT_QUERIES_STORAGE_KEY_PREFIX}:user:${normalizedUserId}`;
  }
  return `${RECENT_QUERIES_STORAGE_KEY_PREFIX}:anon:${getOrCreateBehaviorDeviceId()}`;
}

function normalizeRecentQueries(input: unknown, limit = MAX_RECENT_QUERIES): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
    .slice(0, limit);
}

function readRecentQueries(userId?: string | null): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(getRecentQueriesStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return normalizeRecentQueries(parsed);
  } catch {
    return [];
  }
}

function writeRecentQueries(queries: string[], userId?: string | null) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      getRecentQueriesStorageKey(userId),
      JSON.stringify(queries.slice(0, MAX_RECENT_QUERIES)),
    );
  } catch {
    // ignore storage errors
  }
}

function rememberRecentQuery(query: string, userId?: string | null) {
  const q = String(query || '').trim();
  if (!q) return;
  const existing = readRecentQueries(userId);
  const next = [q, ...existing.filter((x) => x !== q)].slice(
    0,
    MAX_RECENT_QUERIES,
  );
  writeRecentQueries(next, userId);
}

function getCheckoutContext() {
  return getCheckoutContextFromBrowser()
}

function isCheckoutContextualOperation(operation: unknown): boolean {
  return CHECKOUT_CONTEXTUAL_OPS.has(String(operation || '').trim().toLowerCase())
}

function getCanonicalCheckoutSource(raw: unknown): CanonicalCheckoutSource | null {
  const normalized = normalizeCheckoutSource(raw)
  if (normalized === 'creator_agent' || normalized === 'shopping_agent') {
    return normalized
  }
  return null
}

function getDefaultGatewaySource(): string {
  return getCanonicalCheckoutSource(process.env.NEXT_PUBLIC_GATEWAY_SOURCE || 'shopping_agent') || 'shopping_agent'
}

function resolveGatewaySource(args: {
  operation: unknown
  requestMetadata: Record<string, any>
  checkoutContext: { token: string | null; source: string | null }
}): string {
  const explicitSource = getCanonicalCheckoutSource(args.requestMetadata?.source)
  if (explicitSource) return explicitSource

  if (isCheckoutContextualOperation(args.operation)) {
    const checkoutSource = getCanonicalCheckoutSource(args.checkoutContext?.source)
    if (checkoutSource) return checkoutSource
  }

  return getDefaultGatewaySource()
}

function buildCheckoutOrderMetadata(args: {
  metadata?: Record<string, any>
  resolvedSource: string
}): Record<string, any> {
  const metadata = isPlainObject(args.metadata) ? { ...args.metadata } : {}
  const rawSource = String(metadata.source || '').trim()
  const canonicalSource = getCanonicalCheckoutSource(rawSource)
  const rawUiSource = String(metadata.ui_source || '').trim()
  const uiSource = rawUiSource || (!canonicalSource && rawSource ? rawSource : '') || 'checkout_ui'

  return {
    ...metadata,
    source: canonicalSource || args.resolvedSource,
    ui_source: uiSource,
  }
}

function isCheckoutRestartRequiredError(args: {
  code?: string | null
  details?: any
  message?: string | null
}): boolean {
  const normalizedCode = String(args.code || '').trim().toUpperCase()
  if (
    normalizedCode === 'CHECKOUT_RESTART_REQUIRED' ||
    normalizedCode === 'CHECKOUT_CONTEXT_MISMATCH' ||
    normalizedCode === 'CHECKOUT_TOKEN_INVALID' ||
    normalizedCode === 'CHECKOUT_TOKEN_EXPIRED' ||
    normalizedCode === 'INVALID_CHECKOUT_TOKEN' ||
    normalizedCode === 'TOKEN_AGENT_MISMATCH' ||
    normalizedCode === 'TOKEN_SOURCE_MISMATCH'
  ) {
    return true
  }

  const detailText = (() => {
    if (!args.details) return ''
    if (typeof args.details === 'string') return args.details
    try {
      return JSON.stringify(args.details)
    } catch {
      return String(args.details)
    }
  })()
  const combined = `${String(args.message || '')} ${detailText}`.toLowerCase()

  return (
    combined.includes('checkout token') &&
    (combined.includes('mismatch') ||
      combined.includes('invalid') ||
      combined.includes('expired') ||
      combined.includes('stale'))
  ) || (
    combined.includes('creator_agent') &&
    combined.includes('shopping_agent') &&
    combined.includes('mismatch')
  )
}

function getCheckoutRestartMessage(source: string): string {
  if (source === 'creator_agent') {
    return 'This checkout link is invalid or expired. Please restart from the creator entrypoint to continue.'
  }
  return 'This checkout link is invalid or expired. Please restart checkout to continue.'
}

type GatewayCallOptions = {
  signal?: AbortSignal;
};

function resolveGatewayInvokeUrl(base: string): string {
  const normalized = String(base || '').trim().replace(/\/$/, '');
  if (!normalized) return '/api/gateway';
  if (/\/agent\/shop\/v1\/invoke$/i.test(normalized)) return normalized;
  if (/\/api\/gateway$/i.test(normalized)) return normalized;
  if (normalized.startsWith('/api/gateway')) return normalized;
  return `${normalized}/agent/shop/v1/invoke`;
}

async function callGateway(body: InvokeBody, options: GatewayCallOptions = {}) {
  const url = resolveGatewayInvokeUrl(API_BASE);
  const checkoutContext = getCheckoutContext()
  let checkoutToken = checkoutContext.token
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
  const resolvedSource = resolveGatewaySource({
    operation: body?.operation,
    requestMetadata,
    checkoutContext,
  })

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
      ui_source: requestMetadata.ui_source || 'shopping-agent-ui',
      source: resolvedSource,
    },
  };

  const operation = String(requestBody?.operation || '').trim().toLowerCase();
  void operation

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

    if (
      isCheckoutRestartRequiredError({
        code: err.code,
        details,
        message: messageCandidate,
      })
    ) {
      err.code = 'CHECKOUT_RESTART_REQUIRED'
      err.message = getCheckoutRestartMessage(resolvedSource)
      persistCheckoutContext({
        token: null,
        source: normalizeCheckoutSource(checkoutContext.source) || resolvedSource,
      })
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
  | 'NOT_VERIFIED_FOR_RATING'
  | 'ALREADY_REVIEWED'
  | 'RATE_LIMITED';

export type UgcCapabilities = {
  canUploadMedia: boolean;
  canWriteReview: boolean;
  canRateReview?: boolean;
  canAskQuestion: boolean;
  reasons?: {
    upload?: UgcCapabilityReason;
    review?: UgcCapabilityReason;
    rating?: UgcCapabilityReason;
    question?: UgcCapabilityReason;
  };
  review?: {
    review_id?: number;
    verification?: string;
    has_rating?: boolean;
  } | null;
};

export type GetPdpV2PersonalizationResponse = {
  ugcCapabilities?: UgcCapabilities;
};

export type ReviewEligibilityResponse = {
  eligible: boolean;
  reason?: 'NOT_PURCHASER' | 'ALREADY_REVIEWED';
};

const isAuroraRecoverableAccountsPath = (path: string): boolean => {
  const normalized = String(path || '').trim()
  if (!normalized) return false
  return (
    normalized.startsWith('/orders') ||
    normalized.startsWith('/my-orders') ||
    normalized.startsWith('/auth/me') ||
    normalized.startsWith('/pdp/v2/personalization') ||
    normalized.startsWith('/reviews/eligibility')
  )
}

const extractAccountsErrorCode = (data: any): string | undefined =>
  (data as any)?.detail?.error?.code ||
  (typeof (data as any)?.detail === 'string' ? (data as any).detail : undefined) ||
  (data as any)?.error?.code ||
  undefined

const extractAccountsErrorMessage = (data: any, fallback: string): string =>
  (data as any)?.detail?.error?.message ||
  (typeof (data as any)?.detail === 'string' ? (data as any).detail : undefined) ||
  (data as any)?.error?.message ||
  fallback

const canAttemptAuroraAutoExchangeRecovery = (args: {
  path: string;
  status: number;
  code?: string;
  mode?: 'auto' | 'off';
}): boolean => {
  if (!isAuroraRecoverableAccountsPath(args.path)) return false
  if (args.status !== 401) return false
  if (args.mode === 'off') return false
  if (!shouldUseAuroraAutoExchange()) return false
  const normalizedCode = String(args.code || '').trim().toUpperCase()
  if (!normalizedCode) return true
  return normalizedCode === 'UNAUTHENTICATED' || normalizedCode === 'NOT_AUTHENTICATED'
}

const buildAccountsApiError = (args: {
  data: any;
  status: number;
  fallback: string;
}): ApiError => {
  const code = extractAccountsErrorCode(args.data)
  const message = extractAccountsErrorMessage(args.data, args.fallback)
  const err = new Error(message) as ApiError
  err.code = code
  err.status = args.status
  err.detail = args.data
  return err
}

async function callAccountsBase(
  base: string,
  path: string,
  options: RequestInit & {
    skipJson?: boolean;
    timeout_ms?: number;
    timeoutMs?: number;
    aurora_recovery?: 'auto' | 'off';
  } = {},
) {
  const url = `${base}${path}`;
  const { skipJson, headers, method, body, timeout_ms, timeoutMs, aurora_recovery, ...rest } =
    options as any;
  const timeoutValue = Number(timeout_ms ?? timeoutMs);
  const auroraRecoveryMode: 'auto' | 'off' = aurora_recovery === 'off' ? 'off' : 'auto';

  const requestOnce = async (): Promise<{ res: Response; data: any }> => {
    const hasTimeout = Number.isFinite(timeoutValue) && timeoutValue > 0;
    const controller = hasTimeout ? new AbortController() : null;
    const timer = hasTimeout
      ? setTimeout(() => {
          controller?.abort();
        }, timeoutValue)
      : null;

    const requestHeaders = new Headers(headers as HeadersInit);
    if (!(body instanceof FormData) && !requestHeaders.has('Content-Type')) {
      requestHeaders.set('Content-Type', 'application/json');
    }

    let res: Response;
    try {
      res = await fetch(url, {
        ...rest,
        method: method || 'GET',
        credentials: 'include', // rely on HttpOnly cookies
        headers: requestHeaders,
        ...(controller ? { signal: controller.signal } : {}),
        body,
      });
    } catch (err) {
      if ((err as any)?.name === 'AbortError') {
        const timeoutErr = new Error('The request timed out. Please retry.') as ApiError;
        timeoutErr.code = 'UPSTREAM_TIMEOUT';
        timeoutErr.status = 504;
        throw timeoutErr;
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (skipJson) return { res, data: null };
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };

  let first = await requestOnce();
  if (skipJson) return first.res;
  if (first.res.ok) return first.data;

  const firstCode = extractAccountsErrorCode(first.data);
  if (
    canAttemptAuroraAutoExchangeRecovery({
      path,
      status: first.res.status,
      code: firstCode,
      mode: auroraRecoveryMode,
    })
  ) {
    const recovered = await ensureAuroraSession(
      typeof window !== 'undefined' ? window.location.pathname : undefined,
    );
    if (recovered.ok) {
      const retried = await requestOnce();
      if (skipJson) return retried.res;
      if (retried.res.ok) return retried.data;
      throw buildAccountsApiError({
        data: retried.data,
        status: retried.res.status,
        fallback: retried.res.statusText,
      });
    }
  }

  throw buildAccountsApiError({
    data: first.data,
    status: first.res.status,
    fallback: first.res.statusText,
  });
}

type AccountsCallOptions = RequestInit & {
  skipJson?: boolean;
  timeout_ms?: number;
  timeoutMs?: number;
  aurora_recovery?: 'auto' | 'off';
};

async function callAccounts(path: string, options: AccountsCallOptions = {}) {
  return callAccountsBase(ACCOUNTS_API_BASE, path, options);
}

async function callAccountsRoot(path: string, options: AccountsCallOptions = {}) {
  return callAccountsBase(ACCOUNTS_ROOT_API_BASE, path, options);
}

function isUnauthenticatedAccountsError(err: any): boolean {
  return (
    err?.status === 401 ||
    err?.code === 'NOT_AUTHENTICATED' ||
    err?.code === 'UNAUTHENTICATED'
  );
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

export async function attachReviewMediaFromUser(
  reviewId: number,
  file: File,
): Promise<{
  status?: string;
  review_id?: number;
  media?: { id?: number; public_id?: string; type?: string };
  media_moderation_state?: string;
} | null> {
  const rid = Number(reviewId);
  if (!Number.isFinite(rid) || rid <= 0) return null;
  const form = new FormData();
  form.append('file', file);
  return (await callAccountsRoot(`/buyer/reviews/v1/reviews/${Math.trunc(rid)}/media/from_user`, {
    method: 'POST',
    cache: 'no-store',
    body: form,
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

export type QuestionListItem = {
  question_id: number;
  question: string;
  created_at?: string | null;
  replies?: number | null;
};

export async function listQuestions(args: {
  productId: string;
  productGroupId?: string | null;
  limit?: number;
  timeout_ms?: number;
}): Promise<{ count: number; items: QuestionListItem[] } | null> {
  const productId = String(args.productId || '').trim();
  if (!productId) return null;

  const params = new URLSearchParams({ productId });
  const groupId = String(args.productGroupId || '').trim();
  if (groupId) params.set('productGroupId', groupId);

  const limitRaw = args.limit;
  if (typeof limitRaw === 'number' && Number.isFinite(limitRaw)) {
    params.set('limit', String(Math.max(1, Math.min(50, Math.floor(limitRaw)))));
  }

  const res = (await callAccountsRoot(`/questions?${params.toString()}`, {
    cache: 'no-store',
    timeout_ms: args.timeout_ms,
  })) as any;

  const itemsRaw = Array.isArray(res?.items) ? res.items : [];
  const items: QuestionListItem[] = itemsRaw
    .map((it: any) => ({
      question_id: Number(it?.question_id ?? it?.questionId ?? it?.id) || 0,
      question: String(it?.question ?? '').trim(),
      created_at: it?.created_at ?? it?.createdAt ?? null,
      replies: Number(it?.replies ?? it?.reply_count ?? it?.replyCount) || 0,
    }))
    .filter((it: any) => it.question);
  const countRaw = Number(res?.count);
  const count = Number.isFinite(countRaw) ? countRaw : items.length;
  return { count, items };
}

export type QuestionReplyListItem = {
  reply_id: number;
  body: string;
  created_at?: string | null;
};

export async function getQuestion(args: {
  questionId: number | string;
}): Promise<{
  question_id: number;
  subject_type: string;
  subject_id: string;
  question: string;
  created_at?: string | null;
  replies: number;
} | null> {
  const qid = Number(args.questionId);
  if (!Number.isFinite(qid) || qid <= 0) return null;
  const res = (await callAccountsRoot(`/questions/${qid}`, { cache: 'no-store' })) as any;
  if (!res || res.status !== 'success') return null;
  return {
    question_id: Number(res.question_id ?? res.id ?? qid) || qid,
    subject_type: String(res.subject_type ?? ''),
    subject_id: String(res.subject_id ?? ''),
    question: String(res.question ?? '').trim(),
    created_at: res.created_at ?? res.createdAt ?? null,
    replies: Number(res.replies) || 0,
  };
}

export async function listQuestionReplies(args: {
  questionId: number | string;
  limit?: number;
}): Promise<{ count: number; items: QuestionReplyListItem[] } | null> {
  const qid = Number(args.questionId);
  if (!Number.isFinite(qid) || qid <= 0) return null;

  const params = new URLSearchParams();
  const limitRaw = args.limit;
  if (typeof limitRaw === 'number' && Number.isFinite(limitRaw)) {
    params.set('limit', String(Math.max(1, Math.min(50, Math.floor(limitRaw)))));
  }

  const suffix = params.toString() ? `?${params.toString()}` : '';
  const res = (await callAccountsRoot(`/questions/${qid}/replies${suffix}`, { cache: 'no-store' })) as any;
  const itemsRaw = Array.isArray(res?.items) ? res.items : [];
  const items: QuestionReplyListItem[] = itemsRaw
    .map((it: any) => ({
      reply_id: Number(it?.reply_id ?? it?.replyId ?? it?.id) || 0,
      body: String(it?.body ?? it?.text ?? '').trim(),
      created_at: it?.created_at ?? it?.createdAt ?? null,
    }))
    .filter((it: any) => it.body);
  const countRaw = Number(res?.count);
  const count = Number.isFinite(countRaw) ? countRaw : items.length;
  return { count, items };
}

export async function postQuestionReply(args: {
  questionId: number | string;
  body: string;
}) {
  const qid = Number(args.questionId);
  if (!Number.isFinite(qid) || qid <= 0) return null;
  return (await callAccountsRoot(`/questions/${qid}/replies`, {
    method: 'POST',
    cache: 'no-store',
    body: JSON.stringify({ body: String(args.body || '') }),
  })) as any;
}

// -------- Product search helpers --------

export type SendMessageResult = {
  products: ProductResponse[];
  reply: string | null;
  metadata: Record<string, any>;
  strict_empty: boolean;
  page_info: {
    page: number;
    page_size: number;
    total?: number;
    has_more: boolean;
  };
};

export type DiscoveryRecentView = {
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

export type BrandDiscoverySort = 'popular' | 'price_desc' | 'price_asc';

export type BrandDiscoveryFacet = {
  value: string;
  label: string;
  count: number;
};

export type BrandDiscoveryFacets = {
  categories: BrandDiscoveryFacet[];
};

export type BrandDiscoveryFeedResult = {
  products: ProductResponse[];
  metadata: Record<string, any>;
  facets: BrandDiscoveryFacets;
  query_text: string;
  page_info: {
    page: number;
    page_size: number;
    total?: number;
    has_more: boolean;
  };
};

export type ShoppingDiscoveryFeedResult = {
  products: ProductResponse[];
  metadata: Record<string, any>;
  page_info: {
    page: number;
    page_size: number;
    total?: number;
    has_more: boolean;
  };
};

export type SimilarProductsMainlineResult = {
  strategy: string;
  items: RecommendationsData['items'];
  metadata: RecommendationsData['metadata'] | null;
  page_info: {
    page: number;
    page_size: number;
    total?: number;
    has_more: boolean;
  };
};

function normalizeRecommendationItem(
  input: any,
  fallbackCurrency = 'USD',
): RecommendationsData['items'][number] | null {
  const productId = String(input?.product_id || input?.productId || input?.id || '').trim();
  if (!productId) return null;

  const normalized = normalizeProduct({
    ...input,
    product_id: productId,
    price: input?.price ?? input?.price_amount ?? input?.price ?? 0,
    currency: String(input?.price?.currency || input?.currency || '').trim() || fallbackCurrency,
  } as ProductResponse);
  const amount = Number(normalized.price || 0);
  const currency = String(normalized.currency || '').trim() || fallbackCurrency;
  const rating = Number(input?.rating);
  const reviewCount = Number(input?.review_count ?? input?.reviewCount);

  return {
    product_id: normalized.product_id,
    title: normalized.title,
    ...(normalized.merchant_id ? { merchant_id: normalized.merchant_id } : {}),
    ...(normalized.merchant_name ? { merchant_name: normalized.merchant_name } : {}),
    ...(normalized.image_url ? { image_url: normalized.image_url } : {}),
    ...(Number.isFinite(amount) && amount > 0 ? { price: { amount, currency } } : {}),
    ...(Number.isFinite(rating) ? { rating } : {}),
    ...(Number.isFinite(reviewCount) ? { review_count: Math.max(0, Math.round(reviewCount)) } : {}),
    ...(normalized.product_type ? { product_type: normalized.product_type } : {}),
    ...(normalized.category ? { category: normalized.category } : {}),
    ...(normalized.department ? { department: normalized.department } : {}),
    ...(Array.isArray(normalized.tags) ? { tags: normalized.tags } : {}),
    ...(normalized.review_summary ? { review_summary: normalized.review_summary } : {}),
    ...(normalized.card_title ? { card_title: normalized.card_title } : {}),
    ...(normalized.card_subtitle ? { card_subtitle: normalized.card_subtitle } : {}),
    ...(normalized.card_highlight ? { card_highlight: normalized.card_highlight } : {}),
    ...(normalized.card_badge ? { card_badge: normalized.card_badge } : {}),
    ...(normalized.search_card ? { search_card: normalized.search_card } : {}),
    ...(normalized.shopping_card ? { shopping_card: normalized.shopping_card } : {}),
    ...(Array.isArray(normalized.market_signal_badges)
      ? { market_signal_badges: normalized.market_signal_badges }
      : {}),
  };
}

function normalizeRecommendationsMetadata(input: any): RecommendationsData['metadata'] | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const hasMore = typeof input.has_more === 'boolean' ? input.has_more : undefined;
  const similarConfidence = String(input.similar_confidence || '').trim();
  const lowConfidence = input.low_confidence === true;
  const underfill = Number(input.underfill);
  const retrievalMix = input.retrieval_mix;
  const selectionMix = input.selection_mix;
  const baseSemantic = input.base_semantic;
  const lowConfidenceReasonCodes = Array.isArray(input.low_confidence_reason_codes)
    ? input.low_confidence_reason_codes
        .map((item: unknown) => String(item || '').trim())
        .filter(Boolean)
    : [];

  return {
    ...(typeof hasMore === 'boolean' ? { has_more: hasMore } : {}),
    ...(similarConfidence ? { similar_confidence: similarConfidence } : {}),
    ...(lowConfidence ? { low_confidence: true } : {}),
    ...(lowConfidenceReasonCodes.length ? { low_confidence_reason_codes: lowConfidenceReasonCodes } : {}),
    ...(Number.isFinite(underfill) ? { underfill: Math.max(0, Math.trunc(underfill)) } : {}),
    ...(retrievalMix && typeof retrievalMix === 'object' ? { retrieval_mix: retrievalMix } : {}),
    ...(selectionMix && typeof selectionMix === 'object' ? { selection_mix: selectionMix } : {}),
    ...(baseSemantic && typeof baseSemantic === 'object' ? { base_semantic: baseSemantic } : {}),
  };
}

function normalizeBrandDiscoveryFacet(input: any): BrandDiscoveryFacet | null {
  const value = String(input?.value || input?.key || '').trim();
  if (!value) return null;
  const count = Number(input?.count);
  return {
    value,
    label: String(input?.label || value).trim() || value,
    count: Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0,
  };
}

function normalizeBrandDiscoveryFacets(metadata: Record<string, any>): BrandDiscoveryFacets {
  const rawCategories = metadata?.facets?.categories;
  return {
    categories: Array.isArray(rawCategories)
      ? rawCategories
          .map((item) => normalizeBrandDiscoveryFacet(item))
          .filter(Boolean) as BrandDiscoveryFacet[]
      : [],
  };
}

function normalizeDiscoveryRecentView(input: any): DiscoveryRecentView | null {
  const productId = String(input?.product_id || input?.productId || '').trim();
  if (!productId) return null;
  return {
    product_id: productId,
    ...(input?.merchant_id != null || input?.merchantId != null
      ? { merchant_id: String(input?.merchant_id || input?.merchantId || '').trim() || null }
      : {}),
    ...(input?.title ? { title: String(input.title).trim() } : {}),
    ...(input?.description ? { description: String(input.description).trim() } : {}),
    ...(input?.brand ? { brand: String(input.brand).trim() } : {}),
    ...(input?.category ? { category: String(input.category).trim() } : {}),
    ...(input?.product_type || input?.productType
      ? { product_type: String(input?.product_type || input?.productType).trim() }
      : {}),
    ...(input?.viewed_at || input?.viewedAt
      ? { viewed_at: String(input?.viewed_at || input?.viewedAt) }
      : {}),
    ...(input?.history_source || input?.historySource
      ? { history_source: String(input?.history_source || input?.historySource).trim() }
      : {}),
  };
}

// Chat entrypoint: search products by free text query.
export async function sendMessage(
  message: string,
  merchantIdOverride?: string,
  options?: {
    metadata?: Record<string, any>;
    signal?: AbortSignal;
    pagination?: { page?: number; limit?: number };
    userId?: string | null;
  },
): Promise<SendMessageResult> {
  const query = message.trim();
  const userId = String(options?.userId || '').trim() || null;
  const recentQueries = getEvalVariant() === 'A' ? [] : readRecentQueries(userId);
  const requestedPage = Math.max(1, Math.floor(Number(options?.pagination?.page || 1) || 1));
  const requestedLimit = clampSearchLimit(options?.pagination?.limit, 24);

  const data = await callGateway(
    {
      operation: 'find_products_multi',
      payload: {
        search: {
          // Cross-merchant search by default; optional explicit merchant scope still supported.
          in_stock_only: false, // allow showing results even if inventory is zero for demo
          query,
          limit: requestedLimit,
          page: requestedPage,
          allow_external_seed: true,
          allow_stale_cache: false,
          external_seed_strategy: 'unified_relevance',
          ...(merchantIdOverride
            ? { merchant_id: merchantIdOverride, search_all_merchants: false }
            : { search_all_merchants: true }),
        },
        user: {
          // Provide lightweight context to stabilize intent/constraint extraction
          // across follow-up queries (aligned with creator-agent contract).
          ...(userId ? { id: userId } : {}),
          recent_queries: recentQueries,
        },
      },
      ...(isPlainObject(options?.metadata) ? { metadata: options?.metadata } : {}),
    },
    { signal: options?.signal },
  );

  const products = ((data as any).products || []).map(
    (p: RealAPIProduct | ProductResponse) => normalizeProduct(p),
  );
  const metadata =
    data && typeof data === 'object' && data.metadata && typeof (data as any).metadata === 'object'
      ? ((data as any).metadata as Record<string, any>)
      : {};
  const responsePageRaw = Number((data as any)?.page);
  const responsePageSizeRaw = Number((data as any)?.page_size ?? (data as any)?.pageSize);
  const responseTotalRaw = Number((data as any)?.total);
  const responseHasMore = (data as any)?.has_more;
  const responseHasMoreAlt = (data as any)?.hasMore;

  const page = Number.isFinite(responsePageRaw) && responsePageRaw > 0
    ? Math.floor(responsePageRaw)
    : requestedPage;
  const pageSize = Number.isFinite(responsePageSizeRaw) && responsePageSizeRaw > 0
    ? Math.floor(responsePageSizeRaw)
    : requestedLimit;
  const total =
    Number.isFinite(responseTotalRaw) && responseTotalRaw >= 0
      ? Math.floor(responseTotalRaw)
      : undefined;
  const hasMore =
    typeof responseHasMore === 'boolean'
      ? responseHasMore
      : typeof responseHasMoreAlt === 'boolean'
        ? responseHasMoreAlt
        : typeof total === 'number'
          ? page * pageSize < total
          : products.length >= pageSize;
  const replyRaw = typeof (data as any)?.reply === 'string' ? String((data as any).reply).trim() : '';
  const strictEmpty = Boolean(metadata?.strict_empty) || (query.length > 0 && products.length === 0);

  // Update the local recent query list after using the previous context.
  rememberRecentQuery(query, userId);

  return {
    products,
    reply: replyRaw || null,
    metadata,
    strict_empty: strictEmpty,
    page_info: {
      page,
      page_size: pageSize,
      ...(typeof total === 'number' ? { total } : {}),
      has_more: hasMore,
    },
  };
}

export async function getBrandDiscoveryFeed(args: {
  brandName: string;
  query?: string;
  category?: string;
  sort?: BrandDiscoverySort;
  page?: number;
  limit?: number;
  recentViews?: DiscoveryRecentView[];
  recentQueries?: string[];
  sourceProductRef?: {
    product_id?: string | null;
    merchant_id?: string | null;
  };
}): Promise<BrandDiscoveryFeedResult> {
  const brandName = String(args.brandName || '').trim();
  const queryText = String(args.query || '').trim();
  const category = String(args.category || '').trim().toLowerCase();
  const sort: BrandDiscoverySort =
    args.sort === 'price_desc' || args.sort === 'price_asc' ? args.sort : 'popular';
  const requestedPage = Math.max(1, Math.floor(Number(args.page || 1) || 1));
  const requestedLimit = clampSearchLimit(args.limit, 24);
  const recentViews = (Array.isArray(args.recentViews) ? args.recentViews : [])
    .map((item) => normalizeDiscoveryRecentView(item))
    .filter(Boolean)
    .slice(0, 16) as DiscoveryRecentView[];
  const recentQueries = (
    Array.isArray(args.recentQueries) && args.recentQueries.length
      ? args.recentQueries
      : readRecentQueries()
  )
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, MAX_RECENT_QUERIES);

  if (!brandName) {
    return {
      products: [],
      metadata: {
        brand_scope_applied: [],
        category_scope_applied: category ? [category] : [],
        sort_applied: sort,
        query_text: queryText,
        has_more: false,
        facets: {
          categories: [],
        },
      },
      facets: {
        categories: [],
      },
      query_text: queryText,
      page_info: {
        page: requestedPage,
        page_size: 0,
        has_more: false,
      },
    };
  }

  const data = await callGateway({
    operation: 'get_discovery_feed',
    payload: {
      surface: 'browse_products',
      response_detail: 'card',
      page: requestedPage,
      limit: requestedLimit,
      sort,
      query: {
        text: queryText,
      },
      scope: {
        brand_names: [brandName],
        ...(category ? { categories: [category] } : {}),
      },
      context: {
        recent_views: recentViews,
        recent_queries: recentQueries,
        locale: getBrowserLanguage() || 'en-US',
      },
      ...(args.sourceProductRef?.product_id
        ? {
            source_product_ref: {
              product_id: String(args.sourceProductRef.product_id).trim(),
              ...(args.sourceProductRef.merchant_id
                ? { merchant_id: String(args.sourceProductRef.merchant_id).trim() }
                : {}),
            },
          }
        : {}),
    },
  });

  const products = ((data as any).products || []).map(
    (p: RealAPIProduct | ProductResponse) => normalizeProduct(p),
  );
  const metadata =
    data && typeof data === 'object' && data.metadata && typeof (data as any).metadata === 'object'
      ? ((data as any).metadata as Record<string, any>)
      : {};
  const facets = normalizeBrandDiscoveryFacets(metadata);
  const responsePageRaw = Number((data as any)?.page);
  const responsePageSizeRaw = Number((data as any)?.page_size ?? (data as any)?.pageSize);
  const responseTotalRaw = Number((data as any)?.total);
  const page = Number.isFinite(responsePageRaw) && responsePageRaw > 0
    ? Math.floor(responsePageRaw)
    : requestedPage;
  const pageSize = Number.isFinite(responsePageSizeRaw) && responsePageSizeRaw >= 0
    ? Math.floor(responsePageSizeRaw)
    : products.length;
  const total =
    Number.isFinite(responseTotalRaw) && responseTotalRaw >= 0
      ? Math.floor(responseTotalRaw)
      : undefined;
  const hasMore =
    typeof metadata.has_more === 'boolean'
      ? metadata.has_more
      : typeof total === 'number'
        ? page * requestedLimit < total
        : products.length >= requestedLimit;

  return {
    products,
    metadata,
    facets,
    query_text: queryText,
    page_info: {
      page,
      page_size: pageSize,
      ...(typeof total === 'number' ? { total } : {}),
      has_more: hasMore,
    },
  };
}

export async function getShoppingDiscoveryFeed(args: {
  surface: ShoppingDiscoverySurface;
  page?: number;
  limit?: number;
  entry?: ShoppingEntry;
  catalog?: ShoppingScopeCatalog;
  userId?: string | null;
  recentViews?: DiscoveryRecentView[];
  recentQueries?: string[];
}): Promise<ShoppingDiscoveryFeedResult> {
  const surface: ShoppingDiscoverySurface =
    args.surface === 'home_hot_deals' ? 'home_hot_deals' : 'browse_products';
  const requestedLimit = clampSearchLimit(args.limit, 20);
  const requestedPage =
    Number.isFinite(Number(args.page)) && Number(args.page)! > 0
      ? Math.floor(Number(args.page))
      : 1;
  const entry =
    args.entry && SHOPPING_ENTRY_VALUES.has(args.entry)
      ? args.entry
      : 'plp';
  const catalog: ShoppingScopeCatalog =
    args.catalog === 'promo_pool' || args.catalog === 'category' || args.catalog === 'global'
      ? args.catalog
      : surface === 'home_hot_deals'
        ? 'promo_pool'
        : 'global';
  const userId = String(args.userId || '').trim() || null;
  const recentViews = (Array.isArray(args.recentViews) ? args.recentViews : [])
    .map((item) => normalizeDiscoveryRecentView(item))
    .filter(Boolean)
    .slice(0, 50) as DiscoveryRecentView[];
  const recentQueries = normalizeRecentQueries(
    Array.isArray(args.recentQueries) && args.recentQueries.length
      ? args.recentQueries
      : readRecentQueries(userId),
  );

  const data = await callGateway({
    operation: 'get_discovery_feed',
    payload: {
      surface,
      response_detail: 'card',
      page: requestedPage,
      limit: requestedLimit,
      context: {
        recent_views: recentViews,
        recent_queries: recentQueries,
        auth_state: userId ? 'authenticated' : 'anonymous',
        locale: getBrowserLanguage() || 'en-US',
      },
    },
    metadata: {
      entry,
      scope: {
        catalog,
      },
    },
  });

  const products = ((data as any).products || []).map(
    (p: RealAPIProduct | ProductResponse) => normalizeProduct(p),
  );
  const metadata =
    data && typeof data === 'object' && data.metadata && typeof (data as any).metadata === 'object'
      ? ((data as any).metadata as Record<string, any>)
      : {};
  const responsePageRaw = Number((data as any)?.page);
  const responsePageSizeRaw = Number((data as any)?.page_size ?? (data as any)?.pageSize);
  const responseTotalRaw = Number((data as any)?.total);
  const responseHasMore = (data as any)?.has_more;
  const responseHasMoreAlt = (data as any)?.hasMore;
  const page = Number.isFinite(responsePageRaw) && responsePageRaw > 0
    ? Math.floor(responsePageRaw)
    : requestedPage;
  const pageSize = Number.isFinite(responsePageSizeRaw) && responsePageSizeRaw >= 0
    ? Math.floor(responsePageSizeRaw)
    : products.length;
  const total =
    Number.isFinite(responseTotalRaw) && responseTotalRaw >= 0
      ? Math.floor(responseTotalRaw)
      : undefined;
  const hasMore =
    typeof metadata.has_more === 'boolean'
      ? metadata.has_more
      : typeof responseHasMore === 'boolean'
        ? responseHasMore
        : typeof responseHasMoreAlt === 'boolean'
          ? responseHasMoreAlt
          : typeof total === 'number'
            ? page * requestedLimit < total
            : products.length >= requestedLimit;

  return {
    products,
    metadata,
    page_info: {
      page,
      page_size: pageSize,
      ...(typeof total === 'number' ? { total } : {}),
      has_more: hasMore,
    },
  };
}

// Generic product list (Hot Deals, history, etc.)
export async function getAllProducts(
  limit = 20,
  merchantIdOverride?: string,
  options?: {
    page?: number;
    entry?: ShoppingEntry;
    catalog?: ShoppingScopeCatalog;
    userId?: string | null;
    recentViews?: DiscoveryRecentView[];
    recentQueries?: string[];
  },
): Promise<ProductResponse[]> {
  const merchantId = String(merchantIdOverride || '').trim() || undefined;
  const requestedLimit = clampSearchLimit(limit, 20);
  const page =
    Number.isFinite(Number(options?.page)) && Number(options?.page)! > 0
      ? Math.floor(Number(options?.page))
      : 1;
  const entry =
    options?.entry && SHOPPING_ENTRY_VALUES.has(options.entry)
      ? options.entry
      : 'plp';
  const catalog: ShoppingScopeCatalog =
    options?.catalog === 'promo_pool' || options?.catalog === 'category' || options?.catalog === 'global'
      ? options.catalog
      : 'global';
  const userId = String(options?.userId || '').trim() || null;

  if (!merchantId) {
    const surface: ShoppingDiscoverySurface =
      catalog === 'promo_pool' ? 'home_hot_deals' : 'browse_products';
    const result = await getShoppingDiscoveryFeed({
      surface,
      page,
      limit: requestedLimit,
      entry,
      catalog,
      userId,
      recentViews: options?.recentViews,
      recentQueries: options?.recentQueries,
    });
    return result.products.slice(0, requestedLimit);
  }

  // Merchant-scoped empty browse still uses product search; generic rails above
  // route through discovery so user behavior can influence the starting query.
  const upstreamLimit =
    !merchantId && entry === 'plp'
      ? Math.max(requestedLimit, BROWSE_DISCOVERY_MIN_LIMIT)
      : requestedLimit;

  const searchPayload = {
    search: {
      in_stock_only: false,
      query: '',
      limit: upstreamLimit,
      page,
      allow_external_seed: true,
      allow_stale_cache: false,
      external_seed_strategy: 'unified_relevance',
      ...(merchantId
        ? { merchant_id: merchantId, search_all_merchants: false }
        : { search_all_merchants: true }),
    },
  };

  const data = await callGateway({
    operation: 'find_products_multi',
    payload: searchPayload as any,
    metadata: {
      entry,
      scope: {
        catalog,
      },
    },
  });

  const products = (data as any).products || [];
  return products.map((p: RealAPIProduct | ProductResponse) =>
    normalizeProduct(p),
  ).slice(0, requestedLimit);
}

export async function getSimilarProductsMainline(args: {
  product_id: string;
  merchant_id?: string | null;
  limit?: number;
  exclude_items?: Array<{
    product_id: string;
    merchant_id?: string | null;
  }>;
  timeout_ms?: number;
  cache_bypass?: boolean;
}): Promise<SimilarProductsMainlineResult> {
  const productId = String(args.product_id || '').trim();
  if (!productId) {
    throw new Error('product_id is required');
  }

  const limit = Math.max(1, Math.min(Number(args.limit || 6) || 6, 30));
  const excludeItems = (Array.isArray(args.exclude_items) ? args.exclude_items : [])
    .map((item) => {
      const excludedProductId = String(item?.product_id || '').trim();
      if (!excludedProductId) return null;
      const excludedMerchantId = String(item?.merchant_id || '').trim();
      return {
        product_id: excludedProductId,
        ...(excludedMerchantId ? { merchant_id: excludedMerchantId } : {}),
      };
    })
    .filter(Boolean) as Array<{ product_id: string; merchant_id?: string }>;

  const data = await callGatewayWithTimeout(
    {
      operation: 'find_similar_products',
      payload: {
        product_id: productId,
        ...(args.merchant_id ? { merchant_id: String(args.merchant_id).trim() } : {}),
        limit,
        ...(excludeItems.length ? { exclude_items: excludeItems } : {}),
        options: {
          ...(args.cache_bypass ? { cache_bypass: true } : {}),
        },
      },
    },
    args.timeout_ms,
  );

  const rawProducts = Array.isArray((data as any)?.products) ? (data as any).products : [];
  const metadata = normalizeRecommendationsMetadata((data as any)?.metadata);
  const pageRaw = Number((data as any)?.page);
  const pageSizeRaw = Number((data as any)?.page_size);
  const totalRaw = Number((data as any)?.total);
  const responseHasMore =
    typeof (data as any)?.has_more === 'boolean'
      ? (data as any).has_more
      : typeof metadata?.has_more === 'boolean'
        ? metadata.has_more
        : false;

  return {
    strategy: String((data as any)?.strategy || 'related_products').trim() || 'related_products',
    items: rawProducts
      .map((item: any) => normalizeRecommendationItem(item))
      .filter(Boolean) as RecommendationsData['items'],
    metadata,
    page_info: {
      page: Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1,
      page_size: Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.floor(pageSizeRaw) : rawProducts.length,
      ...(Number.isFinite(totalRaw) && totalRaw >= 0 ? { total: Math.floor(totalRaw) } : {}),
      has_more: responseHasMore,
    },
  };
}

export async function getProductDetailExact(args: {
  product_id: string;
  merchant_id: string;
  timeout_ms?: number;
}): Promise<ProductResponse | null> {
  const productId = String(args.product_id || '').trim();
  const merchantId = String(args.merchant_id || '').trim();
  if (!productId || !merchantId) return null;

  try {
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
      args.timeout_ms,
    );

    const product = (data as any)?.product;
    if (!product) return null;

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

    return normalizeProduct(enriched) as ProductResponse;
  } catch {
    return null;
  }
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
      ? ['offers', 'variant_selector', 'active_ingredients', 'ingredients_inci', 'how_to_use', 'product_details', 'reviews_preview']
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
  const allowBroadScan = options?.allowBroadScan === true;
  const timeoutMs = options?.timeout_ms;
  const useConfiguredMerchantId = options?.useConfiguredMerchantId !== false;
  const throwOnError = options?.throwOnError === true;
  const includeReviewSummary = options?.includeReviewSummary === true;

  // Try to resolve merchant_id, then use identifier search. Broad catalog scans are opt-in only.
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
    const searchAndFind = async (query: string, limit = SEARCH_LIMIT_MAX) => {
      const data = await callGatewayWithTimeout(
        {
          operation: 'find_products_multi',
          payload: {
            search: {
              query,
              limit: clampSearchLimit(limit, SEARCH_LIMIT_MAX),
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
    const first = await searchAndFind(productId, SEARCH_LIMIT_MAX);
    found = first.found;
    candidates = first.candidates;

    if (!found && candidates.length === 0 && allowBroadScan) {
      const broad = await searchAndFind('', SEARCH_LIMIT_MAX);
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
  const checkoutContext = getCheckoutContext()
  const resolvedSource = resolveGatewaySource({
    operation: 'create_order',
    requestMetadata: {},
    checkoutContext,
  })
  const data = await callGateway({
    operation: 'create_order',
    payload: {
      order: {
        ...orderData,
        metadata: buildCheckoutOrderMetadata({
          metadata: orderData.metadata,
          resolvedSource,
        }),
      },
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
      status: { order_id: orderId },
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
  merchant_id?: string | null;
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

export async function listMyOrders(
  cursor?: string | null,
  limit = 20,
  filters?: { merchant_id?: string | null },
  request?: { timeout_ms?: number; aurora_recovery?: 'auto' | 'off' },
) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (cursor) params.set('cursor', cursor);
  const merchantId = String(filters?.merchant_id || '').trim();
  if (merchantId) params.set('merchant_id', merchantId);
  return callAccounts(`/orders/list?${params.toString()}`, {
    timeout_ms: request?.timeout_ms,
    aurora_recovery: request?.aurora_recovery,
  });
}

export async function getAccountOrder(orderId: string) {
  return callAccounts(`/orders/${encodeURIComponent(orderId)}`);
}

export async function cancelAccountOrder(orderId: string, reason?: string) {
  return callAccounts(`/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: "POST",
    body: reason ? JSON.stringify({ reason }) : undefined,
  });
}

export async function getAccountOrderTracking(orderId: string) {
  return callAccounts(`/orders/${encodeURIComponent(orderId)}/tracking`);
}

export type AccountOrderRefundItemInput = {
  item_id?: string;
  quantity?: number;
  amount_minor?: number;
};

export type AccountOrderRefundInput = {
  amount_minor?: number;
  amount?: number;
  currency?: string;
  reason?: string;
  items?: AccountOrderRefundItemInput[];
};

export async function requestAccountOrderRefund(
  orderId: string,
  payload: AccountOrderRefundInput,
) {
  return callAccounts(`/orders/${encodeURIComponent(orderId)}/refund`, {
    method: "POST",
    body: JSON.stringify(payload || {}),
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

export type BrowseHistoryEventInput = {
  product_id: string;
  merchant_id?: string | null;
  title?: string | null;
  price?: number | null;
  currency?: string | null;
  image_url?: string | null;
  description?: string | null;
  viewed_at?: string | null;
};

export type BrowseHistoryItem = {
  product_id: string;
  merchant_id?: string | null;
  title: string;
  price: number;
  currency: string;
  image_url: string;
  description?: string | null;
  timestamp: number;
  viewed_at: string;
};

export type BrowseHistoryListResult = {
  items: BrowseHistoryItem[];
  total: number;
};

export async function recordBrowseHistoryEvent(
  payload: BrowseHistoryEventInput,
): Promise<BrowseHistoryItem | null> {
  const productId = String(payload.product_id || '').trim();
  if (!productId) return null;
  try {
    const res = (await callAccounts('/browse-history/events', {
      method: 'POST',
      cache: 'no-store',
      body: JSON.stringify({
        product_id: productId,
        merchant_id: payload.merchant_id == null ? null : String(payload.merchant_id).trim() || null,
        title: payload.title == null ? null : String(payload.title),
        price:
          typeof payload.price === 'number' && Number.isFinite(payload.price)
            ? payload.price
            : null,
        currency: payload.currency == null ? null : String(payload.currency),
        image_url: payload.image_url == null ? null : String(payload.image_url),
        description: payload.description == null ? null : String(payload.description),
        viewed_at: payload.viewed_at == null ? null : String(payload.viewed_at),
      }),
    })) as any;
    return (res?.item as BrowseHistoryItem) || null;
  } catch (err: any) {
    if (isUnauthenticatedAccountsError(err)) return null;
    throw err;
  }
}

export async function getBrowseHistory(limit = 50): Promise<BrowseHistoryListResult> {
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
  const params = new URLSearchParams({ limit: String(normalizedLimit) });
  try {
    const res = (await callAccounts(`/browse-history?${params.toString()}`, {
      cache: 'no-store',
    })) as any;
    return {
      items: Array.isArray(res?.items) ? (res.items as BrowseHistoryItem[]) : [],
      total: Number.isFinite(Number(res?.total))
        ? Number(res.total)
        : Array.isArray(res?.items)
          ? res.items.length
          : 0,
    };
  } catch (err: any) {
    if (isUnauthenticatedAccountsError(err)) return { items: [], total: 0 };
    throw err;
  }
}

export async function clearBrowseHistory(): Promise<{ status?: string; deleted?: number }> {
  try {
    const res = (await callAccounts('/browse-history', {
      method: 'DELETE',
      cache: 'no-store',
    })) as any;
    return {
      status: typeof res?.status === 'string' ? res.status : undefined,
      deleted: Number.isFinite(Number(res?.deleted)) ? Number(res.deleted) : undefined,
    };
  } catch (err: any) {
    if (isUnauthenticatedAccountsError(err)) return { status: 'unauthenticated', deleted: 0 };
    throw err;
  }
}
