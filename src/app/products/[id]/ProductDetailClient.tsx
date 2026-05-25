'use client';

import { useCallback, useEffect, useMemo, useState, useRef, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import { getCheckoutContextFromBrowser } from '@/lib/checkoutToken';
import { hideProductRouteLoading } from '@/lib/productRouteLoading';
import {
  getPdpV2,
  getPdpV2Personalization,
  recordBrowseHistoryEvent,
  resolveProductCandidates,
  type ProductResponse,
  type UgcCapabilities,
} from '@/lib/api';
import { mapPdpV2ToPdpPayload } from '@/features/pdp/adapter/mapPdpV2ToPdpPayload';
import { isBeautyProduct } from '@/features/pdp/utils/isBeautyProduct';
import { BeautyPDPContainer } from '@/features/pdp/containers/BeautyPDPContainer';
import { GenericPDPContainer } from '@/features/pdp/containers/GenericPDPContainer';
import { FashionPDPContainer } from '@/features/pdp/containers/FashionPDPContainer';
import { ElectronicsPDPContainer } from '@/features/pdp/containers/ElectronicsPDPContainer';
import { ProductDetailLoading } from '@/features/pdp/components/ProductDetailLoading';
import type { PDPPayload, Variant } from '@/features/pdp/types';
import { pdpTracking } from '@/features/pdp/tracking';
import { findMatchingOfferVariant } from '@/features/pdp/utils/offerVariantMatching';
import {
  isExternalAgentEntry,
  resolveExternalAgentHomeUrl,
  safeReturnUrl,
} from '@/lib/returnUrl';
import {
  buildProductHref,
  inferCanonicalPdpMerchantId,
  isPivotaSignatureRouteId,
  isPublicProductGroupRouteId,
  isProductGroupRouteId,
  normalizeProductRouteMerchantId,
} from '@/lib/productHref';
import { readBrandName } from '@/lib/productCardTitle';
import { DEFAULT_MODULE_SOURCE_LOCKS } from '@/features/pdp/state/freezePolicy';
import {
  mapResolvedOffersToSellerCandidates,
} from '@/lib/pdpResolvedOffers';
import {
  pickHistoryImage,
  upsertLocalBrowseHistory,
} from '@/lib/browseHistoryStorage';
import {
  extractMoneyCurrency,
  extractPositivePriceAmount,
  extractPositivePriceFromProductLike,
} from '@/lib/price';

interface Props {
  params: Promise<{ id: string }>;
  initialPayload?: PDPPayload | null;
}

const PDP_V2_SCOPED_TIMEOUT_MS = 9000;
const PDP_V2_UNSCOPED_TIMEOUT_MS = 9000;
const PDP_V2_CORE_ONLY_RETRY_TIMEOUT_MS = 3500;
const PDP_CORE_ONLY_INCLUDE = [
  'offers',
  'variant_selector',
  'product_overview',
] as const;
const PDP_INITIAL_INCLUDE = [...PDP_CORE_ONLY_INCLUDE] as const;
const PDP_CONTENT_INCLUDE = [
  'product_intel',
  'active_ingredients',
  'ingredients_inci',
  'how_to_use',
  'product_overview',
  'product_facts',
  'supplemental_details',
  'reviews_preview',
] as const;
const PDP_CONTENT_MODULE_TYPES = new Set<string>(PDP_CONTENT_INCLUDE);
const PDP_SIMILAR_INCLUDE = ['similar'] as const;
const PDP_V2_CONTENT_TIMEOUT_MS = 15000;
const PDP_V2_SIMILAR_TIMEOUT_MS = 9000;
const PDP_SIMILAR_DEFERRED_RETRY_DELAY_MS = 900;
const PDP_SIMILAR_DEFERRED_AUTO_RETRY_MAX = 1;

function buildPublicUgcCapabilities(caps?: UgcCapabilities | null): UgcCapabilities {
  return {
    canUploadMedia: true,
    canWriteReview: true,
    canRateReview: true,
    canAskQuestion: true,
    reasons: caps?.reasons?.rating ? { rating: caps.reasons.rating } : {},
    review: caps?.review || null,
  };
}

function extractMoneyAmount(value: any): number {
  return extractPositivePriceAmount(value);
}

function resolveBrowseHistoryPrice(pdpPayload: PDPPayload, product: any, productId: string, merchantId?: string): number {
  return extractPositivePriceFromProductLike(
    {
      product,
      offers: Array.isArray((pdpPayload as any)?.offers) ? (pdpPayload as any).offers : [],
      modules: Array.isArray((pdpPayload as any)?.modules) ? (pdpPayload as any).modules : [],
    },
    { productId, merchantId },
  );
}

function normalizeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

function buildExternalRedirectNotice(url: string): string {
  const fallback = 'Redirecting to external website in a new tab…';

  try {
    const u = new URL(url);
    const token = u.searchParams.get('token') || '';
    if (token) {
      const payloadPart = token.split('.')[0] || '';
      const decoded = decodeBase64UrlJson(payloadPart);
      const dest = decoded && typeof decoded.dest === 'string' ? decoded.dest : '';
      if (dest) {
        try {
          const host = new URL(dest).hostname;
          return host ? `Redirecting to ${host} in a new tab…` : fallback;
        } catch {
          return fallback;
        }
      }
    }

    const host = u.hostname;
    return host ? `Redirecting to ${host} in a new tab…` : fallback;
  } catch {
    return fallback;
  }
}

function decodeBase64UrlJson(input: string): Record<string, unknown> | null {
  if (!input) return null;
  try {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = atob(padded);
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function getExternalRedirectUrlFromOffer(offer: unknown): string | null {
  if (!offer || typeof offer !== 'object') return null;
  const typed = offer as any;
  const direct =
    normalizeHttpUrl(typed.external_redirect_url) ||
    normalizeHttpUrl(typed.externalRedirectUrl) ||
    normalizeHttpUrl(typed.affiliate_url) ||
    normalizeHttpUrl(typed.affiliateUrl) ||
    normalizeHttpUrl(typed.external_url) ||
    normalizeHttpUrl(typed.externalUrl) ||
    normalizeHttpUrl(typed.redirect_url) ||
    normalizeHttpUrl(typed.redirectUrl);
  if (direct) return direct;
  const action = typed.action;
  if (action && typeof action === 'object') {
    const actionUrl =
      normalizeHttpUrl((action as any).redirect_url) ||
      normalizeHttpUrl((action as any).redirectUrl) ||
      normalizeHttpUrl((action as any).url) ||
      normalizeHttpUrl((action as any).href);
    if (actionUrl) return actionUrl;
  }
  if (!isExternalOfferRoute(typed)) return null;
  return (
    normalizeHttpUrl(typed.merchant_checkout_url) ||
    normalizeHttpUrl(typed.merchantCheckoutUrl) ||
    normalizeHttpUrl(typed.checkout_url) ||
    normalizeHttpUrl(typed.checkoutUrl) ||
    normalizeHttpUrl(typed.purchase_url) ||
    normalizeHttpUrl(typed.purchaseUrl) ||
    normalizeHttpUrl(typed.url) ||
    normalizeHttpUrl(typed.product_url) ||
    normalizeHttpUrl(typed.productUrl) ||
    normalizeHttpUrl(typed.destination_url) ||
    normalizeHttpUrl(typed.destinationUrl) ||
    normalizeHttpUrl(typed.canonical_url) ||
    normalizeHttpUrl(typed.canonicalUrl) ||
    normalizeHttpUrl(typed.source_url) ||
    normalizeHttpUrl(typed.sourceUrl)
  );
}

function getExternalRedirectUrlFromProduct(product: unknown): string | null {
  if (!product || typeof product !== 'object') return null;
  const typed = product as any;
  const direct =
    normalizeHttpUrl(typed.external_redirect_url) ||
    normalizeHttpUrl(typed.externalRedirectUrl) ||
    normalizeHttpUrl(typed.affiliate_url) ||
    normalizeHttpUrl(typed.affiliateUrl) ||
    normalizeHttpUrl(typed.external_url) ||
    normalizeHttpUrl(typed.externalUrl) ||
    normalizeHttpUrl(typed.redirect_url) ||
    normalizeHttpUrl(typed.redirectUrl);
  if (direct) return direct;

  const merchantId = String(typed.merchant_id || typed.merchantId || '').trim().toLowerCase();
  const source = String(typed.source || typed.product_source || typed.productSource || '').trim().toLowerCase();
  const platform = String(typed.platform || '').trim().toLowerCase();
  const purchaseRoute = String(typed.purchase_route || typed.purchaseRoute || '').trim().toLowerCase();
  const commerceMode = String(typed.commerce_mode || typed.commerceMode || '').trim().toLowerCase();
  const isExternalSeed =
    merchantId === 'external_seed' ||
    source === 'external_seed' ||
    source === 'external_product_seeds' ||
    platform === 'external' ||
    ['affiliate_outbound', 'merchant_site', 'external_redirect', 'links_out'].includes(purchaseRoute) ||
    ['links_out', 'affiliate_outbound', 'merchant_site'].includes(commerceMode);
  if (!isExternalSeed) return null;
  return (
    normalizeHttpUrl(typed.destination_url) ||
    normalizeHttpUrl(typed.destinationUrl) ||
    normalizeHttpUrl(typed.canonical_url) ||
    normalizeHttpUrl(typed.canonicalUrl) ||
    normalizeHttpUrl(typed.source_url) ||
    normalizeHttpUrl(typed.sourceUrl) ||
    normalizeHttpUrl(typed.url) ||
    normalizeHttpUrl(typed.product_url) ||
    normalizeHttpUrl(typed.productUrl)
  );
}

function isExternalOfferRoute(offer: unknown): boolean {
  if (!offer || typeof offer !== 'object') return false;
  const typed = offer as any;
  const purchaseRoute = String(typed.purchase_route || typed.purchaseRoute || '').trim().toLowerCase();
  const commerceMode = String(typed.commerce_mode || typed.commerceMode || '').trim().toLowerCase();
  const checkoutHandoff = String(typed.checkout_handoff || typed.checkoutHandoff || '').trim().toLowerCase();
  return (
    ['affiliate_outbound', 'merchant_site', 'external_redirect', 'links_out'].includes(purchaseRoute) ||
    ['links_out', 'affiliate_outbound', 'merchant_site'].includes(commerceMode) ||
    checkoutHandoff === 'redirect'
  );
}

function isExternalCtaTarget(args: {
  offer: unknown;
  product: unknown;
  merchantId: string;
  redirectUrl: string | null;
}): boolean {
  if (args.redirectUrl) return true;
  if (isExternalOfferRoute(args.offer)) return true;
  const merchantId = String(args.merchantId || '').trim().toLowerCase();
  if (merchantId === 'external_seed') return true;
  const product = args.product && typeof args.product === 'object' ? (args.product as any) : null;
  if (!product) return false;
  const source = String(product.source || product.product_source || product.productSource || '').trim().toLowerCase();
  const platform = String(product.platform || '').trim().toLowerCase();
  return source === 'external_seed' || source === 'external_product_seeds' || platform === 'external';
}

function normalizeOfferSelectedOptions(value: unknown): Variant['options'] | undefined {
  if (Array.isArray(value)) {
    const options = value
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const name = String((item as any).name || '').trim();
        const optionValue = String((item as any).value || '').trim();
        if (!name || !optionValue) return null;
        return { name, value: optionValue };
      })
      .filter(Boolean) as NonNullable<Variant['options']>;
    return options.length ? options : undefined;
  }

  if (value && typeof value === 'object') {
    const options = Object.entries(value as Record<string, unknown>)
      .map(([name, optionValue]) => {
        const normalizedName = String(name || '').trim();
        const normalizedValue = String(optionValue || '').trim();
        if (!normalizedName || !normalizedValue) return null;
        return { name: normalizedName, value: normalizedValue };
      })
      .filter(Boolean) as NonNullable<Variant['options']>;
    return options.length ? options : undefined;
  }

  return undefined;
}

function resolveOfferVariantForCheckout(args: {
  variant: Variant;
  offer: any | null;
  product: PDPPayload['product'];
  merchantId: string;
  productId: string;
}): Variant | null {
  const matchedOfferVariant = findMatchingOfferVariant(args.offer, args.variant);
  if (matchedOfferVariant) {
    return matchedOfferVariant;
  }

  const offerVariantId = String(
    args.offer?.variant_id ||
      args.offer?.variantId ||
      args.offer?.selected_variant_id ||
      args.offer?.selectedVariantId ||
      args.offer?.platform_variant_id ||
      args.offer?.platformVariantId ||
      args.offer?.shopify_variant_id ||
      args.offer?.shopifyVariantId ||
      args.offer?.sku_id ||
      args.offer?.skuId ||
      '',
  ).trim();
  if (offerVariantId) {
    const offerSelectedOptions = normalizeOfferSelectedOptions(
      args.offer?.selected_options ||
        args.offer?.selectedOptions ||
        args.offer?.variant_options ||
        args.offer?.variantOptions ||
        args.offer?.options,
    );
    const offerVariantTitle = String(
      args.offer?.variant_title || args.offer?.variantTitle || '',
    ).trim();
    return {
      ...args.variant,
      variant_id: offerVariantId,
      ...(offerVariantTitle ? { title: offerVariantTitle } : {}),
      ...(offerSelectedOptions ? { options: offerSelectedOptions } : {}),
      sku_id: String(args.offer?.sku_id || args.offer?.skuId || args.variant.sku_id || '').trim() || undefined,
    };
  }

  const sameMerchant = args.merchantId === String(args.product.merchant_id || '').trim();
  const sameProduct = args.productId === String(args.product.product_id || '').trim();
  if (sameMerchant && sameProduct) return args.variant;

  const variants = Array.isArray(args.product.variants) ? args.product.variants : [];
  if (variants.length <= 1) {
    return {
      ...args.variant,
      variant_id: args.productId || args.variant.variant_id,
    };
  }
  return null;
}

function isRecommendationModuleType(type: unknown): boolean {
  return type === 'recommendations' || type === 'similar';
}

function hasModuleType(response: PDPPayload | null, type: string): boolean {
  if (!response || !Array.isArray(response.modules)) return false;
  return response.modules.some((m) => String(m?.type || '').trim() === type);
}

function hasAnyModuleType(response: PDPPayload | null, types: Set<string>): boolean {
  if (!response || !Array.isArray(response.modules)) return false;
  return response.modules.some((m) => types.has(String(m?.type || '').trim()));
}

function hasModule(response: PDPPayload | null, type: 'reviews_preview' | 'recommendations'): boolean {
  if (!response || !Array.isArray(response.modules)) return false;
  if (type === 'recommendations') {
    return response.modules.some((m) => isRecommendationModuleType(m?.type));
  }
  return hasModuleType(response, type);
}

function hasRecommendationsItems(response: PDPPayload | null): boolean {
  if (!response || !Array.isArray(response.modules)) return false;
  return response.modules.some((m) => {
    if (!isRecommendationModuleType(m?.type)) return false;
    const items = (m as any)?.data?.items;
    return Array.isArray(items) && items.length > 0;
  });
}

function getRecommendationModule(response: PDPPayload | null) {
  if (!response || !Array.isArray(response.modules)) return null;
  return response.modules.find((m) => isRecommendationModuleType(m?.type)) || null;
}

function isDeferredSimilarPayload(response: PDPPayload | null): boolean {
  const recommendationModule = getRecommendationModule(response);
  const data = (recommendationModule as any)?.data || null;
  const metadata = data && typeof data === 'object' ? (data as any).metadata || {} : {};
  const status = String((data as any)?.status || metadata?.similar_status || '').trim().toLowerCase();
  const reasonCode = String((data as any)?.reason_code || metadata?.reason_code || '').trim().toUpperCase();
  const items = Array.isArray((data as any)?.items) ? (data as any).items : [];
  return (
    items.length === 0 &&
    (status === 'deferred' ||
      reasonCode === 'SIMILAR_DEFERRED_FIRST_PAINT' ||
      reasonCode === 'SIMILAR_DEFERRED_BACKGROUND_LOAD')
  );
}

function isRetryableEmptySimilarPayload(response: PDPPayload | null): boolean {
  const recommendationModule = getRecommendationModule(response);
  const data = (recommendationModule as any)?.data || null;
  const metadata = data && typeof data === 'object' ? (data as any).metadata || {} : {};
  const status = String((data as any)?.status || metadata?.similar_status || '').trim().toLowerCase();
  const items = Array.isArray((data as any)?.items) ? (data as any).items : [];
  const cacheBypassed = (metadata as any)?.similar_cache_bypass === true;
  return (
    items.length === 0 &&
    !cacheBypassed &&
    (status === 'empty' || status === 'unavailable' || status === 'underfilled')
  );
}

function prepareLoadedPdpPayload(assembled: PDPPayload) {
  const offerRows = Array.isArray((assembled as any).offers) ? (assembled as any).offers : [];
  const expectedOffersCount = Number((assembled as any).offers_count);
  const hasReviewsModule = hasModule(assembled, 'reviews_preview');
  const hasSimilarModule = hasModule(assembled, 'recommendations');
  const hasRecommendations = hasRecommendationsItems(assembled);
  const similarModule = Array.isArray(assembled.modules)
    ? assembled.modules.find((m) => isRecommendationModuleType(m?.type))
    : null;
  const similarItems = Array.isArray((similarModule as any)?.data?.items)
    ? (similarModule as any).data.items
    : [];

  const nextPayload = { ...assembled } as PDPPayload;
  delete (nextPayload as any).x_offers_state;
  delete (nextPayload as any).x_reviews_state;
  delete (nextPayload as any).x_recommendations_state;

  return {
    payload: {
      ...nextPayload,
      ...(offerRows.length > 0 || Number.isFinite(expectedOffersCount)
        ? { x_offers_state: 'ready' as const }
        : {}),
      ...(hasReviewsModule ? { x_reviews_state: 'ready' as const } : {}),
      x_recommendations_state: hasSimilarModule ? 'ready' as const : 'loading' as const,
      x_source_locks: {
        reviews: hasReviewsModule,
        similar: hasSimilarModule,
        ugc: false,
      },
    },
    sourceLocks: {
      ...DEFAULT_MODULE_SOURCE_LOCKS,
      reviews: hasReviewsModule,
      similar: hasSimilarModule,
    },
    offerRows,
    expectedOffersCount,
    hasReviewsModule,
    hasSimilarModule,
    hasRecommendations,
    similarCount: similarItems.length,
  };
}

function setSimilarLoadState(payload: PDPPayload, state: 'loading' | 'error'): PDPPayload {
  return {
    ...payload,
    x_recommendations_state: state,
    x_source_locks: {
      ...(payload.x_source_locks || {}),
      similar: false,
    },
  };
}

function mergeSimilarPdpPayload(
  current: PDPPayload,
  incoming: PDPPayload | null,
  options: { deferredAsLoading?: boolean; keepSimilarLoading?: boolean } = {},
): PDPPayload {
  const nextSimilarModule =
    incoming?.modules.find((pdpModule) => isRecommendationModuleType(pdpModule?.type)) || null;
  const incomingBundleModule =
    incoming?.modules.find((pdpModule) => String(pdpModule?.type || '').trim() === 'bundle_composition') || null;
  const existingBundleModule =
    current.modules.find((pdpModule) => String(pdpModule?.type || '').trim() === 'bundle_composition') || null;
  const baseModules = current.modules.filter((pdpModule) => {
    const type = String(pdpModule?.type || '').trim();
    return type !== 'recommendations' && type !== 'similar' && type !== 'bundle_composition';
  });
  const nextBundleModule = incomingBundleModule || existingBundleModule;
  return {
    ...current,
    modules: [
      ...baseModules,
      ...(nextBundleModule ? [nextBundleModule] : []),
      ...(nextSimilarModule ? [nextSimilarModule] : []),
    ],
    x_recommendations_state:
      options.keepSimilarLoading ||
      (options.deferredAsLoading && isDeferredSimilarPayload(incoming))
        ? 'loading'
        : 'ready',
    x_source_locks: {
      ...(current.x_source_locks || {}),
      similar: Boolean(
        nextSimilarModule &&
          !options.keepSimilarLoading &&
          !(options.deferredAsLoading && isDeferredSimilarPayload(incoming)),
      ),
    },
  };
}

function mergeContentPdpPayload(current: PDPPayload, incoming: PDPPayload | null): PDPPayload {
  const incomingContentModules = Array.isArray(incoming?.modules)
    ? incoming.modules.filter((pdpModule) => PDP_CONTENT_MODULE_TYPES.has(String(pdpModule?.type || '').trim()))
    : [];
  if (incomingContentModules.length === 0) return current;

  const incomingTypes = new Set(
    incomingContentModules.map((pdpModule) => String(pdpModule?.type || '').trim()),
  );
  const baseModules = current.modules.filter((pdpModule) => {
    const type = String(pdpModule?.type || '').trim();
    return !incomingTypes.has(type);
  });
  const hasReviewsModule = incomingTypes.has('reviews_preview');

  return {
    ...current,
    modules: [...baseModules, ...incomingContentModules],
    ...(hasReviewsModule ? { x_reviews_state: 'ready' as const } : {}),
    x_source_locks: {
      ...(current.x_source_locks || {}),
      ...(hasReviewsModule ? { reviews: true } : {}),
    },
  };
}

function mapSellerCandidatesFromResolveCandidates(
  resolved: Awaited<ReturnType<typeof resolveProductCandidates>>,
): ProductResponse[] {
  const offers = Array.isArray(resolved?.offers) ? resolved.offers : [];
  return offers.reduce<ProductResponse[]>((candidates, offer) => {
    const merchantId = String(offer?.merchant_id || '').trim();
    const productId = String(offer?.product_id || '').trim();
    if (!merchantId || !productId) return candidates;

    const rawPrice = offer?.price;
    const price = extractMoneyAmount(rawPrice);
    const currency = extractMoneyCurrency(rawPrice);
    const inventory = offer?.inventory;

    candidates.push({
      product_id: productId,
      merchant_id: merchantId,
      merchant_name: String(offer?.merchant_name || '').trim() || undefined,
      title: 'Seller option',
      description: '',
      price,
      currency,
      image_url: '/placeholder.svg',
      category: 'General',
      in_stock:
        typeof inventory?.in_stock === 'boolean'
          ? inventory.in_stock
          : (Number(inventory?.available_quantity || 0) || 0) > 0,
    });

    return candidates;
  }, []);
}

function readApiErrorCode(err: unknown): string {
  if (!err || typeof err !== 'object') return '';
  const code = (err as any)?.code;
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

function isNonRetryablePdpError(err: unknown): boolean {
  const code = readApiErrorCode(err);
  if (!code) return false;
  return new Set([
    'PRODUCT_NOT_FOUND',
    'PRODUCT_NOT_SERVABLE',
    'NOT_FOUND',
    'VALIDATION_ERROR',
    'INVALID_ARGUMENT',
    'BAD_REQUEST',
    'UNSUPPORTED_INCLUDE',
  ]).has(code);
}

function shouldRetryWithCoreOnlyPdp(err: unknown): boolean {
  const code = readApiErrorCode(err);
  if (isNonRetryablePdpError(err)) return false;
  if (
    new Set([
      'UPSTREAM_TIMEOUT',
      'TEMPORARY_UNAVAILABLE',
      'SERVICE_UNAVAILABLE',
      'GATEWAY_TIMEOUT',
      'TOO_MANY_REQUESTS',
      'BAD_GATEWAY',
    ]).has(code)
  ) {
    return true;
  }

  const message = String((err as Error)?.message || '').toLowerCase();
  return message.includes('timed out') || message.includes('timeout') || message.includes('temporarily unavailable');
}
export default function ProductDetailPage({ params, initialPayload }: Props) {
  const { id: rawId } = use(params);
  // Next.js dynamic params arrive URL-encoded (e.g. `ulta%3Ahash`); gateway
  // lookups (external_product_id, source_product_id) want the decoded form.
  const id = ((): string => {
    const trimmed = String(rawId || '').trim();
    if (!trimmed) return '';
    try {
      return decodeURIComponent(trimmed);
    } catch {
      return trimmed;
    }
  })();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const rawMerchantIdParam = searchParams.get('merchant_id');
  const merchantIdParam = normalizeProductRouteMerchantId(rawMerchantIdParam, id);
  const pdpOverride = (searchParams.get('pdp') || '').toLowerCase();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;
  const initialLoadState = initialPayload ? prepareLoadedPdpPayload(initialPayload) : null;
  const hasInitialPayload = Boolean(initialLoadState);

  const [pdpPayload, setPdpPayload] = useState<PDPPayload | null>(() => initialLoadState?.payload ?? null);
  const [sellerCandidates, setSellerCandidates] = useState<ProductResponse[] | null>(null);
  const [loading, setLoading] = useState(() => !hasInitialPayload);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const localBrowseHistoryRecordedRef = useRef<string | null>(null);
  const remoteBrowseHistoryRecordedRef = useRef<string | null>(null);
  const moduleSourceLocksRef = useRef(initialLoadState?.sourceLocks ?? { ...DEFAULT_MODULE_SOURCE_LOCKS });
  const similarLoadSeqRef = useRef(0);
  const similarAutoLoadKeyRef = useRef<string | null>(null);
  const contentAutoLoadKeyRef = useRef<string | null>(null);
  const similarDeferredRetryCountRef = useRef(0);
  const similarDeferredRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ugcCapabilities, setUgcCapabilities] = useState<UgcCapabilities | null>(() => buildPublicUgcCapabilities());

  const { addItem, open } = useCartStore();
  const inferredMerchantId = inferCanonicalPdpMerchantId(id, merchantIdParam);
  const routeIsProductGroup = isProductGroupRouteId(id);
  const routeIsPivotaSignature = isPivotaSignatureRouteId(id);
  const currentPdpProductId = String(pdpPayload?.product?.product_id || '').trim();
  const currentPdpProductGroupId = String(pdpPayload?.product_group_id || '').trim();
  const hasHydratedProductIntel = hasModuleType(pdpPayload, 'product_intel');
  const clearSimilarDeferredRetryTimer = useCallback(() => {
    if (similarDeferredRetryTimerRef.current) {
      clearTimeout(similarDeferredRetryTimerRef.current);
      similarDeferredRetryTimerRef.current = null;
    }
  }, []);
  const loadSimilarModule = useCallback(
    async (trigger: 'auto' | 'auto_retry' | 'retry' = 'auto') => {
      const explicitMerchantId = inferredMerchantId ? String(inferredMerchantId).trim() : null;
      const requestSeq = similarLoadSeqRef.current + 1;
      similarLoadSeqRef.current = requestSeq;
      clearSimilarDeferredRetryTimer();
      if (trigger === 'retry') {
        similarDeferredRetryCountRef.current = 0;
      }

      setPdpPayload((current) => (current ? setSimilarLoadState(current, 'loading') : current));

      const startedAt = Date.now();
      try {
        const v2 = await getPdpV2({
          product_id: id,
          ...(routeIsProductGroup
            ? { subject: { type: 'product_group' as const, id } }
            : explicitMerchantId
              ? { merchant_id: explicitMerchantId }
              : {}),
          include: [...PDP_SIMILAR_INCLUDE],
          timeout_ms: PDP_V2_SIMILAR_TIMEOUT_MS,
          similar_mode: trigger === 'retry' ? 'retry' : 'post_core',
          cache_bypass: trigger === 'auto_retry' || trigger === 'retry',
        });
        if (similarLoadSeqRef.current !== requestSeq) return;
        const assembled = mapPdpV2ToPdpPayload(v2);
        const deferred = isDeferredSimilarPayload(assembled);
        const retryableEmpty = isRetryableEmptySimilarPayload(assembled);
        const shouldAutoRetrySimilar =
          (deferred || retryableEmpty) &&
          trigger !== 'retry' &&
          similarDeferredRetryCountRef.current < PDP_SIMILAR_DEFERRED_AUTO_RETRY_MAX;
        setPdpPayload((current) => {
          if (!current) return current;
          const nextPayload = mergeSimilarPdpPayload(current, assembled, {
            deferredAsLoading: shouldAutoRetrySimilar,
            keepSimilarLoading: shouldAutoRetrySimilar,
          });
          moduleSourceLocksRef.current = {
            ...moduleSourceLocksRef.current,
            similar: Boolean(
              hasModule(nextPayload, 'recommendations') &&
                nextPayload.x_recommendations_state === 'ready',
            ),
          };
          return nextPayload;
        });
        if (!deferred && !retryableEmpty) {
          similarDeferredRetryCountRef.current = 0;
        }
        if (shouldAutoRetrySimilar) {
          const retryAttempt = similarDeferredRetryCountRef.current + 1;
          similarDeferredRetryCountRef.current = retryAttempt;
          similarDeferredRetryTimerRef.current = setTimeout(() => {
            similarDeferredRetryTimerRef.current = null;
            void loadSimilarModule('auto_retry');
          }, PDP_SIMILAR_DEFERRED_RETRY_DELAY_MS * retryAttempt);
        }
        pdpTracking.track('pdp_module_ready', {
          module: 'similar',
          source:
            trigger === 'retry'
              ? 'get_pdp_v2_similar_retry'
              : trigger === 'auto_retry'
                ? 'get_pdp_v2_similar_auto_retry'
                : 'get_pdp_v2_similar',
          latency_ms: Date.now() - startedAt,
          has_items: hasRecommendationsItems(assembled),
          deferred,
          retryable_empty: retryableEmpty,
        });
      } catch (similarErr) {
        if (similarLoadSeqRef.current !== requestSeq) return;
        moduleSourceLocksRef.current = {
          ...moduleSourceLocksRef.current,
          similar: false,
        };
        setPdpPayload((current) => (current ? setSimilarLoadState(current, 'error') : current));
        pdpTracking.track('pdp_module_error', {
          module: 'similar',
          source: trigger === 'retry' ? 'get_pdp_v2_similar_retry' : 'get_pdp_v2_similar',
          latency_ms: Date.now() - startedAt,
          error_code: readApiErrorCode(similarErr) || null,
          error_message: (similarErr as Error)?.message || null,
        });
      }
    },
    [clearSimilarDeferredRetryTimer, id, inferredMerchantId, routeIsProductGroup],
  );
  const handleRetrySimilar = useCallback(() => {
    void loadSimilarModule('retry');
  }, [loadSimilarModule]);

  useEffect(() => {
    // Preserve the checkout-token handoff that used to happen as a side effect of
    // getPdpV2 -> callGateway -> getCheckoutContext when no SSR payload existed.
    getCheckoutContextFromBrowser();
  }, []);

  useEffect(() => {
    if (!initialPayload) return;
    clearSimilarDeferredRetryTimer();
    similarLoadSeqRef.current += 1;
    similarAutoLoadKeyRef.current = null;
    contentAutoLoadKeyRef.current = null;
    similarDeferredRetryCountRef.current = 0;
    const nextLoadState = prepareLoadedPdpPayload(initialPayload);
    moduleSourceLocksRef.current = nextLoadState.sourceLocks;
    setPdpPayload(nextLoadState.payload);
    setSellerCandidates(null);
    setLoading(false);
    setError(null);
  }, [clearSimilarDeferredRetryTimer, id, initialPayload, merchantIdParam]);

  useEffect(() => {
    return () => {
      clearSimilarDeferredRetryTimer();
    };
  }, [clearSimilarDeferredRetryTimer]);

  useEffect(() => {
    const currentPayload = pdpPayload;
    const productId = String(currentPayload?.product?.product_id || '').trim();
    if (!productId) return;
    if (hasModule(currentPayload, 'recommendations')) return;
    if (currentPayload?.x_recommendations_state === 'error') return;
    const merchantId = String(currentPayload?.product?.merchant_id || merchantIdParam || '').trim();
    const productGroupId = String(currentPayload?.product_group_id || '').trim();
    const autoLoadKey = [id, productId, merchantId, productGroupId].join('::');
    if (similarAutoLoadKeyRef.current === autoLoadKey) return;
    similarAutoLoadKeyRef.current = autoLoadKey;
    void loadSimilarModule('auto');
  }, [
    id,
    loadSimilarModule,
    merchantIdParam,
    pdpPayload,
    pdpPayload?.product?.product_id,
    pdpPayload?.product_group_id,
    pdpPayload?.x_recommendations_state,
  ]);

  useEffect(() => {
    const productId = currentPdpProductId;
    if (!productId) return;
    if (hasHydratedProductIntel) return;
    const explicitMerchantId = inferredMerchantId ? String(inferredMerchantId).trim() : null;
    const productGroupId = currentPdpProductGroupId;
    const autoLoadKey = [id, productId, explicitMerchantId || '', productGroupId].join('::');
    if (contentAutoLoadKeyRef.current === autoLoadKey) return;
    contentAutoLoadKeyRef.current = autoLoadKey;

    let cancelled = false;
    const startedAt = Date.now();

    (async () => {
      try {
        const v2 = await getPdpV2({
          product_id: id,
          ...(routeIsProductGroup
            ? { subject: { type: 'product_group' as const, id } }
            : explicitMerchantId
              ? { merchant_id: explicitMerchantId }
              : {}),
          include: [...PDP_CONTENT_INCLUDE],
          timeout_ms: PDP_V2_CONTENT_TIMEOUT_MS,
        });
        if (cancelled) return;
        const assembled = mapPdpV2ToPdpPayload(v2);
        setPdpPayload((current) => {
          if (!current) return current;
          if (String(current.product?.product_id || '').trim() !== productId) return current;
          const nextPayload = mergeContentPdpPayload(current, assembled);
          moduleSourceLocksRef.current = {
            ...moduleSourceLocksRef.current,
            reviews: hasModule(nextPayload, 'reviews_preview'),
          };
          return nextPayload;
        });
        pdpTracking.track('pdp_module_ready', {
          module: 'pdp_content',
          source: 'get_pdp_v2_content',
          latency_ms: Date.now() - startedAt,
          has_content: hasAnyModuleType(assembled, PDP_CONTENT_MODULE_TYPES),
          has_reviews_module: hasModule(assembled, 'reviews_preview'),
        });
      } catch (contentErr) {
        if (cancelled) return;
        pdpTracking.track('pdp_module_error', {
          module: 'pdp_content',
          source: 'get_pdp_v2_content',
          latency_ms: Date.now() - startedAt,
          error_code: readApiErrorCode(contentErr) || null,
          error_message: (contentErr as Error)?.message || null,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    id,
    currentPdpProductGroupId,
    currentPdpProductId,
    hasHydratedProductIntel,
    inferredMerchantId,
    routeIsProductGroup,
  ]);

  useEffect(() => {
    if (loading && !error && !pdpPayload) return;
    hideProductRouteLoading();
  }, [loading, error, pdpPayload]);

  useEffect(() => {
    if (!rawMerchantIdParam) return;
    if (merchantIdParam) return;
    const nextParams = new URLSearchParams(searchParamsString);
    nextParams.delete('merchant_id');
    const nextQuery = nextParams.toString();
    router.replace(`/products/${encodeURIComponent(id)}${nextQuery ? `?${nextQuery}` : ''}`);
  }, [id, merchantIdParam, rawMerchantIdParam, router, searchParamsString]);

  useEffect(() => {
    const currentPayload = pdpPayload;
    if (!currentPayload) return;
    const product = (currentPayload as any)?.product;
    if (!product) return;

    const productId = String(product?.product_id || id || '').trim();
    if (!productId) return;
    const merchantId = String(product?.merchant_id || merchantIdParam || '').trim() || undefined;
    const recordKey = `${productId}::${merchantId || ''}`;
    if (localBrowseHistoryRecordedRef.current !== recordKey) {
      const nowMs = Date.now();
      const normalizedPrice = resolveBrowseHistoryPrice(currentPayload, product, productId, merchantId);
      const title = String(product?.title || 'Untitled product').trim() || 'Untitled product';
      const description = String(product?.description || '').trim() || undefined;
      const imageUrl = pickHistoryImage(product);
      const brand = readBrandName(product?.brand) || undefined;

      if (normalizedPrice > 0) {
        localBrowseHistoryRecordedRef.current = recordKey;
        upsertLocalBrowseHistory({
          product_id: productId,
          merchant_id: merchantId,
          title,
          ...(brand ? { brand } : {}),
          price: normalizedPrice,
          image: imageUrl,
          description,
          timestamp: nowMs,
        });
      }
    }

    if (!userId) return;

    const nowMs = Date.now();
    const normalizedPrice = resolveBrowseHistoryPrice(currentPayload, product, productId, merchantId);
    const rawPrice = product?.price;
    const currency = String(product?.currency || extractMoneyCurrency(rawPrice)).trim() || 'USD';
    const title = String(product?.title || 'Untitled product').trim() || 'Untitled product';
    const description = String(product?.description || '').trim() || undefined;
    const imageUrl = pickHistoryImage(product);
    const brand = readBrandName(product?.brand) || undefined;
    const remoteRecordKey = `${recordKey}::${userId}::${normalizedPrice > 0 ? normalizedPrice : 'missing'}`;
    if (remoteBrowseHistoryRecordedRef.current === remoteRecordKey) return;
    remoteBrowseHistoryRecordedRef.current = remoteRecordKey;

    void recordBrowseHistoryEvent({
      product_id: productId,
      merchant_id: merchantId,
      title,
      ...(brand ? { brand } : {}),
      price: normalizedPrice > 0 ? normalizedPrice : undefined,
      currency,
      image_url: imageUrl,
      description,
      viewed_at: new Date(nowMs).toISOString(),
    }).catch(() => {
      // keep local history as fallback even when account history API is unavailable
    });
  }, [pdpPayload, id, merchantIdParam, userId]);

  useEffect(() => {
    const productGroupId = String((pdpPayload as any)?.product_group_id || '').trim();
    if (routeIsProductGroup) return;
    const canonicalScope = String((pdpPayload as any)?.canonical_scope || '').trim();
    const distinctOfferMerchants = new Set(
      (Array.isArray((pdpPayload as any)?.offers) ? (pdpPayload as any).offers : [])
        .map((offer: any) => String(offer?.merchant_id || '').trim())
        .filter(Boolean),
    );
    const shouldCanonicalizeToGroup =
      !routeIsPivotaSignature &&
      (canonicalScope === 'multi_merchant_canonical' ||
        Number((pdpPayload as any)?.offers_count || 0) > 1 ||
        distinctOfferMerchants.size > 1);
    const product = (pdpPayload as any)?.product || {};
    const signatureId = String(product?.pivota_signature_id || product?.signature_id || '').trim();
    const targetRouteId =
      shouldCanonicalizeToGroup && isPublicProductGroupRouteId(productGroupId)
        ? productGroupId
        : !routeIsPivotaSignature && isPivotaSignatureRouteId(signatureId)
          ? signatureId
          : '';
    if (!targetRouteId || targetRouteId === id) return;
    const nextParams = new URLSearchParams(searchParamsString);
    nextParams.delete('merchant_id');
    const nextQuery = nextParams.toString();
    router.replace(`${buildProductHref(targetRouteId)}${nextQuery ? `?${nextQuery}` : ''}`);
  }, [id, pdpPayload, routeIsPivotaSignature, routeIsProductGroup, router, searchParamsString]);

  useEffect(() => {
    if (hasInitialPayload && reloadKey === 0) {
      // Skip cold-start fetch unless we have a checkout token. Token-scoped
      // PDP responses need the browser gateway call that carries X-Checkout-Token.
      const ctx = getCheckoutContextFromBrowser();
      if (!ctx.token) return;
    }

    let cancelled = false;
    const candidateTimeoutMs = 4500;
    const v2TimeoutMs = merchantIdParam
      ? PDP_V2_SCOPED_TIMEOUT_MS
      : PDP_V2_UNSCOPED_TIMEOUT_MS;

    const loadProduct = async () => {
      const explicitMerchantId = inferredMerchantId ? String(inferredMerchantId).trim() : null;
      const shouldResolveCandidates =
        !explicitMerchantId || Boolean(merchantIdParam);
      let candidateResolutionPromise: Promise<Awaited<ReturnType<typeof resolveProductCandidates>> | null> | null =
        null;
      const resolveCandidatesOnFailure = () => {
        if (!shouldResolveCandidates) return Promise.resolve(null);
        if (!candidateResolutionPromise) {
          candidateResolutionPromise = Promise.resolve()
            .then(() =>
              resolveProductCandidates({
                product_id: id,
                ...(explicitMerchantId ? { merchant_id: explicitMerchantId } : {}),
                limit: 12,
                include_offers: true,
                timeout_ms: candidateTimeoutMs,
              }),
            )
            .catch(() => null);
        }
        return candidateResolutionPromise;
      };

      setLoading(true);
      setError(null);
      setSellerCandidates(null);
      setPdpPayload(null);
      clearSimilarDeferredRetryTimer();
      similarLoadSeqRef.current += 1;
      similarAutoLoadKeyRef.current = null;
      contentAutoLoadKeyRef.current = null;
      similarDeferredRetryCountRef.current = 0;
      moduleSourceLocksRef.current = { ...DEFAULT_MODULE_SOURCE_LOCKS };

      const commitLoadedPdp = (
        assembled: PDPPayload,
        source: 'get_pdp_v2' | 'get_pdp_v2_core_retry',
        startedAt: number,
      ) => {
        const prepared = prepareLoadedPdpPayload(assembled);
        moduleSourceLocksRef.current = prepared.sourceLocks;
        setPdpPayload(prepared.payload);
        pdpTracking.track('pdp_core_ready', {
          source,
          latency_ms: Date.now() - startedAt,
          has_offers: prepared.offerRows.length > 0,
          offers_count: Number.isFinite(prepared.expectedOffersCount) ? prepared.expectedOffersCount : null,
          offers_loaded_count: prepared.offerRows.length,
          has_reviews_module: prepared.hasReviewsModule,
          has_similar_module: prepared.hasSimilarModule,
        });
        if (prepared.hasReviewsModule) {
          pdpTracking.track('pdp_module_ready', {
            module: 'reviews_preview',
            source,
          });
        }
        if (prepared.hasRecommendations) {
          pdpTracking.track('pdp_module_ready', {
            module: 'similar',
            source,
            count: prepared.similarCount,
          });
        }
        setLoading(false);
      };

      const fetchMappedPdp = async (request: {
        include: string[];
        timeoutMs: number;
        source: 'get_pdp_v2' | 'get_pdp_v2_core_retry';
      }) => {
        const startedAt = Date.now();
        const v2 = await getPdpV2({
          product_id: id,
          ...(routeIsProductGroup
            ? { subject: { type: 'product_group' as const, id } }
            : explicitMerchantId
              ? { merchant_id: explicitMerchantId }
              : {}),
          include: request.include,
          timeout_ms: request.timeoutMs,
        });
        if (cancelled) return;
        const assembled = mapPdpV2ToPdpPayload(v2);
        if (!assembled) throw new Error('Invalid PDP response');
        commitLoadedPdp(assembled, request.source, startedAt);
      };

      try {
        await fetchMappedPdp({
          include: [...PDP_INITIAL_INCLUDE],
          timeoutMs: v2TimeoutMs,
          source: 'get_pdp_v2',
        });
        return;
      } catch (v2Err) {
        if (cancelled) return;
        let loadErr: unknown = v2Err;

        if (shouldRetryWithCoreOnlyPdp(v2Err)) {
          try {
            await fetchMappedPdp({
              include: [...PDP_CORE_ONLY_INCLUDE],
              timeoutMs: PDP_V2_CORE_ONLY_RETRY_TIMEOUT_MS,
              source: 'get_pdp_v2_core_retry',
            });
            pdpTracking.track('pdp_core_retry_recovered', {
              initial_error_code: readApiErrorCode(v2Err) || null,
              initial_error_message: (v2Err as Error)?.message || null,
            });
            return;
          } catch (coreRetryErr) {
            if (cancelled) return;
            loadErr = coreRetryErr;
          }
        }

        if (readApiErrorCode(loadErr) === 'PRODUCT_NOT_SERVABLE') {
          setError('Product not available');
          setLoading(false);
          return;
        }

        const candidateResolution = await resolveCandidatesOnFailure();
        const candidateSellerOptions = mapResolvedOffersToSellerCandidates(candidateResolution);
        if (candidateSellerOptions.length > 1) {
          setSellerCandidates(candidateSellerOptions);
          setLoading(false);
          return;
        }

        const message =
          (loadErr as Error)?.message ||
          'Failed to load product';
        setError(message);
        setLoading(false);
      }
    };

    void loadProduct();
    return () => {
      cancelled = true;
    };
  }, [clearSimilarDeferredRetryTimer, hasInitialPayload, id, inferredMerchantId, merchantIdParam, reloadKey, routeIsProductGroup]);

  useEffect(() => {
    let cancelled = false;
    const productId = String(pdpPayload?.product?.product_id || '').trim();
    const productGroupId = String(pdpPayload?.product_group_id || '').trim() || null;

    if (!productId) return;
    setUgcCapabilities(buildPublicUgcCapabilities());
    if (!userId) {
      return;
    }

    (async () => {
      try {
        const res = await getPdpV2Personalization({
          productId,
          ...(productGroupId ? { productGroupId } : {}),
        });
        if (cancelled) return;
        const caps = res?.ugcCapabilities;
        if (!caps || typeof caps !== 'object') return;
        setUgcCapabilities(buildPublicUgcCapabilities(caps));
      } catch {
        // Keep the public contribution defaults.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdpPayload?.product?.product_id, pdpPayload?.product_group_id, userId]);

  useEffect(() => {
    if (!sellerCandidates?.length) return;
    pdpTracking.track('pdp_choose_seller_impression', {
      product_id: id,
      candidates_count: sellerCandidates.length,
    });
  }, [id, sellerCandidates]);

  const resolvedMode = useMemo<'beauty' | 'fashion' | 'electronics' | 'generic'>(() => {
    if (pdpOverride === 'beauty') return 'beauty';
    if (pdpOverride === 'generic') return 'generic';
    if (pdpOverride === 'fashion') return 'fashion';
    if (pdpOverride === 'electronics') return 'electronics';
    if (!pdpPayload) return 'generic';
    const explicitKind = pdpPayload.product.category_kind;
    if (explicitKind === 'beauty') return 'beauty';
    if (explicitKind === 'fashion' || explicitKind === 'electronics') {
      return explicitKind;
    }
    if (explicitKind === 'generic' && !isBeautyProduct(pdpPayload.product)) return 'generic';
    if (isBeautyProduct(pdpPayload.product)) return 'beauty';
    const taxonomy = [
      Array.isArray(pdpPayload.product.category_path) ? pdpPayload.product.category_path.join(' ') : '',
      pdpPayload.product.title || '',
      pdpPayload.product.subtitle || '',
      Array.isArray(pdpPayload.product.tags) ? pdpPayload.product.tags.join(' ') : '',
    ]
      .join(' ')
      .toLowerCase();
    if (
      /(electronic|phone|audio|computer|laptop|headphone|camera|gaming|smartwatch|console|tablet|tv\b|earbud|speaker|monitor|router)/.test(
        taxonomy,
      )
    ) {
      return 'electronics';
    }
    if (
      /(fashion|apparel|clothing|shoe|sneaker|boot|accessor|jewel|bag|outerwear|denim|lingerie|underwear|swim|dress|skirt|coat|jacket|sweater|hoodie|jean|pant|trouser|bra\b|panty|sock|hat\b|scarf|glove|belt\b|wear\b|women|men\b|kids)/.test(
        taxonomy,
      )
    ) {
      return 'fashion';
    }
    return 'generic';
  }, [pdpOverride, pdpPayload]);

  const handleAddToCart = ({
    variant,
    quantity,
    merchant_id,
    product_id,
    offer_id,
  }: {
    variant: Variant;
    quantity: number;
    merchant_id?: string;
    product_id?: string;
    offer_id?: string;
  }) => {
    if (!pdpPayload) return;
    void (async () => {
      const resolvedMerchantId =
        String(merchant_id || pdpPayload.product.merchant_id || '').trim();
      const resolvedProductId =
        String(product_id || '').trim() || String(pdpPayload.product.product_id || '').trim();

      if (!resolvedMerchantId || !resolvedProductId) {
        toast.error('This offer is missing merchant/product info.');
        return;
      }

      const offers = Array.isArray((pdpPayload as any)?.offers)
        ? ((pdpPayload as any).offers as any[])
        : [];
      const offer =
        offer_id && offers.length
          ? offers.find((o) => String(o?.offer_id || o?.offerId || '').trim() === String(offer_id))
          : null;
      const offerRedirectUrl = offer ? getExternalRedirectUrlFromOffer(offer) : null;
      const offerIsExternal = offer
        ? isExternalCtaTarget({
            offer,
            product: null,
            merchantId: resolvedMerchantId,
            redirectUrl: offerRedirectUrl,
          })
        : false;
      const payloadRedirectUrl =
        !offer || offerIsExternal ? getExternalRedirectUrlFromProduct(pdpPayload.product) : null;
      const redirectUrl = offerRedirectUrl || payloadRedirectUrl;
      const isExternal = offer
        ? isExternalCtaTarget({
            offer,
            product: null,
            merchantId: resolvedMerchantId,
            redirectUrl,
          })
        : isExternalCtaTarget({
            offer,
            product: pdpPayload.product,
            merchantId: resolvedMerchantId,
            redirectUrl,
          });

      if (isExternal) {
        if (redirectUrl) {
          toast.success(buildExternalRedirectNotice(redirectUrl));
          window.open(redirectUrl, '_blank', 'noopener,noreferrer');
          return;
        }

        toast.error('Merchant link is unavailable for this seller.');
        return;
      }

      const purchaseVariant = resolveOfferVariantForCheckout({
        variant,
        offer,
        product: pdpPayload.product,
        merchantId: resolvedMerchantId,
        productId: resolvedProductId,
      });

      if (!purchaseVariant) {
        toast.error('This seller doesn’t have the selected options. Try another offer.');
        return;
      }

      const selectedOptions =
        Array.isArray(purchaseVariant.options) && purchaseVariant.options.length > 0
          ? Object.fromEntries(purchaseVariant.options.map((o) => [o.name, o.value]))
          : undefined;

      const offerItemPrice = offer
        ? extractMoneyAmount(purchaseVariant.price) ||
          extractMoneyAmount(offer?.price) ||
          extractMoneyAmount(offer?.price_amount)
        : undefined;
      const offerCurrency = offer
        ? String(
            purchaseVariant.price?.current.currency ||
              offer?.price?.currency ||
              offer?.currency ||
              pdpPayload.product.price?.current.currency ||
              'USD',
          )
        : undefined;
      const offerShipping = offer
        ? Number(offer?.shipping?.cost?.amount ?? offer?.shipping_cost ?? offer?.shippingFee ?? 0)
        : 0;
      const displayPrice =
        offerItemPrice != null && offerItemPrice > 0
          ? offerItemPrice + offerShipping
          : extractMoneyAmount(purchaseVariant.price) || extractMoneyAmount(pdpPayload.product.price);

      const resolvedVariantId = String(purchaseVariant.variant_id || '').trim() || resolvedProductId;
      const cartItemId = `${resolvedMerchantId}:${resolvedVariantId}`;

      addItem({
        id: cartItemId,
        product_id: resolvedProductId,
        variant_id: resolvedVariantId,
        sku: purchaseVariant.sku_id,
        selected_options: selectedOptions,
        title: pdpPayload.product.title,
        price: displayPrice,
        currency:
          offerCurrency || purchaseVariant.price?.current.currency || pdpPayload.product.price?.current.currency || 'USD',
        imageUrl: purchaseVariant.image_url || pdpPayload.product.image_url || '/placeholder.svg',
        merchant_id: resolvedMerchantId,
        offer_id: offer_id ? String(offer_id) : undefined,
        quantity,
      });
      toast.success(`✓ Added ${quantity}x ${pdpPayload.product.title} to cart!`);
      open();
    })();
  };

  const handleBuyNow = ({
    variant,
    quantity,
    merchant_id,
    product_id,
    offer_id,
  }: {
    variant: Variant;
    quantity: number;
    merchant_id?: string;
    product_id?: string;
    offer_id?: string;
  }) => {
    if (!pdpPayload) return;
    void (async () => {
      const resolvedMerchantId =
        String(merchant_id || pdpPayload.product.merchant_id || '').trim();
      const resolvedProductId =
        String(product_id || '').trim() || String(pdpPayload.product.product_id || '').trim();

      const offers = Array.isArray((pdpPayload as any)?.offers)
        ? ((pdpPayload as any).offers as any[])
        : [];
      const offer =
        offer_id && offers.length
          ? offers.find((o) => String(o?.offer_id || o?.offerId || '').trim() === String(offer_id))
          : null;

      const offerRedirectUrl = offer ? getExternalRedirectUrlFromOffer(offer) : null;
      const offerIsExternal = offer
        ? isExternalCtaTarget({
            offer,
            product: null,
            merchantId: resolvedMerchantId,
            redirectUrl: offerRedirectUrl,
          })
        : false;
      const payloadRedirectUrl =
        !offer || offerIsExternal ? getExternalRedirectUrlFromProduct(pdpPayload.product) : null;
      const redirectUrl = offerRedirectUrl || payloadRedirectUrl;
      const isExternal = offer
        ? isExternalCtaTarget({
            offer,
            product: null,
            merchantId: resolvedMerchantId,
            redirectUrl,
          })
        : isExternalCtaTarget({
            offer,
            product: pdpPayload.product,
            merchantId: resolvedMerchantId,
            redirectUrl,
          });

      if (isExternal) {
        if (redirectUrl) {
          toast.success(buildExternalRedirectNotice(redirectUrl));
          window.open(redirectUrl, '_blank', 'noopener,noreferrer');
          return;
        }

        toast.error('Merchant link is unavailable for this seller.');
        return;
      }

      if (!resolvedMerchantId || !resolvedProductId) {
        toast.error('This offer is missing merchant/product info.');
        return;
      }

      const purchaseVariant = resolveOfferVariantForCheckout({
        variant,
        offer,
        product: pdpPayload.product,
        merchantId: resolvedMerchantId,
        productId: resolvedProductId,
      });

      if (!purchaseVariant) {
        toast.error('This seller doesn’t have the selected options. Try another offer.');
        return;
      }

      const selectedOptions =
        Array.isArray(purchaseVariant.options) && purchaseVariant.options.length > 0
          ? Object.fromEntries(purchaseVariant.options.map((o) => [o.name, o.value]))
          : undefined;

      const offerItemPrice = offer
        ? extractMoneyAmount(purchaseVariant.price) ||
          extractMoneyAmount(offer?.price) ||
          extractMoneyAmount(offer?.price_amount)
        : undefined;

      const checkoutItems = [
        {
          product_id: resolvedProductId,
          merchant_id: resolvedMerchantId,
          title: pdpPayload.product.title,
          quantity,
          unit_price:
            offerItemPrice != null && offerItemPrice > 0
              ? offerItemPrice
              : extractMoneyAmount(purchaseVariant.price) || extractMoneyAmount(pdpPayload.product.price),
          currency:
            String(
              purchaseVariant.price?.current.currency ||
                offer?.price?.currency ||
                offer?.currency ||
                purchaseVariant.price?.current.currency ||
                pdpPayload.product.price?.current.currency ||
                'USD',
            ),
          image_url: purchaseVariant.image_url || pdpPayload.product.image_url || '/placeholder.svg',
          variant_id: purchaseVariant.variant_id,
          sku: purchaseVariant.sku_id,
          selected_options: selectedOptions,
          offer_id: offer_id ? String(offer_id) : undefined,
        },
      ];
      const params = new URLSearchParams();
      params.set('items', JSON.stringify(checkoutItems));

      const explicitReturnRaw =
        String(
          searchParams.get('return') ||
            searchParams.get('return_url') ||
            searchParams.get('returnUrl') ||
            '',
        ).trim();
      const explicitReturn = safeReturnUrl(explicitReturnRaw);
      const entryFromQuery = String(searchParams.get('entry') || '').trim();

      if (explicitReturn) {
        params.set('return', explicitReturn);
      } else if (isExternalAgentEntry(entryFromQuery)) {
        const externalHome = resolveExternalAgentHomeUrl(entryFromQuery);
        if (externalHome) params.set('return', externalHome);
      }

      const passthroughKeys = [
        'embed',
        'entry',
        'parent_origin',
        'parentOrigin',
        'aurora_uid',
        'lang',
        'source',
      ];
      for (const key of passthroughKeys) {
        const value = String(searchParams.get(key) || '').trim();
        if (!value) continue;
        if (!params.has(key)) params.set(key, value);
      }

      router.push(`/order?${params.toString()}`);
    })();
  };

  const handleWriteReview = () => {
    if (!pdpPayload) return;
    const params = new URLSearchParams();
    params.set('product_id', pdpPayload.product.product_id);
    if (pdpPayload.product.merchant_id) params.set('merchant_id', pdpPayload.product.merchant_id);

    const explicitReturn =
      searchParams.get('return') ||
      searchParams.get('return_url') ||
      searchParams.get('returnUrl') ||
      '';
    const embedFromQuery = String(searchParams.get('embed') || '').trim() === '1';
    const entryFromQuery = String(searchParams.get('entry') || '').trim().toLowerCase();
    const isEmbed = embedFromQuery || isExternalAgentEntry(entryFromQuery);
    if (explicitReturn.trim()) {
      params.set('return', explicitReturn.trim());
    } else if (!isEmbed && typeof window !== 'undefined') {
      params.set('return', `${window.location.pathname}${window.location.search}`);
    }

    const passthroughKeys = ['embed', 'entry', 'parent_origin', 'parentOrigin'];
    for (const key of passthroughKeys) {
      const value = String(searchParams.get(key) || '').trim();
      if (!value) continue;
      if (!params.has(key)) params.set(key, value);
    }

    router.push(`/reviews/write?${params.toString()}`);
  };

  if (loading && !pdpPayload) {
    return <ProductDetailLoading label="Loading products" />;
  }

  if (!loading && !pdpPayload && sellerCandidates?.length) {
    const sorted = [...sellerCandidates].sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card/70 backdrop-blur p-6">
          <div className="text-lg font-semibold">Choose a seller</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Multiple sellers match this product. Select one to continue.
          </div>
          <div className="mt-4 space-y-3">
            {sorted.map((candidate) => {
              const merchantId = String(candidate.merchant_id || '').trim();
              const label = candidate.merchant_name || merchantId || 'Unknown seller';
              return (
                <button
                  key={`${merchantId}:${candidate.product_id}`}
                  type="button"
                  className="w-full rounded-2xl border border-border bg-white/60 hover:bg-white/80 transition-colors px-4 py-3 text-left disabled:opacity-60"
                  onClick={() => {
                    if (!merchantId) return;
                    pdpTracking.track('pdp_choose_seller_select', {
                      product_id: id,
                      merchant_id: merchantId,
                    });
                    router.push(buildProductHref(id, merchantId));
                  }}
                  disabled={!merchantId}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{label}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{merchantId}</div>
                    </div>
                    <div className="text-sm font-semibold">
                      {new Intl.NumberFormat(undefined, {
                        style: 'currency',
                        currency: candidate.currency || 'USD',
                      }).format(Number(candidate.price) || 0)}
                    </div>
                  </div>
                  {candidate.in_stock === false ? (
                    <div className="mt-2 text-xs text-red-600">Out of stock</div>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="mt-4 text-xs text-muted-foreground">
            This prevents selecting the wrong seller when <code>merchant_id</code> is missing.
          </div>
        </div>
      </div>
    );
  }

  if (error || !pdpPayload) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card/70 backdrop-blur p-6 text-center">
          <div className="text-lg font-semibold">Failed to load product</div>
          <div className="mt-2 text-sm text-muted-foreground">{error || 'Product unavailable'}</div>
          <div className="mt-4">
            <button
              className="text-sm font-medium text-primary"
              onClick={() => {
                setLoading(true);
                setPdpPayload(null);
                setError(null);
                setSellerCandidates(null);
                setReloadKey((k) => k + 1);
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const Container =
    resolvedMode === 'beauty'
      ? BeautyPDPContainer
      : resolvedMode === 'fashion'
        ? FashionPDPContainer
        : resolvedMode === 'electronics'
          ? ElectronicsPDPContainer
          : GenericPDPContainer;

  return (
    <div className="min-h-screen bg-background">
      <main className="px-0 py-0">
        <Container
          payload={pdpPayload}
          onAddToCart={handleAddToCart}
          onBuyNow={handleBuyNow}
          onWriteReview={handleWriteReview}
          onRetrySimilar={handleRetrySimilar}
          ugcCapabilities={ugcCapabilities}
        />
      </main>
    </div>
  );
}
