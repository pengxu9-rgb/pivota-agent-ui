'use client';

import { useEffect, useMemo, useState, useRef, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import { hideProductRouteLoading } from '@/lib/productRouteLoading';
import {
  getPdpV2,
  getPdpV2Personalization,
  recordBrowseHistoryEvent,
  resolveProductCandidates,
  type GetPdpV2Response,
  type ProductResponse,
  type UgcCapabilities,
} from '@/lib/api';
import { mapPdpV2ToPdpPayload } from '@/features/pdp/adapter/mapPdpV2ToPdpPayload';
import { isBeautyProduct } from '@/features/pdp/utils/isBeautyProduct';
import { BeautyPDPContainer } from '@/features/pdp/containers/BeautyPDPContainer';
import { GenericPDPContainer } from '@/features/pdp/containers/GenericPDPContainer';
import { ProductDetailLoading } from '@/features/pdp/components/ProductDetailLoading';
import type { Module, PDPPayload, Variant } from '@/features/pdp/types';
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
  normalizeProductRouteMerchantId,
} from '@/lib/productHref';
import {
  DEFAULT_MODULE_SOURCE_LOCKS,
  upsertLockedModule,
} from '@/features/pdp/state/freezePolicy';
import {
  mapResolvedOffersToSellerCandidates,
} from '@/lib/pdpResolvedOffers';
import {
  pickHistoryImage,
  upsertLocalBrowseHistory,
} from '@/lib/browseHistoryStorage';

interface Props {
  params: Promise<{ id: string }>;
}

const PDP_V2_SCOPED_TIMEOUT_MS = 9000;
const PDP_V2_UNSCOPED_TIMEOUT_MS = 9000;
const PDP_V2_CORE_ONLY_RETRY_TIMEOUT_MS = 3500;
const PDP_CORE_ONLY_INCLUDE: string[] = [];

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

function hasModule(response: PDPPayload | null, type: 'reviews_preview' | 'recommendations'): boolean {
  if (!response || !Array.isArray(response.modules)) return false;
  if (type === 'recommendations') {
    return response.modules.some((m) => isRecommendationModuleType(m?.type));
  }
  return response.modules.some((m) => m?.type === type);
}

function hasRecommendationsItems(response: PDPPayload | null): boolean {
  if (!response || !Array.isArray(response.modules)) return false;
  return response.modules.some((m) => {
    if (!isRecommendationModuleType(m?.type)) return false;
    const items = (m as any)?.data?.items;
    return Array.isArray(items) && items.length > 0;
  });
}

const PDP_INITIAL_INCLUDE = [
  'offers',
  'variant_selector',
  'product_intel',
  'active_ingredients',
  'ingredients_inci',
  'how_to_use',
  'product_overview',
  'supplemental_details',
  'reviews_preview',
  'similar',
] as const;

function mapSellerCandidatesFromResolveCandidates(
  resolved: Awaited<ReturnType<typeof resolveProductCandidates>>,
): ProductResponse[] {
  const offers = Array.isArray(resolved?.offers) ? resolved.offers : [];
  return offers.reduce<ProductResponse[]>((candidates, offer) => {
    const merchantId = String(offer?.merchant_id || '').trim();
    const productId = String(offer?.product_id || '').trim();
    if (!merchantId || !productId) return candidates;

    const rawPrice = offer?.price;
    const price =
      typeof rawPrice === 'number'
        ? rawPrice
        : Number(rawPrice?.amount ?? 0) || 0;
    const currency =
      typeof rawPrice === 'object' && rawPrice
        ? String(rawPrice.currency || 'USD').trim() || 'USD'
        : 'USD';
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
    'NOT_FOUND',
    'VALIDATION_ERROR',
    'INVALID_ARGUMENT',
    'BAD_REQUEST',
    'UNSUPPORTED_INCLUDE',
  ]).has(code);
}

function isUnavailableModuleErrorCode(code: string): boolean {
  if (!code) return false;
  return new Set([
    'UNSUPPORTED_INCLUDE',
    'UNSUPPORTED_MODULE',
    'MODULE_UNAVAILABLE',
    'MODULE_NOT_AVAILABLE',
    'FEATURE_DISABLED',
    'NOT_IMPLEMENTED',
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
export default function ProductDetailPage({ params }: Props) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const rawMerchantIdParam = searchParams.get('merchant_id');
  const merchantIdParam = normalizeProductRouteMerchantId(rawMerchantIdParam);
  const pdpOverride = (searchParams.get('pdp') || '').toLowerCase();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;

  const [pdpPayload, setPdpPayload] = useState<PDPPayload | null>(null);
  const [sellerCandidates, setSellerCandidates] = useState<ProductResponse[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadedViaPdpV2, setLoadedViaPdpV2] = useState(false);
  const offersFetchKeyRef = useRef<string | null>(null);
  const reviewsFetchKeyRef = useRef<string | null>(null);
  const similarFetchKeyRef = useRef<string | null>(null);
  const localBrowseHistoryRecordedRef = useRef<string | null>(null);
  const remoteBrowseHistoryRecordedRef = useRef<string | null>(null);
  const moduleSourceLocksRef = useRef({ ...DEFAULT_MODULE_SOURCE_LOCKS });
  const [ugcCapabilities, setUgcCapabilities] = useState<UgcCapabilities | null>({
    canUploadMedia: false,
    canWriteReview: false,
    canAskQuestion: false,
    reasons: {
      upload: 'NOT_AUTHENTICATED',
      review: 'NOT_AUTHENTICATED',
      question: 'NOT_AUTHENTICATED',
    },
  });

  const { addItem, open } = useCartStore();
  const inferredMerchantId = inferCanonicalPdpMerchantId(id, merchantIdParam);
  const progressiveMerchantId = String(
    merchantIdParam ||
      pdpPayload?.selected_commerce_ref?.merchant_id ||
      pdpPayload?.product?.merchant_id ||
      '',
  ).trim();
  const progressiveProductId = String(
    (merchantIdParam ? id : null) ||
      pdpPayload?.selected_commerce_ref?.product_id ||
      pdpPayload?.product?.product_id ||
      id ||
      '',
  ).trim();
  const offersLoadState = pdpPayload?.x_offers_state;
  const reviewsLoadState = pdpPayload?.x_reviews_state;
  const similarLoadState = pdpPayload?.x_recommendations_state;

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
    const product = (pdpPayload as any)?.product;
    if (!product) return;

    const productId = String(product?.product_id || id || '').trim();
    if (!productId) return;
    const merchantId = String(product?.merchant_id || merchantIdParam || '').trim() || undefined;
    const recordKey = `${productId}::${merchantId || ''}`;
    if (localBrowseHistoryRecordedRef.current !== recordKey) {
      localBrowseHistoryRecordedRef.current = recordKey;

      const nowMs = Date.now();
      const rawPrice = product?.price;
      const normalizedPrice =
        typeof rawPrice === 'number'
          ? rawPrice
          : typeof rawPrice === 'string'
            ? Number(rawPrice) || 0
            : Number(rawPrice?.amount) || 0;
      const title = String(product?.title || 'Untitled product').trim() || 'Untitled product';
      const description = String(product?.description || '').trim() || undefined;
      const imageUrl = pickHistoryImage(product);

      upsertLocalBrowseHistory({
        product_id: productId,
        merchant_id: merchantId,
        title,
        price: normalizedPrice,
        image: imageUrl,
        description,
        timestamp: nowMs,
      });
    }

    if (!userId) return;

    const nowMs = Date.now();
    const rawPrice = product?.price;
    const normalizedPrice =
      typeof rawPrice === 'number'
        ? rawPrice
        : typeof rawPrice === 'string'
          ? Number(rawPrice) || 0
          : Number(rawPrice?.amount) || 0;
    const currency =
      String(product?.currency || rawPrice?.currency || 'USD').trim() || 'USD';
    const title = String(product?.title || 'Untitled product').trim() || 'Untitled product';
    const description = String(product?.description || '').trim() || undefined;
    const imageUrl = pickHistoryImage(product);
    const remoteRecordKey = `${recordKey}::${userId}`;
    if (remoteBrowseHistoryRecordedRef.current === remoteRecordKey) return;
    remoteBrowseHistoryRecordedRef.current = remoteRecordKey;

    void recordBrowseHistoryEvent({
      product_id: productId,
      merchant_id: merchantId,
      title,
      price: normalizedPrice,
      currency,
      image_url: imageUrl,
      description,
      viewed_at: new Date(nowMs).toISOString(),
    }).catch(() => {
      // keep local history as fallback even when account history API is unavailable
    });
  }, [pdpPayload, id, merchantIdParam, userId]);

  useEffect(() => {
    let cancelled = false;
    const candidateTimeoutMs = 4500;
    const v2TimeoutMs = merchantIdParam
      ? PDP_V2_SCOPED_TIMEOUT_MS
      : PDP_V2_UNSCOPED_TIMEOUT_MS;

    const loadProduct = async () => {
      const explicitMerchantId = inferredMerchantId ? String(inferredMerchantId).trim() : null;
      const shouldResolveCandidates =
        !explicitMerchantId || Boolean(merchantIdParam);
      const candidateResolutionPromise = shouldResolveCandidates
        ? Promise.resolve()
            .then(() =>
              resolveProductCandidates({
                product_id: id,
                ...(explicitMerchantId ? { merchant_id: explicitMerchantId } : {}),
                limit: 12,
                include_offers: true,
                timeout_ms: candidateTimeoutMs,
              }),
            )
            .catch(() => null)
        : Promise.resolve(null);

      setLoading(true);
      setError(null);
      setSellerCandidates(null);
      setPdpPayload(null);
      setLoadedViaPdpV2(false);
      offersFetchKeyRef.current = null;
      reviewsFetchKeyRef.current = null;
      similarFetchKeyRef.current = null;
      moduleSourceLocksRef.current = { ...DEFAULT_MODULE_SOURCE_LOCKS };

      const commitLoadedPdp = (
        assembled: PDPPayload,
        source: 'get_pdp_v2' | 'get_pdp_v2_core_retry',
        startedAt: number,
      ) => {
        const offerRows = Array.isArray((assembled as any).offers) ? (assembled as any).offers : [];
        const expectedOffersCount = Number((assembled as any).offers_count);
        const hasReviewsModule = hasModule(assembled, 'reviews_preview');
        const hasSimilarModule = hasModule(assembled, 'recommendations');
        const hasRecommendations = hasRecommendationsItems(assembled);
        const similarCount = Array.isArray(
          (assembled.modules.find((m) => isRecommendationModuleType(m?.type)) as any)?.data?.items,
        )
          ? (
              assembled.modules.find(
                (m) => isRecommendationModuleType(m?.type),
              ) as any
            ).data.items.length
          : 0;

        moduleSourceLocksRef.current = {
          ...DEFAULT_MODULE_SOURCE_LOCKS,
          reviews: hasReviewsModule,
          similar: hasSimilarModule,
        };

        setPdpPayload({
          ...assembled,
          ...(offerRows.length > 0 || Number.isFinite(expectedOffersCount)
            ? { x_offers_state: 'ready' as const }
            : {}),
          ...(hasReviewsModule ? { x_reviews_state: 'ready' as const } : {}),
          ...(hasSimilarModule ? { x_recommendations_state: 'ready' as const } : {}),
          x_source_locks: {
            reviews: hasReviewsModule,
            similar: hasSimilarModule,
            ugc: false,
          },
        });
        pdpTracking.track('pdp_core_ready', {
          source,
          latency_ms: Date.now() - startedAt,
          has_offers: offerRows.length > 0,
          offers_count: Number.isFinite(expectedOffersCount) ? expectedOffersCount : null,
          offers_loaded_count: offerRows.length,
          has_reviews_module: hasReviewsModule,
          has_similar_module: hasSimilarModule,
        });
        if (hasReviewsModule) {
          pdpTracking.track('pdp_module_ready', {
            module: 'reviews_preview',
            source,
          });
        }
        if (hasRecommendations) {
          pdpTracking.track('pdp_module_ready', {
            module: 'similar',
            source,
            count: similarCount,
          });
        }
        setLoadedViaPdpV2(true);
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
          ...(explicitMerchantId ? { merchant_id: explicitMerchantId } : {}),
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

        const candidateResolution = await candidateResolutionPromise;
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
  }, [id, inferredMerchantId, merchantIdParam, reloadKey]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!loadedViaPdpV2) return;
      if (offersLoadState !== 'loading') return;

      const merchantId = progressiveMerchantId;
      const productId = progressiveProductId;
      if (!merchantId || !productId) {
        setPdpPayload((prev) => (prev ? { ...prev, x_offers_state: 'error' } : prev));
        return;
      }

      const key = `${merchantId}:${productId}`;
      if (offersFetchKeyRef.current === key) return;
      offersFetchKeyRef.current = key;

      try {
        const v2 = await getPdpV2({
          product_id: productId,
          merchant_id: merchantId,
          include: ['offers'],
          timeout_ms: 8000,
        });
        if (cancelled) return;

        const assembled = mapPdpV2ToPdpPayload(v2);
        const offers = assembled && Array.isArray((assembled as any).offers) ? (assembled as any).offers : null;

        setPdpPayload((prev) => {
          if (!prev) return prev;
          if (!offers) return { ...prev, x_offers_state: 'error' };
          return {
            ...prev,
            offers,
            ...(assembled?.offers_count != null ? { offers_count: assembled.offers_count } : {}),
            ...(assembled?.default_offer_id ? { default_offer_id: assembled.default_offer_id } : {}),
            ...(assembled?.best_price_offer_id ? { best_price_offer_id: assembled.best_price_offer_id } : {}),
            ...(assembled?.product_group_id ? { product_group_id: assembled.product_group_id } : {}),
            x_offers_state: 'ready',
          };
        });
        pdpTracking.track('pdp_module_ready', {
          module: 'offers',
          source: 'get_pdp_v2_backfill',
          count: Array.isArray(offers) ? offers.length : 0,
        });
      } catch {
        if (cancelled) return;
        setPdpPayload((prev) => (prev ? { ...prev, x_offers_state: 'error' } : prev));
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    loadedViaPdpV2,
    offersLoadState,
    progressiveMerchantId,
    progressiveProductId,
  ]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!loadedViaPdpV2) return;
      if (reviewsLoadState !== 'loading') return;

      const buildEmptyReviewsModule = (): Module => ({
        module_id: 'reviews_preview',
        type: 'reviews_preview',
        priority: 50,
        title: 'Reviews',
        data: {
          scale: 5,
          rating: 0,
          review_count: 0,
          preview_items: [],
        },
      });

      const merchantId = progressiveMerchantId;
      const productId = progressiveProductId;
      if (!merchantId || !productId) {
        setPdpPayload((prev) => {
          if (!prev) return prev;
          const mergedReviews = upsertLockedModule({
            currentModules: prev.modules,
            type: 'reviews_preview',
            nextModule: buildEmptyReviewsModule(),
            locked: moduleSourceLocksRef.current.reviews,
          });
          moduleSourceLocksRef.current.reviews = mergedReviews.locked;
          return {
            ...prev,
            modules: mergedReviews.modules,
            x_reviews_state: 'ready',
            x_source_locks: {
              ...(prev.x_source_locks || {}),
              reviews: mergedReviews.locked,
            },
          };
        });
        return;
      }

      const key = `${merchantId}:${productId}:reviews_preview`;
      if (reviewsFetchKeyRef.current === key) return;
      reviewsFetchKeyRef.current = key;

      try {
        const backfillStartedAt = Date.now();
        const reviewsInitialTimeoutMs = 4200;

        const reviewOnlyV2 = await getPdpV2({
          product_id: productId,
          merchant_id: merchantId,
          include: ['reviews_preview'],
          timeout_ms: reviewsInitialTimeoutMs,
        }).then(
          (response) => ({ response, nonRetryable: false, code: '' }),
          (err) => ({
            response: null,
            nonRetryable: isNonRetryablePdpError(err),
            code: readApiErrorCode(err),
          }),
        );

        if (cancelled) return;

        let reviewsModule: Module | null = null;
        let reviewsRequestSucceeded = false;

        if (reviewOnlyV2.response) {
          reviewsRequestSucceeded = true;
          const reviewOnlyPayload = mapPdpV2ToPdpPayload(reviewOnlyV2.response);
          reviewsModule =
            reviewOnlyPayload && Array.isArray(reviewOnlyPayload.modules)
              ? (reviewOnlyPayload.modules.find((m) => m?.type === 'reviews_preview') as Module | undefined) || null
              : null;
        }

        const reviewModuleUnavailable =
          reviewOnlyV2.nonRetryable || isUnavailableModuleErrorCode(reviewOnlyV2.code);

        const normalizedReviewsModule =
          !reviewsModule ? buildEmptyReviewsModule() : reviewsModule;

        setPdpPayload((prev) => {
          if (!prev) return prev;
          const mergedReviews = upsertLockedModule({
            currentModules: prev.modules,
            type: 'reviews_preview',
            nextModule: normalizedReviewsModule as Module | null,
            locked: moduleSourceLocksRef.current.reviews,
          });
          moduleSourceLocksRef.current.reviews = mergedReviews.locked;
          return {
            ...prev,
            modules: mergedReviews.modules,
            x_reviews_state:
              normalizedReviewsModule || mergedReviews.locked || reviewsRequestSucceeded || reviewModuleUnavailable
                ? 'ready'
                : 'loading',
            x_source_locks: {
              ...(prev.x_source_locks || {}),
              reviews: mergedReviews.locked,
            },
          };
        });

        pdpTracking.track('pdp_module_ready', {
          module: 'reviews_preview',
          source: 'get_pdp_v2_reviews_backfill',
          frozen: moduleSourceLocksRef.current.reviews,
          reviews_request_succeeded: reviewsRequestSucceeded,
          backfill_phase_ms: Date.now() - backfillStartedAt,
        });
      } catch {
        if (cancelled) return;
        setPdpPayload((prev) => {
          if (!prev) return prev;
          const mergedReviews = upsertLockedModule({
            currentModules: prev.modules,
            type: 'reviews_preview',
            nextModule: buildEmptyReviewsModule(),
            locked: moduleSourceLocksRef.current.reviews,
          });
          moduleSourceLocksRef.current.reviews = mergedReviews.locked;
          return {
            ...prev,
            modules: mergedReviews.modules,
            x_reviews_state: 'ready',
            x_source_locks: {
              ...(prev.x_source_locks || {}),
              reviews: mergedReviews.locked,
            },
          };
        });
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    loadedViaPdpV2,
    reviewsLoadState,
    progressiveMerchantId,
    progressiveProductId,
  ]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!loadedViaPdpV2) return;
      if (similarLoadState !== 'loading') return;

      const merchantId = progressiveMerchantId;
      const productId = progressiveProductId;
      if (!merchantId || !productId) {
        setPdpPayload((prev) =>
          prev
            ? {
                ...prev,
                x_recommendations_state: 'ready',
              }
            : prev,
        );
        return;
      }

      const key = `${merchantId}:${productId}:similar`;
      if (similarFetchKeyRef.current === key) return;
      similarFetchKeyRef.current = key;

      try {
        const backfillStartedAt = Date.now();
        // Similar sits below the fold, so it can afford a wider recovery budget than core PDP modules.
        const backfillBudgetMs = 28000;
        const similarInitialTimeoutMs = 10500;
        const similarRetryTimeoutMs = 14000;
        const deadlineAt = Date.now() + backfillBudgetMs;
        const remainingMs = () => deadlineAt - Date.now();

        type ModuleFetchResult = {
          response: GetPdpV2Response | null;
          nonRetryable: boolean;
          code: string;
        };

        const fetchSimilarWithBudget = async (
          timeoutCapMs: number,
          options?: {
            cacheBypass?: boolean;
          },
        ): Promise<ModuleFetchResult> => {
          const remaining = remainingMs();
          if (cancelled || remaining <= 120) {
            return { response: null, nonRetryable: false, code: '' };
          }
          const timeoutMs = Math.max(350, Math.min(timeoutCapMs, remaining));
          try {
            const response = await getPdpV2({
              product_id: productId,
              merchant_id: merchantId,
              include: ['similar'],
              timeout_ms: timeoutMs,
              ...(options?.cacheBypass ? { cache_bypass: true } : {}),
            });
            return { response, nonRetryable: false, code: '' };
          } catch (err) {
            return {
              response: null,
              nonRetryable: isNonRetryablePdpError(err),
              code: readApiErrorCode(err),
            };
          }
        };

        const shouldRetryTimeout = (result: ModuleFetchResult) =>
          !result.response && !result.nonRetryable && result.code === 'UPSTREAM_TIMEOUT';

        const extractRecommendations = (payload: PDPPayload | null) =>
          payload && Array.isArray(payload.modules)
            ? (payload.modules.find((m) => isRecommendationModuleType(m?.type)) as Module | undefined) || null
            : null;

        const shouldRetryEmptySimilar = (payload: PDPPayload | null) => {
          const recommendations = extractRecommendations(payload);
          const data = recommendations?.data as any;
          const items = Array.isArray(data?.items) ? data.items : [];
          const metadata = data?.metadata && typeof data.metadata === 'object' ? data.metadata : {};
          const reasonCodes = new Set(
            Array.isArray(metadata.low_confidence_reason_codes)
              ? metadata.low_confidence_reason_codes
                  .map((item: unknown) => String(item || '').trim())
                  .filter(Boolean)
              : [],
          );

          return Boolean(
            recommendations &&
              items.length === 0 &&
              (data?.status === 'empty' ||
                String(metadata.similar_status || '').toLowerCase() === 'unavailable' ||
                reasonCodes.has('UNDERFILL_FOR_QUALITY')),
          );
        };

        let similarOnlyV2 = await fetchSimilarWithBudget(similarInitialTimeoutMs);
        let similarOnlyPayload: PDPPayload | null = similarOnlyV2.response
          ? mapPdpV2ToPdpPayload(similarOnlyV2.response)
          : null;

        if (
          (shouldRetryTimeout(similarOnlyV2) || shouldRetryEmptySimilar(similarOnlyPayload)) &&
          remainingMs() > 500
        ) {
          const retrySimilarOnlyV2 = await fetchSimilarWithBudget(similarRetryTimeoutMs, {
            cacheBypass: true,
          });
          if (retrySimilarOnlyV2.response || shouldRetryTimeout(similarOnlyV2)) {
            similarOnlyV2 = retrySimilarOnlyV2;
            similarOnlyPayload = retrySimilarOnlyV2.response
              ? mapPdpV2ToPdpPayload(retrySimilarOnlyV2.response)
              : null;
          }
        }

        if (cancelled) return;

        let recModule: Module | null = null;
        let similarRequestSucceeded = false;

        if (similarOnlyV2.response) {
          similarRequestSucceeded = true;
          recModule = extractRecommendations(similarOnlyPayload);
        }

        const itemsCount = Array.isArray((recModule as any)?.data?.items)
          ? ((recModule as any).data.items as unknown[]).length
          : 0;
        const similarState =
          recModule || moduleSourceLocksRef.current.similar || similarRequestSucceeded
            ? 'ready'
            : 'error';

        setPdpPayload((prev) => {
          if (!prev) return prev;
          const mergedSimilar = upsertLockedModule({
            currentModules: prev.modules,
            type: 'recommendations',
            nextModule: recModule as Module | null,
            locked: moduleSourceLocksRef.current.similar,
          });
          moduleSourceLocksRef.current.similar = mergedSimilar.locked;
          return {
            ...prev,
            modules: mergedSimilar.modules,
            x_recommendations_state: similarState,
            x_source_locks: {
              ...(prev.x_source_locks || {}),
              similar: mergedSimilar.locked,
            },
          };
        });

        pdpTracking.track('pdp_module_ready', {
          module: 'similar',
          source: 'get_pdp_v2_similar_backfill',
          count: itemsCount,
          frozen: moduleSourceLocksRef.current.similar,
          similar_request_succeeded: similarRequestSucceeded,
          backfill_phase_ms: Date.now() - backfillStartedAt,
          backfill_budget_ms: backfillBudgetMs,
        });
      } catch {
        if (cancelled) return;
        setPdpPayload((prev) =>
          prev
            ? {
                ...prev,
                x_recommendations_state: 'error',
              }
            : prev,
        );
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    loadedViaPdpV2,
    similarLoadState,
    progressiveMerchantId,
    progressiveProductId,
  ]);

  useEffect(() => {
    let cancelled = false;
    const productId = String(pdpPayload?.product?.product_id || '').trim();
    const productGroupId = String(pdpPayload?.product_group_id || '').trim() || null;

    if (!productId) return;

    if (!userId) {
      setUgcCapabilities({
        canUploadMedia: false,
        canWriteReview: false,
        canAskQuestion: false,
        reasons: {
          upload: 'NOT_AUTHENTICATED',
          review: 'NOT_AUTHENTICATED',
          question: 'NOT_AUTHENTICATED',
        },
      });
      return;
    }

    // Safe optimistic default while personalization is loading.
    setUgcCapabilities({
      canUploadMedia: false,
      canWriteReview: false,
      canAskQuestion: true,
      reasons: {
        upload: 'NOT_PURCHASER',
        review: 'NOT_PURCHASER',
      },
    });

    (async () => {
      try {
        const res = await getPdpV2Personalization({
          productId,
          ...(productGroupId ? { productGroupId } : {}),
        });
        if (cancelled) return;
        const caps = res?.ugcCapabilities;
        if (!caps || typeof caps !== 'object') return;
        setUgcCapabilities({
          canUploadMedia: Boolean(caps.canUploadMedia),
          canWriteReview: Boolean(caps.canWriteReview),
          canAskQuestion: Boolean(caps.canAskQuestion),
          reasons: caps.reasons || {},
        });
      } catch {
        // Keep optimistic defaults.
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

  const resolvedMode = useMemo(() => {
    if (pdpOverride === 'beauty') return 'beauty';
    if (pdpOverride === 'generic') return 'generic';
    if (!pdpPayload) return 'generic';
    return isBeautyProduct(pdpPayload.product) ? 'beauty' : 'generic';
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
        ? Number(
            purchaseVariant.price?.current.amount ??
              offer?.price?.amount ??
              offer?.price_amount ??
              offer?.price ??
              0,
          )
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
        offerItemPrice != null
          ? offerItemPrice + offerShipping
          : purchaseVariant.price?.current.amount ?? pdpPayload.product.price?.current.amount ?? 0;

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
        ? Number(
            purchaseVariant.price?.current.amount ??
              offer?.price?.amount ??
              offer?.price_amount ??
              offer?.price ??
              0,
          )
        : undefined;

      const checkoutItems = [
        {
          product_id: resolvedProductId,
          merchant_id: resolvedMerchantId,
          title: pdpPayload.product.title,
          quantity,
          unit_price:
            offerItemPrice != null
              ? offerItemPrice
              : purchaseVariant.price?.current.amount ?? pdpPayload.product.price?.current.amount ?? 0,
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

  const Container = resolvedMode === 'beauty' ? BeautyPDPContainer : GenericPDPContainer;

  return (
    <div className="min-h-screen bg-background">
      <main className="px-0 py-0">
        <Container
          payload={pdpPayload}
          onAddToCart={handleAddToCart}
          onBuyNow={handleBuyNow}
          onWriteReview={handleWriteReview}
          ugcCapabilities={ugcCapabilities}
        />
      </main>
    </div>
  );
}
