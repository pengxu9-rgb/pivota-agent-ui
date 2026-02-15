'use client';

import { useEffect, useMemo, useState, useRef, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import {
  getPdpV2,
  getPdpV2Personalization,
  findSimilarProducts,
  getProductDetail,
  resolveProductGroup,
  type ProductResponse,
  type UgcCapabilities,
} from '@/lib/api';
import { mapToPdpPayload } from '@/features/pdp/adapter/mapToPdpPayload';
import { mapPdpV2ToPdpPayload } from '@/features/pdp/adapter/mapPdpV2ToPdpPayload';
import { isBeautyProduct } from '@/features/pdp/utils/isBeautyProduct';
import { BeautyPDPContainer } from '@/features/pdp/containers/BeautyPDPContainer';
import { GenericPDPContainer } from '@/features/pdp/containers/GenericPDPContainer';
import type { Module, PDPPayload, Variant } from '@/features/pdp/types';
import { pdpTracking } from '@/features/pdp/tracking';
import {
  DEFAULT_MODULE_SOURCE_LOCKS,
  upsertLockedModule,
} from '@/features/pdp/state/freezePolicy';

interface Props {
  params: Promise<{ id: string }>;
}

function normalizeVariantOptionToken(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeVariantOptionName(name: string): string {
  const normalized = normalizeVariantOptionToken(name);
  if (!normalized) return '';
  if (normalized.includes('colour') || normalized.includes('color') || normalized.includes('shade') || normalized.includes('tone')) {
    return 'color';
  }
  if (normalized.includes('size') || normalized.includes('fit')) {
    return 'size';
  }
  return normalized;
}

function normalizeVariantOptionValue(value: string): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function variantOptionSignature(options?: Array<{ name: string; value: string }>): string {
  if (!Array.isArray(options) || options.length === 0) return '';
  const pairs = options
    .map((opt) => {
      const key = normalizeVariantOptionName(opt?.name || '');
      const val = normalizeVariantOptionValue(opt?.value || '');
      if (!key || !val) return null;
      return [key, val] as const;
    })
    .filter(Boolean) as Array<readonly [string, string]>;
  if (!pairs.length) return '';
  pairs.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  return pairs.map(([k, v]) => `${k}=${v}`).join('|');
}

function getNormalizedVariantOptionValue(
  options: Array<{ name: string; value: string }> | undefined,
  normalizedKey: string,
): string | null {
  if (!Array.isArray(options) || !options.length) return null;
  const wanted = String(normalizedKey || '').trim().toLowerCase();
  if (!wanted) return null;
  const match = options.find((opt) => normalizeVariantOptionName(opt?.name || '') === wanted);
  const value = normalizeVariantOptionValue(match?.value || '');
  return value || null;
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
    normalizeHttpUrl(typed.redirect_url) ||
    normalizeHttpUrl(typed.redirectUrl);
  if (direct) return direct;
  const action = typed.action;
  if (action && typeof action === 'object') {
    return (
      normalizeHttpUrl((action as any).redirect_url) ||
      normalizeHttpUrl((action as any).redirectUrl) ||
      normalizeHttpUrl((action as any).url) ||
      normalizeHttpUrl((action as any).href)
    );
  }
  return null;
}

function normalizeRecommendationItem(input: unknown) {
  if (!input || typeof input !== 'object') return null;
  const typed = input as any;
  const product_id = String(typed.product_id || typed.id || typed.variant_id || '').trim();
  const title = String(typed.title || typed.name || '').trim();
  if (!product_id || !title) return null;

  const merchant_id = typed.merchant_id ? String(typed.merchant_id).trim() : undefined;

  const image_url =
    typeof typed.image_url === 'string'
      ? typed.image_url
      : typeof typed.image === 'string'
        ? typed.image
        : typeof typed.imageUrl === 'string'
          ? typed.imageUrl
          : undefined;

  const currencyCandidate =
    (typeof typed.currency === 'string' && typed.currency) ||
    (typeof typed.price?.currency === 'string' && typed.price.currency) ||
    (typeof typed.price?.current?.currency === 'string' && typed.price.current.currency) ||
    'USD';

  let price: { amount: number; currency: string } | undefined;
  const rawPrice = typed.price;
  if (typeof rawPrice === 'number' && Number.isFinite(rawPrice)) {
    price = { amount: rawPrice, currency: String(currencyCandidate) };
  } else if (rawPrice && typeof rawPrice === 'object') {
    const amt =
      (typeof (rawPrice as any).amount === 'number' && (rawPrice as any).amount) ||
      (typeof (rawPrice as any).current?.amount === 'number' && (rawPrice as any).current.amount) ||
      null;
    if (typeof amt === 'number' && Number.isFinite(amt)) {
      price = {
        amount: amt,
        currency: String((rawPrice as any).currency || (rawPrice as any).current?.currency || currencyCandidate),
      };
    }
  }

  const rating = typeof typed.rating === 'number' ? typed.rating : undefined;
  const review_count =
    typeof typed.review_count === 'number'
      ? typed.review_count
      : typeof typed.reviews_count === 'number'
        ? typed.reviews_count
        : undefined;

  return {
    product_id,
    title,
    ...(image_url ? { image_url } : {}),
    ...(price ? { price } : {}),
    ...(typeof rating === 'number' ? { rating } : {}),
    ...(typeof review_count === 'number' ? { review_count } : {}),
    ...(merchant_id ? { merchant_id } : {}),
  };
}

function hasModule(response: PDPPayload | null, type: 'reviews_preview' | 'recommendations'): boolean {
  if (!response || !Array.isArray(response.modules)) return false;
  return response.modules.some((m) => m?.type === type);
}

function hasRecommendationsItems(response: PDPPayload | null): boolean {
  if (!response || !Array.isArray(response.modules)) return false;
  return response.modules.some((m) => {
    if (m?.type !== 'recommendations') return false;
    const items = (m as any)?.data?.items;
    return Array.isArray(items) && items.length > 0;
  });
}

function ProductDetailLoading({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-4 pt-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-muted/25 animate-pulse" />
          <div className="h-10 flex-1 rounded-full bg-muted/20 animate-pulse" />
          <div className="h-10 w-10 rounded-full bg-muted/25 animate-pulse" />
        </div>

        <div className="mt-4 aspect-[3/4] rounded-3xl bg-muted/20 animate-pulse" />

        <div className="mt-5 space-y-2">
          <div className="h-8 w-32 rounded bg-muted/20 animate-pulse" />
          <div className="h-5 w-full rounded bg-muted/20 animate-pulse" />
          <div className="h-5 w-3/4 rounded bg-muted/20 animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-muted/20 animate-pulse" />
        </div>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          {label}
        </div>
      </div>
    </div>
  );
}

export default function ProductDetailPage({ params }: Props) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const merchantIdParam = searchParams.get('merchant_id') || undefined;
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
  const offerProductDetailCacheRef = useRef<Map<string, ProductResponse>>(new Map());
  const offersFetchKeyRef = useRef<string | null>(null);
  const reviewsFetchKeyRef = useRef<string | null>(null);
  const similarFetchKeyRef = useRef<string | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    const v2TimeoutMs = 20000;
    const fallbackTimeoutMs = 20000;

    const loadProduct = async () => {
      const explicitMerchantId = merchantIdParam ? String(merchantIdParam).trim() : null;

      setLoading(true);
      setError(null);
      setSellerCandidates(null);
      setPdpPayload(null);
      setLoadedViaPdpV2(false);
      offersFetchKeyRef.current = null;
      reviewsFetchKeyRef.current = null;
      similarFetchKeyRef.current = null;
      moduleSourceLocksRef.current = { ...DEFAULT_MODULE_SOURCE_LOCKS };

      try {
        const v2StartedAt = Date.now();
        const v2 = await getPdpV2({
          product_id: id,
          ...(explicitMerchantId ? { merchant_id: explicitMerchantId } : {}),
          // Keep first paint fast: fetch only core PDP data first.
          // Reviews/similar are backfilled by progressive loaders below.
          include: ['offers'],
          timeout_ms: v2TimeoutMs,
        });
        if (cancelled) return;
        const assembled = mapPdpV2ToPdpPayload(v2);
        if (!assembled) throw new Error('Invalid PDP response');
        const hasOffers = Array.isArray((assembled as any).offers) && (assembled as any).offers.length > 0;
        const hasReviewsModule = hasModule(assembled, 'reviews_preview');
        const hasSimilarModule = hasModule(assembled, 'recommendations');
        const hasRecommendations = hasRecommendationsItems(assembled);
        const similarCount = Array.isArray(
          (assembled.modules.find((m) => m?.type === 'recommendations') as any)?.data
            ?.items,
        )
          ? (
              assembled.modules.find(
                (m) => m?.type === 'recommendations',
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
          ...(hasOffers ? {} : { x_offers_state: 'loading' }),
          x_reviews_state: hasReviewsModule ? 'ready' : 'loading',
          x_recommendations_state: hasSimilarModule ? 'ready' : 'loading',
          x_source_locks: {
            reviews: hasReviewsModule,
            similar: hasSimilarModule,
            ugc: false,
          },
        });
        pdpTracking.track('pdp_core_ready', {
          source: 'get_pdp_v2',
          latency_ms: Date.now() - v2StartedAt,
          has_offers: hasOffers,
          has_reviews_module: hasReviewsModule,
          has_similar_module: hasSimilarModule,
        });
        if (hasReviewsModule) {
          pdpTracking.track('pdp_module_ready', {
            module: 'reviews_preview',
            source: 'get_pdp_v2',
          });
        }
        if (hasRecommendations) {
          pdpTracking.track('pdp_module_ready', {
            module: 'similar',
            source: 'get_pdp_v2',
            count: similarCount,
          });
        }
        setLoadedViaPdpV2(true);
        setLoading(false);
        return;
      } catch (v2Err) {
        // Fall back to legacy per-merchant product detail so PDP can still render.
        try {
          const resolvedGroup =
            explicitMerchantId
              ? await resolveProductGroup({
                  product_id: id,
                  merchant_id: explicitMerchantId,
                  timeout_ms: 8000,
                }).catch(() => null)
              : await resolveProductGroup({
                  product_id: id,
                  timeout_ms: 8000,
                }).catch(() => null);

          if (cancelled) return;

          const canonicalRef =
            resolvedGroup?.canonical_product_ref?.merchant_id &&
            resolvedGroup?.canonical_product_ref?.product_id
              ? {
                  merchant_id: String(resolvedGroup.canonical_product_ref.merchant_id),
                  product_id: String(resolvedGroup.canonical_product_ref.product_id),
                }
              : null;

          const targetMerchantId = canonicalRef?.merchant_id || explicitMerchantId || undefined;
          const targetProductId = canonicalRef?.product_id || id;

          const detail = await getProductDetail(targetProductId, targetMerchantId, {
            useConfiguredMerchantId: false,
            allowBroadScan: false,
            timeout_ms: fallbackTimeoutMs,
            throwOnError: true,
            includeReviewSummary: false,
          });

          if (cancelled) return;

          if (!detail) throw v2Err;

          const legacyPayload = mapToPdpPayload({
            product: detail,
            rawDetail: detail.raw_detail,
            relatedProducts: [],
            recommendationsLoading: false,
            entryPoint: 'product_detail',
          });
          setPdpPayload({
            ...legacyPayload,
            x_source_locks: {
              reviews: false,
              similar: false,
              ugc: false,
            },
          });
          pdpTracking.track('pdp_fallback_used', {
            source: 'legacy_get_product_detail',
            reason: 'get_pdp_v2_failed',
          });
          pdpTracking.track('pdp_core_ready', {
            source: 'legacy_get_product_detail',
          });
          setLoadedViaPdpV2(false);
          setLoading(false);
          return;
        } catch (fallbackErr) {
          if (cancelled) return;
          if (
            (fallbackErr as any)?.code === 'AMBIGUOUS_PRODUCT_ID' &&
            Array.isArray((fallbackErr as any)?.candidates)
          ) {
            setSellerCandidates((fallbackErr as any).candidates as ProductResponse[]);
            setLoading(false);
            return;
          }

          const message =
            (fallbackErr as Error)?.message ||
            (v2Err as Error)?.message ||
            'Failed to load product';
          setError(message);
          setLoading(false);
        }
      }
    };

    void loadProduct();
    return () => {
      cancelled = true;
    };
  }, [id, merchantIdParam, reloadKey]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!loadedViaPdpV2) return;
      if (!pdpPayload) return;
      if (pdpPayload.x_offers_state !== 'loading') return;

      const merchantId = String(pdpPayload.product.merchant_id || '').trim();
      const productId = String(pdpPayload.product.product_id || id || '').trim();
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
  }, [id, loadedViaPdpV2, pdpPayload, pdpPayload?.x_offers_state]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!loadedViaPdpV2) return;
      if (!pdpPayload) return;
      if (pdpPayload.x_reviews_state !== 'loading') return;

      const merchantId = String(pdpPayload.product.merchant_id || '').trim();
      const productId = String(pdpPayload.product.product_id || id || '').trim();
      if (!merchantId || !productId) {
        setPdpPayload((prev) => (prev ? { ...prev, x_reviews_state: 'error' } : prev));
        return;
      }

      const key = `${merchantId}:${productId}`;
      if (reviewsFetchKeyRef.current === key) return;
      reviewsFetchKeyRef.current = key;

      try {
        const v2 = await getPdpV2({
          product_id: productId,
          merchant_id: merchantId,
          include: ['reviews_preview'],
          timeout_ms: 12000,
        });
        if (cancelled) return;

        const assembled = mapPdpV2ToPdpPayload(v2);
        const reviewsModule =
          assembled && Array.isArray(assembled.modules)
            ? assembled.modules.find((m) => m?.type === 'reviews_preview') || null
            : null;

        setPdpPayload((prev) => {
          if (!prev) return prev;
          const merged = upsertLockedModule({
            currentModules: prev.modules,
            type: 'reviews_preview',
            nextModule: reviewsModule as Module | null,
            locked: moduleSourceLocksRef.current.reviews,
          });
          moduleSourceLocksRef.current.reviews = merged.locked;
          return {
            ...prev,
            modules: merged.modules,
            x_reviews_state: reviewsModule || merged.locked ? 'ready' : 'error',
            x_source_locks: {
              ...(prev.x_source_locks || {}),
              reviews: merged.locked,
            },
          };
        });
        pdpTracking.track('pdp_module_ready', {
          module: 'reviews_preview',
          source: 'get_pdp_v2_backfill',
          frozen: moduleSourceLocksRef.current.reviews,
        });
      } catch {
        if (cancelled) return;
        setPdpPayload((prev) => (prev ? { ...prev, x_reviews_state: 'error' } : prev));
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [id, loadedViaPdpV2, pdpPayload, pdpPayload?.x_reviews_state]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!loadedViaPdpV2) return;
      if (!pdpPayload) return;
      if (pdpPayload.x_recommendations_state !== 'loading') return;

      const merchantId = String(pdpPayload.product.merchant_id || '').trim();
      const productId = String(pdpPayload.product.product_id || id || '').trim();
      if (!merchantId || !productId) {
        setPdpPayload((prev) => (prev ? { ...prev, x_recommendations_state: 'error' } : prev));
        return;
      }

      const key = `${merchantId}:${productId}`;
      if (similarFetchKeyRef.current === key) return;
      similarFetchKeyRef.current = key;

      try {
        const similar = await findSimilarProducts({
          product_id: productId,
          merchant_id: merchantId,
          limit: 6,
          timeout_ms: 8000,
        });
        if (cancelled) return;

        const products = Array.isArray((similar as any)?.products) ? (similar as any).products : [];
        const items = products.map(normalizeRecommendationItem).filter(Boolean) as any[];
        const hasItems = items.length > 0;
        const recModule = hasItems
          ? {
              module_id: 'recommendations',
              type: 'recommendations' as const,
              priority: 90,
              title: 'Similar',
              data: {
                strategy: (similar as any)?.strategy || 'related_products',
                items,
              },
            }
          : null;

        setPdpPayload((prev) => {
          if (!prev) return prev;
          const merged = upsertLockedModule({
            currentModules: prev.modules,
            type: 'recommendations',
            nextModule: recModule as Module | null,
            locked: moduleSourceLocksRef.current.similar,
          });
          moduleSourceLocksRef.current.similar = merged.locked;
          return {
            ...prev,
            modules: merged.modules,
            x_recommendations_state: 'ready',
            x_source_locks: {
              ...(prev.x_source_locks || {}),
              similar: merged.locked,
            },
          };
        });
        pdpTracking.track('pdp_module_ready', {
          module: 'similar',
          source: 'find_similar_products',
          count: items.length,
          frozen: moduleSourceLocksRef.current.similar,
        });
      } catch {
        if (cancelled) return;
        setPdpPayload((prev) => (prev ? { ...prev, x_recommendations_state: 'error' } : prev));
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [id, loadedViaPdpV2, pdpPayload, pdpPayload?.x_recommendations_state]);

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

  const resolveVariantForPurchase = async (args: {
    merchant_id: string;
    product_id: string;
    desired_variant: Variant;
  }): Promise<Variant | null> => {
    try {
      const merchantId = String(args.merchant_id || '').trim();
      const productId = String(args.product_id || '').trim();
      if (!merchantId || !productId) return null;

      const cacheKey = `${merchantId}:${productId}`;
      let detail = offerProductDetailCacheRef.current.get(cacheKey) || null;
      if (!detail) {
        detail = await getProductDetail(productId, merchantId, {
          useConfiguredMerchantId: false,
          allowBroadScan: false,
          throwOnError: false,
        });
        if (detail) {
          offerProductDetailCacheRef.current.set(cacheKey, detail);
        }
      }
      if (!detail) return null;

      const detailPayload = mapToPdpPayload({
        product: detail,
        rawDetail: detail.raw_detail,
        relatedProducts: [],
        recommendationsLoading: false,
        entryPoint: 'product_detail',
      });
      const variants = Array.isArray(detailPayload?.product?.variants)
        ? detailPayload.product.variants
        : [];
      if (!variants.length) return null;

      const desiredSig = variantOptionSignature(args.desired_variant.options);
      if (desiredSig) {
        const exact = variants.find((v) => variantOptionSignature(v.options) === desiredSig) || null;
        if (exact) return exact;
      }

      const desiredColor = getNormalizedVariantOptionValue(args.desired_variant.options, 'color');
      const desiredSize = getNormalizedVariantOptionValue(args.desired_variant.options, 'size');
      if (desiredColor || desiredSize) {
        const partial =
          variants.find((v) => {
            const color = getNormalizedVariantOptionValue(v.options, 'color');
            const size = getNormalizedVariantOptionValue(v.options, 'size');
            const colorMatch = desiredColor ? color === desiredColor : true;
            const sizeMatch = desiredSize ? size === desiredSize : true;
            return colorMatch && sizeMatch;
          }) || null;
        if (partial) return partial;
      }

      if (variants.length === 1) return variants[0];
      return null;
    } catch {
      return null;
    }
  };

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
        String(merchant_id || pdpPayload.product.merchant_id || '').trim() || pdpPayload.product.merchant_id;
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
      const payloadRedirectUrl = normalizeHttpUrl((pdpPayload as any)?.product?.external_redirect_url);
      const isExternal =
        Boolean(offerRedirectUrl || payloadRedirectUrl) ||
        resolvedMerchantId === 'external_seed' ||
        String((pdpPayload as any)?.product?.source || '').trim() === 'external_seed';

      if (isExternal) {
        const redirectUrl = offerRedirectUrl || payloadRedirectUrl;
        if (redirectUrl) {
          toast.success(buildExternalRedirectNotice(redirectUrl));
          window.open(redirectUrl, '_blank', 'noopener,noreferrer');
          return;
        }

        const detail = await getProductDetail(resolvedProductId, resolvedMerchantId, {
          useConfiguredMerchantId: false,
          allowBroadScan: false,
          throwOnError: false,
          timeout_ms: 8000,
        });
        const detailRedirectUrl = normalizeHttpUrl(detail?.external_redirect_url);
        if (detailRedirectUrl) {
          toast.success(buildExternalRedirectNotice(detailRedirectUrl));
          window.open(detailRedirectUrl, '_blank', 'noopener,noreferrer');
        } else {
          toast.error('This item is only available on an external site.');
        }
        return;
      }

      const needsVariantMapping =
        resolvedMerchantId !== String(pdpPayload.product.merchant_id || '').trim() ||
        resolvedProductId !== String(pdpPayload.product.product_id || '').trim();
      const purchaseVariant = needsVariantMapping
        ? await resolveVariantForPurchase({
            merchant_id: resolvedMerchantId,
            product_id: resolvedProductId,
            desired_variant: variant,
          })
        : variant;

      if (!purchaseVariant) {
        toast.error('This seller doesn’t have the selected options. Try another offer.');
        return;
      }

      const selectedOptions =
        Array.isArray(purchaseVariant.options) && purchaseVariant.options.length > 0
          ? Object.fromEntries(purchaseVariant.options.map((o) => [o.name, o.value]))
          : undefined;

      const offerItemPrice = offer
        ? Number(offer?.price?.amount ?? offer?.price_amount ?? offer?.price ?? 0)
        : undefined;
      const offerCurrency = offer
        ? String(
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
        String(merchant_id || pdpPayload.product.merchant_id || '').trim() || pdpPayload.product.merchant_id;
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
      const payloadRedirectUrl = normalizeHttpUrl((pdpPayload as any)?.product?.external_redirect_url);
      const isExternal =
        Boolean(offerRedirectUrl || payloadRedirectUrl) ||
        resolvedMerchantId === 'external_seed' ||
        String((pdpPayload as any)?.product?.source || '').trim() === 'external_seed';

      if (isExternal) {
        const redirectUrl = offerRedirectUrl || payloadRedirectUrl;
        if (redirectUrl) {
          toast.success(buildExternalRedirectNotice(redirectUrl));
          window.open(redirectUrl, '_blank', 'noopener,noreferrer');
          return;
        }

        if (!resolvedMerchantId || !resolvedProductId) {
          toast.error('This item is only available on an external site.');
          return;
        }

        const detail = await getProductDetail(resolvedProductId, resolvedMerchantId, {
          useConfiguredMerchantId: false,
          allowBroadScan: false,
          throwOnError: false,
          timeout_ms: 8000,
        });
        const detailRedirectUrl = normalizeHttpUrl(detail?.external_redirect_url);
        if (detailRedirectUrl) {
          toast.success(buildExternalRedirectNotice(detailRedirectUrl));
          window.open(detailRedirectUrl, '_blank', 'noopener,noreferrer');
        } else {
          toast.error('This item is only available on an external site.');
        }
        return;
      }

      if (!resolvedMerchantId || !resolvedProductId) {
        toast.error('This offer is missing merchant/product info.');
        return;
      }

      const needsVariantMapping =
        resolvedMerchantId !== String(pdpPayload.product.merchant_id || '').trim() ||
        resolvedProductId !== String(pdpPayload.product.product_id || '').trim();
      const purchaseVariant = needsVariantMapping
        ? await resolveVariantForPurchase({
            merchant_id: resolvedMerchantId,
            product_id: resolvedProductId,
            desired_variant: variant,
          })
        : variant;

      if (!purchaseVariant) {
        toast.error('This seller doesn’t have the selected options. Try another offer.');
        return;
      }

      const selectedOptions =
        Array.isArray(purchaseVariant.options) && purchaseVariant.options.length > 0
          ? Object.fromEntries(purchaseVariant.options.map((o) => [o.name, o.value]))
          : undefined;

      const offerItemPrice = offer
        ? Number(offer?.price?.amount ?? offer?.price_amount ?? offer?.price ?? 0)
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
      const encoded = encodeURIComponent(JSON.stringify(checkoutItems));
      router.push(`/order?items=${encoded}`);
    })();
  };

  const handleWriteReview = () => {
    if (!pdpPayload) return;
    const params = new URLSearchParams();
    params.set('product_id', pdpPayload.product.product_id);
    if (pdpPayload.product.merchant_id) params.set('merchant_id', pdpPayload.product.merchant_id);
    router.push(`/reviews/write?${params.toString()}`);
  };

  if (loading && !pdpPayload) {
    return <ProductDetailLoading label="Loading product…" />;
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
                    router.push(`/products/${encodeURIComponent(id)}?merchant_id=${encodeURIComponent(merchantId)}`);
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
