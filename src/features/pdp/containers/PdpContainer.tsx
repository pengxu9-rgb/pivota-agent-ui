'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ChevronLeft, Share2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type {
  ActiveIngredientsData,
  HowToUseData,
  IngredientsInciData,
  MediaGalleryData,
  MediaItem,
  Offer,
  PDPPayload,
  PricePromoData,
  ProductDetailsData,
  ProductIntelData,
  ProductFactsData,
  ProductLineOption,
  RecommendationsData,
  ReviewsPreviewData,
  Variant,
} from '@/features/pdp/types';
import {
  getPdpV2,
  getSimilarProductsMainline,
  listQuestions,
  postQuestion,
  type QuestionListItem,
  type ProductResponse,
  type UgcCapabilities,
} from '@/lib/api';
import { mapPdpV2ToPdpPayload } from '@/features/pdp/adapter/mapPdpV2ToPdpPayload';
import { isBeautyProduct } from '@/features/pdp/utils/isBeautyProduct';
import {
  collectColorOptions,
  collectSizeOptions,
  extractAttributeOptions,
  extractBeautyAttributes,
  findVariantByOptions,
  getStaticSizeOption,
  getOptionValue,
} from '@/features/pdp/utils/variantOptions';
import { pdpTracking } from '@/features/pdp/tracking';
import { dispatchPdpAction } from '@/features/pdp/actions';
import { MediaGallery } from '@/features/pdp/sections/MediaGallery';
import { PdpMediaViewer } from '@/features/pdp/components/PdpMediaViewer';
import { VariantSelector } from '@/features/pdp/sections/VariantSelector';
import { DetailsAccordion } from '@/features/pdp/sections/DetailsAccordion';
import { RecommendationsGrid, RecommendationsSkeleton } from '@/features/pdp/sections/RecommendationsGrid';
import { SimilarQuickActionSheet } from '@/features/pdp/sections/SimilarQuickActionSheet';
import { BeautyReviewsSection } from '@/features/pdp/sections/BeautyReviewsSection';
import { BeautyUgcGallery } from '@/features/pdp/sections/BeautyUgcGallery';
import { BeautyRecentPurchases } from '@/features/pdp/sections/BeautyRecentPurchases';
import { BeautyDetailsSection } from '@/features/pdp/sections/BeautyDetailsSection';
import { GenericColorSheet, type GenericColorOption } from '@/features/pdp/sections/GenericColorSheet';
import { GenericRecentPurchases } from '@/features/pdp/sections/GenericRecentPurchases';
import { GenericStyleGallery } from '@/features/pdp/sections/GenericStyleGallery';
import { GenericSizeHelper } from '@/features/pdp/sections/GenericSizeHelper';
import { GenericSizeGuide } from '@/features/pdp/sections/GenericSizeGuide';
import { GenericDetailsSection } from '@/features/pdp/sections/GenericDetailsSection';
import { PivotaInsightsSection, isDisplayableProductIntelData } from '@/features/pdp/sections/PivotaInsightsSection';
import { OfferSheet } from '@/features/pdp/offers/OfferSheet';
import { ModuleShell } from '@/features/pdp/components/ModuleShell';
import { DEFAULT_UGC_SNAPSHOT, lockFirstUgcSource, mergeUgcItems } from '@/features/pdp/state/freezePolicy';
import { getStableGalleryItems, resolveHeroMediaUrl } from '@/features/pdp/state/heroMedia';
import { buildPdpViewModel } from '@/features/pdp/state/viewModel';
import { resolveOfferPricing } from '@/features/pdp/utils/offerVariantMatching';
import { buildBrandHref } from '@/lib/brandRoute';
import { buildProductHref } from '@/lib/productHref';
import { buildProductVariants } from '@/features/pdp/utils/productVariants';
import { getDisplayVariantLabel } from '@/features/pdp/utils/variantLabels';
import { cn } from '@/lib/utils';
import { resolveReviewGate, reviewGateMessage, reviewGateResultToReason } from '@/lib/reviewGate';
import { postRequestCloseToParent } from '@/lib/auroraEmbed';
import { appendCurrentPathAsReturn, isExternalAgentEntry, resolveExternalAgentHomeUrl, safeReturnUrl } from '@/lib/returnUrl';
import {
  getExternalRedirectUrlFromOffer,
  getExternalRedirectUrlFromProduct,
  isExternalCtaTarget,
  resolveCheckoutTarget,
} from '@/lib/pdpPurchaseFlow';
import { useIsDesktop } from '@/features/pdp/hooks/useIsDesktop';
import { buildSimilarMainlineStatus } from '@/features/pdp/utils/similarHints';
import { partitionDetailSections } from '@/features/pdp/utils/detailSections';
import { normalizePdpImageUrl } from '@/features/pdp/utils/pdpImageUrls';
import {
  chooseProductDetailsData,
  hasLowQualityOverviewSection,
  sanitizeActiveIngredientsData,
  sanitizeHowToUseData,
  sanitizeIngredientsInciData,
} from '@/features/pdp/utils/pdpDisplaySanitizers';

function nonEmptyText(value: unknown, fallback: string): string {
  const text = String(value ?? '').trim();
  return text ? text : fallback;
}

function getModuleData<T>(payload: PDPPayload, type: string): T | null {
  const m = payload.modules.find((x) => x.type === type);
  return (m?.data as T) ?? null;
}

function getRecommendationsModuleData(payload: PDPPayload): RecommendationsData | null {
  const recommendationModule = payload.modules.find(
    (module) => module?.type === 'recommendations' || module?.type === ('similar' as any),
  );
  return (recommendationModule?.data as RecommendationsData) ?? null;
}

type VariantSelectorModuleData = {
  selected_variant_id?: string;
  product_line_option_name?: string;
  product_line_options?: ProductLineOption[];
};

function normalizeHexColor(value: unknown): string | undefined {
  const text = String(value || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(text)) {
    return `#${text
      .split('')
      .map((part) => `${part}${part}`)
      .join('')}`.toLowerCase();
  }
  if (/^[0-9a-f]{6}$/i.test(text)) return `#${text}`.toLowerCase();
  return undefined;
}

function normalizeProductLineOptions(options: ProductLineOption[] | undefined): ProductLineOption[] {
  if (!Array.isArray(options)) return [];
  const seen = new Set<string>();
  const normalized: ProductLineOption[] = [];
  for (const item of options) {
    const label = String(item?.label || item?.value || '').trim();
    const productId = String(item?.product_id || '').trim();
    if (!label || !productId) continue;
    const merchantId = String(item?.merchant_id || '').trim();
    const axis = String(item?.axis || '').trim().toLowerCase();
    const value = String(item?.value || label).trim();
    const swatchImageUrl =
      normalizePdpImageUrl(
        item?.swatch_image_url ||
          item?.label_image_url ||
          item?.swatch?.image_url ||
          item?.swatch?.imageUrl ||
          item?.swatch?.url,
      ) || undefined;
    const swatchColor = normalizeHexColor(
      item?.swatch_color || item?.color_hex || item?.swatch?.hex,
    );
    const key = `${axis || 'option'}:${value.toLowerCase()}:${productId}:${merchantId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      ...item,
      label,
      value,
      product_id: productId,
      merchant_id: merchantId || undefined,
      axis: axis || undefined,
      ...(swatchImageUrl ? { swatch_image_url: swatchImageUrl, label_image_url: swatchImageUrl } : {}),
      ...(swatchColor ? { swatch_color: swatchColor, color_hex: swatchColor, swatch: { hex: swatchColor } } : {}),
    });
  }
  return normalized;
}

function getProductLineSwatch(option: ProductLineOption): { imageUrl?: string; color?: string } {
  return {
    imageUrl:
      normalizePdpImageUrl(
        option.swatch_image_url ||
          option.label_image_url ||
          option.swatch?.image_url ||
          option.swatch?.imageUrl ||
          option.swatch?.url,
      ) || undefined,
    color: normalizeHexColor(option.swatch_color || option.color_hex || option.swatch?.hex),
  };
}

function isSameProductLineOption(
  option: ProductLineOption,
  productId: string,
  merchantId: string,
): boolean {
  const optionProductId = String(option.product_id || '').trim();
  const optionMerchantId = String(option.merchant_id || '').trim();
  return (
    optionProductId === productId &&
    (!optionMerchantId || !merchantId || optionMerchantId === merchantId)
  );
}

function withSelectedProductLineOption(payload: PDPPayload, selected: ProductLineOption): PDPPayload {
  const selectedProductId = String(selected.product_id || '').trim();
  const selectedMerchantId = String(selected.merchant_id || '').trim();
  if (!selectedProductId) return payload;

  const markOptions = (options: ProductLineOption[] | undefined): ProductLineOption[] | undefined => {
    if (!Array.isArray(options)) return options;
    return options.map((option) => ({
      ...option,
      selected: isSameProductLineOption(option, selectedProductId, selectedMerchantId),
    }));
  };

  return {
    ...payload,
    product: {
      ...payload.product,
      product_line_options: markOptions(payload.product.product_line_options),
    },
    modules: payload.modules.map((module) => {
      if (module.type !== 'variant_selector' || !module.data || typeof module.data !== 'object') {
        return module;
      }
      const data = module.data as VariantSelectorModuleData;
      return {
        ...module,
        data: {
          ...data,
          product_line_options: markOptions(data.product_line_options),
        },
      };
    }),
  };
}

function buildProductLinePayloadCacheKey(productId: string, merchantId?: string | null): string {
  const normalizedProductId = String(productId || '').trim();
  const normalizedMerchantId = String(merchantId || '').trim();
  return normalizedProductId ? `${normalizedMerchantId}::${normalizedProductId}` : '';
}

function stripProductLineAsyncModules(payload: PDPPayload): PDPPayload {
  return {
    ...payload,
    modules: payload.modules.filter((module) => {
      const type = String(module?.type || '').trim();
      return type !== 'reviews_preview' && type !== 'recommendations' && type !== 'similar';
    }),
    x_reviews_state: 'loading',
    x_recommendations_state: 'loading',
    x_source_locks: {
      ...(payload.x_source_locks || {}),
      reviews: false,
      similar: false,
    },
  };
}

function mergeProductLineReviewsPayload(current: PDPPayload, incoming: PDPPayload | null): PDPPayload {
  const nextReviewsModule =
    incoming?.modules.find((module) => String(module?.type || '').trim() === 'reviews_preview') || null;
  const baseModules = current.modules.filter((module) => String(module?.type || '').trim() !== 'reviews_preview');
  const resolvedReviewsModule = nextReviewsModule || {
    module_id: 'reviews_preview',
    type: 'reviews_preview' as const,
    priority: 50,
    title: 'Reviews',
    data: {
      scale: 5,
      rating: 0,
      review_count: 0,
      preview_items: [],
    },
  };
  return {
    ...current,
    modules: [...baseModules, resolvedReviewsModule],
    x_reviews_state: 'ready',
    x_source_locks: {
      ...(current.x_source_locks || {}),
      reviews: Boolean(nextReviewsModule),
    },
  };
}

function mergeProductLineSimilarPayload(current: PDPPayload, incoming: PDPPayload | null): PDPPayload {
  const nextSimilarModule =
    incoming?.modules.find((module) => {
      const type = String(module?.type || '').trim();
      return type === 'recommendations' || type === 'similar';
    }) || null;
  const baseModules = current.modules.filter((module) => {
    const type = String(module?.type || '').trim();
    return type !== 'recommendations' && type !== 'similar';
  });
  return {
    ...current,
    modules: nextSimilarModule ? [...baseModules, nextSimilarModule] : baseModules,
    x_recommendations_state: incoming?.x_recommendations_state || 'ready',
    x_source_locks: {
      ...(current.x_source_locks || {}),
      similar: Boolean(nextSimilarModule),
    },
  };
}

function needsProductLineOptionalBackfill(payload: PDPPayload): boolean {
  return (
    payload.x_reviews_state === 'loading' ||
    payload.x_reviews_state === 'error' ||
    payload.x_recommendations_state === 'loading' ||
    payload.x_recommendations_state === 'error'
  );
}

function buildInlineProductLineTargetPath(
  nextProductId: string,
  nextMerchantId: string,
  currentRelativePath: string | null,
): string {
  const targetHref = buildProductHref(nextProductId, nextMerchantId || undefined);
  const [pathname, rawQuery = ''] = targetHref.split('?');
  const params = new URLSearchParams(rawQuery);
  const existingReturn =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('return')
      : null;
  if (existingReturn) {
    params.set('return', existingReturn);
  } else if (currentRelativePath) {
    params.set('return', currentRelativePath);
  }
  return `${pathname}${params.toString() ? `?${params.toString()}` : ''}`;
}

function formatPrice(amount: number, currency: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  const c = currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

const SIMILAR_PAGE_STEP = 12;
const SIMILAR_NO_GROWTH_STOP_THRESHOLD = 2;
const PRODUCT_LINE_FAST_INCLUDE = [
  'offers',
  'variant_selector',
  'product_intel',
  'active_ingredients',
  'ingredients_inci',
  'how_to_use',
  'product_overview',
  'supplemental_details',
] as const;
const PRODUCT_LINE_PREFETCH_LIMIT = 2;
const PRODUCT_LINE_PREFETCH_CONCURRENCY = 1;
const PRODUCT_LINE_PREFETCH_TIMEOUT_MS = 8000;
const PRODUCT_LINE_REVIEWS_TIMEOUT_MS = 4200;
const PRODUCT_LINE_SIMILAR_TIMEOUT_MS = 10000;
const LOW_CONFIDENCE_ACTIVE_INGREDIENT_BEAUTY_HINT_RE =
  /(beauty|makeup|cosmetic|palette|powder|eyeshadow|eye color|eye|quad|shadow|blush|bronzer|concealer|foundation|lip|lips|mascara|brow|skincare|serum|cream|creme|fragrance|perfume|parfum|eau de parfum)/i;

function getCurrentRelativePath(): string | null {
  if (typeof window === 'undefined') return null;
  return `${window.location.pathname}${window.location.search}`;
}

function resolveDefaultReviewScope(reviews: ReviewsPreviewData | null): string | null {
  if (!reviews) return null;
  const tabs = Array.isArray(reviews.tabs) ? reviews.tabs : [];
  const explicitDefault = tabs.find((tab) => tab.default && tab.id)?.id || null;
  if (explicitDefault) return explicitDefault;
  const aggregationScope = String(reviews.aggregation_scope || '').trim();
  if (aggregationScope) return aggregationScope;
  if (reviews.scoped_summaries?.product_line) return 'product_line';
  if (reviews.scoped_summaries?.exact_item) return 'exact_item';
  return null;
}

function buildReviewScopeLabel(scopeId: string | null, reviews: ReviewsPreviewData): string | undefined {
  if (scopeId === 'exact_item') {
    const count = Number(reviews.exact_item_review_count || reviews.review_count || 0) || 0;
    return `Based on exact-item reviews (${count})`;
  }
  if (scopeId === 'product_line') {
    const count =
      Number(reviews.product_line_review_count || reviews.review_count || 0) || 0;
    return `Based on product-line reviews (${count})`;
  }
  return reviews.scope_label;
}

export function isLikelyBeautyExternalSeedProduct(
  product: PDPPayload['product'],
  resolvedMode: 'beauty' | 'generic',
): boolean {
  if (resolvedMode === 'beauty') return true;
  if (isBeautyProduct(product)) return true;

  const beautyLikeText = [
    product.title,
    product.subtitle,
    product.brand?.name,
    Array.isArray(product.category_path) ? product.category_path.join(' ') : '',
    Array.isArray(product.tags) ? product.tags.join(' ') : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return LOW_CONFIDENCE_ACTIVE_INGREDIENT_BEAUTY_HINT_RE.test(beautyLikeText);
}

export function resolveVisiblePdpTab(
  entries: Array<{ id: string; top: number }>,
  anchor: number,
): string | null {
  if (!entries.length) return null;
  let current = entries[0].id;
  for (const entry of entries) {
    if (entry.top <= anchor) current = entry.id;
  }
  return current;
}

function buildRecommendationKey(item: { product_id?: string; merchant_id?: string }) {
  return `${String(item?.merchant_id || '').trim()}::${String(item?.product_id || '').trim()}`;
}

function toRecommendationItem(raw: any): RecommendationsData['items'][number] | null {
  const productId = String(raw?.product_id || '').trim();
  if (!productId) return null;
  const title = String(raw?.title || '').trim() || 'Untitled product';
  const merchantId = String(raw?.merchant_id || '').trim() || undefined;
  const imageUrl = String(raw?.image_url || raw?.image || '').trim() || undefined;
  const amountRaw = Number(raw?.price?.amount ?? raw?.price ?? 0);
  const hasPrice = Number.isFinite(amountRaw) && amountRaw > 0;
  return {
    product_id: productId,
    merchant_id: merchantId,
    title,
    ...(imageUrl ? { image_url: imageUrl } : {}),
    ...(hasPrice
      ? {
          price: {
            amount: amountRaw,
            currency: String(raw?.price?.currency || raw?.currency || 'USD'),
          },
        }
      : {}),
    ...(Number.isFinite(Number(raw?.rating)) ? { rating: Number(raw.rating) } : {}),
    ...(Number.isFinite(Number(raw?.review_count))
      ? { review_count: Number(raw.review_count) }
      : {}),
  };
}

function mergeUniqueRecommendations(
  current: RecommendationsData['items'],
  incoming: RecommendationsData['items'],
) {
  const map = new Map<string, RecommendationsData['items'][number]>();
  current.forEach((item) => map.set(buildRecommendationKey(item), item));
  const before = map.size;
  incoming.forEach((item) => map.set(buildRecommendationKey(item), item));
  return {
    merged: Array.from(map.values()),
    added: map.size - before,
  };
}

function isInternalCheckoutOffer(offer: Offer | null | undefined): boolean {
  const purchaseRoute = String(offer?.purchase_route || '').trim().toLowerCase();
  const commerceMode = String(offer?.commerce_mode || '').trim().toLowerCase();
  const checkoutHandoff = String(offer?.checkout_handoff || '').trim().toLowerCase();
  const hasOutboundUrl = Boolean(
    offer?.external_redirect_url ||
      offer?.externalRedirectUrl ||
      offer?.affiliate_url ||
      offer?.external_url ||
      offer?.redirect_url ||
      offer?.url,
  );
  if (
    ['affiliate_outbound', 'merchant_site', 'external_redirect', 'links_out'].includes(purchaseRoute) ||
    ['links_out', 'affiliate_outbound', 'merchant_site'].includes(commerceMode) ||
    checkoutHandoff === 'redirect' ||
    hasOutboundUrl
  ) {
    return false;
  }
  if (
    purchaseRoute === 'internal_checkout' ||
    commerceMode === 'merchant_embedded_checkout' ||
    checkoutHandoff === 'embedded' ||
    offer?.checkout_url ||
    offer?.purchase_url
  ) {
    return true;
  }
  const offerId = String(offer?.offer_id || '').trim().toLowerCase();
  if (offerId.startsWith('of:internal_checkout:')) return true;
  const merchantId = String(offer?.merchant_id || '').trim().toLowerCase();
  return merchantId !== 'external_seed';
}

function pickInternalFirstOfferId({
  offers,
  merchantId,
  defaultOfferId,
}: {
  offers: Offer[];
  merchantId?: string | null;
  defaultOfferId?: string | null;
}): string | null {
  if (!Array.isArray(offers) || offers.length === 0) return null;
  const merchant = String(merchantId || '').trim();
  const merchantOffer = merchant ? offers.find((offer) => offer.merchant_id === merchant) || null : null;
  const merchantInternalOffer = merchant
    ? offers.find((offer) => offer.merchant_id === merchant && isInternalCheckoutOffer(offer)) || null
    : null;
  if (merchantInternalOffer?.offer_id) return merchantInternalOffer.offer_id;
  const firstInternal = offers.find((offer) => isInternalCheckoutOffer(offer));
  if (firstInternal?.offer_id) return firstInternal.offer_id;
  if (merchantOffer?.offer_id) return merchantOffer.offer_id;
  const explicitDefault =
    defaultOfferId && offers.find((offer) => offer.offer_id === defaultOfferId)?.offer_id;
  if (explicitDefault) return explicitDefault;
  return offers[0]?.offer_id || null;
}

function offerSupportsVariant(
  offer: Offer | null | undefined,
  variant: Variant | null | undefined,
): boolean {
  if (!offer || !variant) return true;
  const rawVariants = Array.isArray((offer as any)?.variants) ? (offer as any).variants : [];
  if (!rawVariants.length) return true;
  return Boolean(resolveOfferPricing(offer, variant).matchedVariant);
}

function getInitialVariantIdFromDetail(detail: ProductResponse, variants: Variant[]): string {
  const candidateIds = [
    detail.variant_id,
    (detail.raw_detail as any)?.default_variant_id,
    (detail.raw_detail as any)?.defaultVariantId,
    variants[0]?.variant_id,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return candidateIds.find((candidateId) => variants.some((variant) => variant.variant_id === candidateId)) || variants[0]?.variant_id || '';
}

function buildSimilarDetailFromPdpPayload(nextPayload: PDPPayload | null): ProductResponse | null {
  if (!nextPayload) return null;

  const payloadProduct = nextPayload.product;
  if (!payloadProduct?.product_id) return null;
  const payloadVariants = Array.isArray(payloadProduct.variants) ? payloadProduct.variants : [];
  const payloadOffers = Array.isArray(nextPayload.offers) ? nextPayload.offers : [];
  const productAny = payloadProduct as any;
  const defaultVariant =
    payloadVariants.find((variant) => variant.variant_id === payloadProduct.default_variant_id) ||
    payloadVariants[0] ||
    null;
  const firstOffer = payloadOffers[0] as any;
  const payloadAmount =
    payloadProduct.price?.current?.amount ??
    defaultVariant?.price?.current?.amount ??
    firstOffer?.price?.amount;
  const payloadCurrency =
    payloadProduct.price?.current?.currency ??
    defaultVariant?.price?.current?.currency ??
    firstOffer?.price?.currency ??
    'USD';
  const payloadMerchantName =
    payloadOffers
      .map((offer) => String(offer?.merchant_name || '').trim())
      .find(Boolean) || undefined;

  return {
    product_id: payloadProduct.product_id,
    product_group_id: nextPayload.product_group_id,
    merchant_id: payloadProduct.merchant_id,
    merchant_name: payloadMerchantName,
    sellable_item_group_id: nextPayload.sellable_item_group_id,
    product_line_id: nextPayload.product_line_id,
    review_family_id: nextPayload.review_family_id,
    identity_confidence: nextPayload.identity_confidence,
    match_basis: nextPayload.match_basis,
    canonical_scope: nextPayload.canonical_scope,
    title: payloadProduct.title || 'Product',
    description: payloadProduct.description || '',
    price:
      Number.isFinite(Number(payloadAmount)) && payloadAmount != null
        ? Number(payloadAmount)
        : 0,
    currency: payloadCurrency || 'USD',
    image_url: payloadProduct.image_url,
    in_stock:
      typeof payloadProduct.availability?.in_stock === 'boolean'
        ? payloadProduct.availability.in_stock
        : true,
    brand: payloadProduct.brand?.name,
    category: Array.isArray(payloadProduct.category_path)
      ? payloadProduct.category_path.join(' / ')
      : undefined,
    tags: payloadProduct.tags,
    department: payloadProduct.department,
    source: payloadProduct.source,
    commerce_mode: payloadProduct.commerce_mode,
    checkout_handoff: payloadProduct.checkout_handoff,
    purchase_route: payloadProduct.purchase_route,
    external_redirect_url: payloadProduct.external_redirect_url,
    externalRedirectUrl: productAny.externalRedirectUrl,
    affiliate_url: productAny.affiliate_url,
    external_url: productAny.external_url,
    redirect_url: productAny.redirect_url,
    url: payloadProduct.url,
    canonical_url: payloadProduct.canonical_url,
    destination_url: payloadProduct.destination_url,
    source_url: payloadProduct.source_url,
    platform: productAny.platform,
    variants: payloadVariants,
    offers: payloadOffers,
    offers_count:
      nextPayload.offers_count != null
        ? nextPayload.offers_count
        : payloadOffers.length
          ? payloadOffers.length
          : undefined,
    default_offer_id: nextPayload.default_offer_id,
    best_price_offer_id: nextPayload.best_price_offer_id,
    variant_id: payloadProduct.default_variant_id,
    raw_detail: {
      ...productAny,
      ...(payloadProduct.default_variant_id
        ? { default_variant_id: payloadProduct.default_variant_id }
        : {}),
      ...(payloadVariants.length ? { variants: payloadVariants } : {}),
      ...(payloadOffers.length ? { offers: payloadOffers } : {}),
    },
  };
}

async function fetchSimilarPdpDetail(args: {
  product_id: string;
  merchant_id?: string | null;
  timeout_ms?: number;
}): Promise<ProductResponse | null> {
  const merchantId = String(args.merchant_id || '').trim();
  const productId = String(args.product_id || '').trim();
  if (!merchantId || !productId) return null;

  try {
    const exactPdp = await getPdpV2({
      product_id: productId,
      merchant_id: merchantId,
      include: ['offers', 'variant_selector'],
      timeout_ms: args.timeout_ms,
    });
    return buildSimilarDetailFromPdpPayload(mapPdpV2ToPdpPayload(exactPdp));
  } catch {
    return null;
  }
}

function getDisplayMerchantName(offer: Offer | null | undefined, detail: ProductResponse | null | undefined): string | null {
  const candidates = [
    offer?.merchant_name,
    detail?.merchant_name,
    offer?.merchant_id,
    detail?.merchant_id,
  ];
  for (const value of candidates) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return null;
}

function StarRating({ value }: { value: number }) {
  const rounded = Math.round(value);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn('h-3 w-3', i < rounded ? 'fill-gold text-gold' : 'text-muted-foreground')}
        />
      ))}
    </div>
  );
}

const SIMILAR_PAGE_SIZE = 6;
const SIMILAR_MAX = 30;

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeRecommendationItems(
  items: unknown[],
  fallbackCurrency: string,
): RecommendationsData['items'] {
  return items
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const source = item as Record<string, unknown>;
      const productId = String(
        source.product_id ||
          source.id ||
          (source.productRef as any)?.product_id ||
          (source.product_ref as any)?.product_id ||
          '',
      ).trim();
      if (!productId) return null;

      const merchantId = String(
        source.merchant_id ||
          source.merchantId ||
          (source.merchant as any)?.id ||
          (source.productRef as any)?.merchant_id ||
          (source.product_ref as any)?.merchant_id ||
          '',
      ).trim();

      const priceAmount =
        toFiniteNumber((source.price as any)?.amount) ??
        toFiniteNumber(source.price_amount) ??
        toFiniteNumber(source.price) ??
        0;
      const priceCurrency =
        String((source.price as any)?.currency || source.currency || '').trim() || fallbackCurrency;

      const rating = toFiniteNumber(source.rating);
      const reviewCount =
        toFiniteNumber(source.review_count) ?? toFiniteNumber(source.reviewCount);
      const variantCount =
        toFiniteNumber(source.variant_count) ??
        toFiniteNumber(source.variantCount) ??
        (Array.isArray(source.variants) ? source.variants.length : null);
      const rawProductType = String(source.product_type || source.productType || '').trim();
      const rawCategory = String(source.category || '').trim();
      const rawDepartment = String(source.department || '').trim();
      const cardTitle = String(source.card_title || source.cardTitle || '').trim();
      const cardSubtitle = String(source.card_subtitle || source.cardSubtitle || '').trim();
      const cardHighlight = String(source.card_highlight || source.cardHighlight || '').trim();
      const cardBadge = String(source.card_badge || source.cardBadge || '').trim();
      const description = String(source.description || '').trim();
      const brand = String(
        source.brand ||
          (source.brand as any)?.name ||
          '',
      ).trim();
      const sourceKind = String(source.source || '').trim();
      const reason = String(source.reason || '').trim();
      const tags = Array.isArray(source.tags)
        ? source.tags.map((value) => String(value || '').trim()).filter(Boolean)
        : [];
      const marketSignalBadges = Array.isArray(source.market_signal_badges)
        ? source.market_signal_badges
            .map((badge) => {
              if (!badge || typeof badge !== 'object') return null;
              const badgeLabel = String((badge as any).badge_label || '').trim();
              if (!badgeLabel) return null;
              return {
                ...(typeof (badge as any).badge_type === 'string' && (badge as any).badge_type.trim()
                  ? { badge_type: String((badge as any).badge_type).trim() }
                  : {}),
                badge_label: badgeLabel,
              };
            })
            .filter(Boolean) as NonNullable<RecommendationsData['items'][number]['market_signal_badges']>
        : [];
      const searchCard =
        source.search_card && typeof source.search_card === 'object'
          ? {
              ...(typeof (source.search_card as any).title_candidate === 'string' &&
              (source.search_card as any).title_candidate.trim()
                ? { title_candidate: String((source.search_card as any).title_candidate).trim() }
                : {}),
              ...(typeof (source.search_card as any).compact_candidate === 'string' &&
              (source.search_card as any).compact_candidate.trim()
                ? { compact_candidate: String((source.search_card as any).compact_candidate).trim() }
                : {}),
              ...(typeof (source.search_card as any).highlight_candidate === 'string' &&
              (source.search_card as any).highlight_candidate.trim()
                ? { highlight_candidate: String((source.search_card as any).highlight_candidate).trim() }
                : {}),
              ...(typeof (source.search_card as any).proof_badge_candidate === 'string' &&
              (source.search_card as any).proof_badge_candidate.trim()
                ? { proof_badge_candidate: String((source.search_card as any).proof_badge_candidate).trim() }
                : {}),
            }
          : null;
      const shoppingCard =
        source.shopping_card && typeof source.shopping_card === 'object'
          ? {
              ...(typeof (source.shopping_card as any).highlight === 'string' &&
              (source.shopping_card as any).highlight.trim()
                ? { highlight: String((source.shopping_card as any).highlight).trim() }
                : {}),
            }
          : null;
      const reviewSummary =
        source.review_summary && typeof source.review_summary === 'object'
          ? {
              ...(toFiniteNumber((source.review_summary as any).rating) != null
                ? { rating: Number((source.review_summary as any).rating) }
                : {}),
              ...(toFiniteNumber((source.review_summary as any).average_rating) != null
                ? { average_rating: Number((source.review_summary as any).average_rating) }
                : {}),
              ...(toFiniteNumber((source.review_summary as any).avg_rating) != null
                ? { avg_rating: Number((source.review_summary as any).avg_rating) }
                : {}),
              ...(toFiniteNumber((source.review_summary as any).scale) != null
                ? { scale: Number((source.review_summary as any).scale) }
                : {}),
              ...(toFiniteNumber((source.review_summary as any).rating_scale) != null
                ? { rating_scale: Number((source.review_summary as any).rating_scale) }
                : {}),
              ...(toFiniteNumber((source.review_summary as any).review_count) != null
                ? { review_count: Number((source.review_summary as any).review_count) }
                : {}),
              ...(toFiniteNumber((source.review_summary as any).count) != null
                ? { count: Number((source.review_summary as any).count) }
                : {}),
              ...(toFiniteNumber((source.review_summary as any).total_reviews) != null
                ? { total_reviews: Number((source.review_summary as any).total_reviews) }
                : {}),
            }
          : null;

      return {
        product_id: productId,
        title: String(source.title || source.name || 'Untitled product'),
        ...(description ? { description } : {}),
        ...(brand ? { brand } : {}),
        ...(merchantId ? { merchant_id: merchantId } : {}),
        ...(typeof source.merchant_name === 'string' && source.merchant_name.trim()
          ? { merchant_name: source.merchant_name.trim() }
          : {}),
        ...(typeof source.image_url === 'string' ? { image_url: source.image_url } : {}),
        ...(priceAmount > 0
          ? {
              price: {
                amount: priceAmount,
                currency: priceCurrency,
              },
            }
          : {}),
        ...(rating != null ? { rating } : {}),
        ...(reviewCount != null ? { review_count: Math.max(0, Math.round(reviewCount)) } : {}),
        ...(variantCount != null ? { variant_count: Math.max(0, Math.trunc(variantCount)) } : {}),
        ...(sourceKind ? { source: sourceKind } : {}),
        ...(reason ? { reason } : {}),
        ...(rawProductType ? { product_type: rawProductType } : {}),
        ...(rawCategory ? { category: rawCategory } : {}),
        ...(rawDepartment ? { department: rawDepartment } : {}),
        ...(tags.length ? { tags } : {}),
        ...(cardTitle ? { card_title: cardTitle } : {}),
        ...(cardSubtitle ? { card_subtitle: cardSubtitle } : {}),
        ...(cardHighlight ? { card_highlight: cardHighlight } : {}),
        ...(cardBadge ? { card_badge: cardBadge } : {}),
        ...(searchCard && Object.keys(searchCard).length ? { search_card: searchCard } : {}),
        ...(shoppingCard && Object.keys(shoppingCard).length ? { shopping_card: shoppingCard } : {}),
        ...(marketSignalBadges.length ? { market_signal_badges: marketSignalBadges } : {}),
        ...(reviewSummary && Object.keys(reviewSummary).length ? { review_summary: reviewSummary } : {}),
      } satisfies RecommendationsData['items'][number];
    })
    .filter(Boolean) as RecommendationsData['items'];
}

function mergeRecommendationItemData(
  current: RecommendationsData['items'][number],
  incoming: RecommendationsData['items'][number],
): RecommendationsData['items'][number] {
  return {
    ...current,
    ...incoming,
    title: incoming.title || current.title,
    ...(incoming.description || current.description
      ? { description: incoming.description || current.description }
      : {}),
    ...(incoming.brand || current.brand ? { brand: incoming.brand || current.brand } : {}),
    ...(incoming.image_url || current.image_url
      ? { image_url: incoming.image_url || current.image_url }
      : {}),
    ...(incoming.price || current.price ? { price: incoming.price || current.price } : {}),
    ...((incoming.rating ?? current.rating) != null ? { rating: incoming.rating ?? current.rating } : {}),
    ...((incoming.review_count ?? current.review_count) != null
      ? { review_count: incoming.review_count ?? current.review_count }
      : {}),
    ...(incoming.merchant_id || current.merchant_id
      ? { merchant_id: incoming.merchant_id || current.merchant_id }
      : {}),
    ...(incoming.merchant_name || current.merchant_name
      ? { merchant_name: incoming.merchant_name || current.merchant_name }
      : {}),
    ...((incoming.variant_count ?? current.variant_count) != null
      ? { variant_count: incoming.variant_count ?? current.variant_count }
      : {}),
    ...(incoming.source || current.source ? { source: incoming.source || current.source } : {}),
    ...(incoming.reason || current.reason ? { reason: incoming.reason || current.reason } : {}),
    ...(incoming.product_type || current.product_type
      ? { product_type: incoming.product_type || current.product_type }
      : {}),
    ...(incoming.category || current.category ? { category: incoming.category || current.category } : {}),
    ...(incoming.department || current.department
      ? { department: incoming.department || current.department }
      : {}),
    ...(incoming.tags?.length || current.tags?.length ? { tags: incoming.tags?.length ? incoming.tags : current.tags } : {}),
    ...(incoming.card_title || current.card_title
      ? { card_title: incoming.card_title || current.card_title }
      : {}),
    ...(incoming.card_subtitle || current.card_subtitle
      ? { card_subtitle: incoming.card_subtitle || current.card_subtitle }
      : {}),
    ...(incoming.card_highlight || current.card_highlight
      ? { card_highlight: incoming.card_highlight || current.card_highlight }
      : {}),
    ...(incoming.card_badge || current.card_badge
      ? { card_badge: incoming.card_badge || current.card_badge }
      : {}),
    ...(incoming.search_card || current.search_card
      ? {
          search_card: {
            ...(current.search_card || {}),
            ...(incoming.search_card || {}),
          },
        }
      : {}),
    ...(incoming.shopping_card || current.shopping_card
      ? {
          shopping_card: {
            ...(current.shopping_card || {}),
            ...(incoming.shopping_card || {}),
          },
        }
      : {}),
    ...(incoming.market_signal_badges?.length || current.market_signal_badges?.length
      ? {
          market_signal_badges: incoming.market_signal_badges?.length
            ? incoming.market_signal_badges
            : current.market_signal_badges,
        }
      : {}),
    ...(incoming.review_summary || current.review_summary
      ? {
          review_summary: {
            ...(current.review_summary || {}),
            ...(incoming.review_summary || {}),
          },
        }
      : {}),
  };
}

function buildRecommendationSemanticKey(
  item: RecommendationsData['items'][number],
): string {
  const merchantId = String(item.merchant_id || '').trim();
  const normalizedTitle = String(item.title || '')
    .toLowerCase()
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalizedTitle) return '';
  return merchantId ? `${merchantId}:${normalizedTitle}` : normalizedTitle;
}

function mergeRecommendationItems(
  current: RecommendationsData['items'],
  incoming: RecommendationsData['items'],
): { items: RecommendationsData['items']; added: number } {
  const seenProductKeys = new Set<string>();
  const seenSemanticKeys = new Set<string>();
  const merged: RecommendationsData['items'] = [];
  const productKeyToIndex = new Map<string, number>();

  const append = (item: RecommendationsData['items'][number]) => {
    const productKey = `${String(item.merchant_id || '').trim()}:${String(item.product_id || '').trim()}`;
    const semanticKey = buildRecommendationSemanticKey(item);
    if (!item.product_id) return;
    if (seenProductKeys.has(productKey)) {
      const existingIndex = productKeyToIndex.get(productKey);
      if (existingIndex == null) return;
      merged[existingIndex] = mergeRecommendationItemData(merged[existingIndex], item);
      return;
    }
    if (semanticKey && seenSemanticKeys.has(semanticKey)) return;
    seenProductKeys.add(productKey);
    productKeyToIndex.set(productKey, merged.length);
    if (semanticKey) {
      seenSemanticKeys.add(semanticKey);
    }
    merged.push(item);
  };

  current.forEach(append);
  const before = merged.length;
  incoming.forEach(append);
  return { items: merged, added: merged.length - before };
}

function dedupeRecommendationItems(
  items: RecommendationsData['items'],
): RecommendationsData['items'] {
  return mergeRecommendationItems([], items).items;
}

function buildRecommendationProductKey(
  item: RecommendationsData['items'][number],
): string {
  return `${String(item.merchant_id || '').trim()}:${String(item.product_id || '').trim()}`;
}

function normalizeSimilarMetadata(
  metadata:
    | RecommendationsData['metadata']
    | null
    | undefined,
): RecommendationsData['metadata'] | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const hasMore = (metadata as any).has_more;
  const similarConfidence = String((metadata as any).similar_confidence || '').trim();
  const lowConfidence = Boolean((metadata as any).low_confidence);
  const reasonCodesRaw = (metadata as any).low_confidence_reason_codes;
  const reasonCodes = Array.isArray(reasonCodesRaw)
    ? reasonCodesRaw.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const retrievalMix = (metadata as any).retrieval_mix;
  const normalizedMix =
    retrievalMix && typeof retrievalMix === 'object'
      ? {
          ...(Number.isFinite(Number((retrievalMix as any).internal))
            ? { internal: Number((retrievalMix as any).internal) }
            : {}),
          ...(Number.isFinite(Number((retrievalMix as any).external))
            ? { external: Number((retrievalMix as any).external) }
            : {}),
        }
      : undefined;
  const underfillRaw = Number((metadata as any).underfill);
  const underfill = Number.isFinite(underfillRaw) ? Math.max(0, Math.trunc(underfillRaw)) : undefined;
  const selectionMix = (metadata as any).selection_mix;
  const normalizedSelectionMix =
    selectionMix && typeof selectionMix === 'object'
      ? {
          ...(Number.isFinite(Number((selectionMix as any).same_brand_same_category))
            ? { same_brand_same_category: Number((selectionMix as any).same_brand_same_category) }
            : {}),
          ...(Number.isFinite(Number((selectionMix as any).same_brand_other_category))
            ? { same_brand_other_category: Number((selectionMix as any).same_brand_other_category) }
            : {}),
          ...(Number.isFinite(Number((selectionMix as any).other_brand_same_category))
            ? { other_brand_same_category: Number((selectionMix as any).other_brand_same_category) }
            : {}),
          ...(Number.isFinite(Number((selectionMix as any).other_brand_same_vertical))
            ? { other_brand_same_vertical: Number((selectionMix as any).other_brand_same_vertical) }
            : {}),
          ...(Number.isFinite(Number((selectionMix as any).semantic_peer))
            ? { semantic_peer: Number((selectionMix as any).semantic_peer) }
            : {}),
        }
      : undefined;
  const baseSemantic = (metadata as any).base_semantic;
  const normalizedBaseSemantic =
    baseSemantic && typeof baseSemantic === 'object'
      ? {
          ...(typeof (baseSemantic as any).brand === 'string'
            ? { brand: String((baseSemantic as any).brand).trim() || null }
            : {}),
          ...(typeof (baseSemantic as any).vertical === 'string'
            ? { vertical: String((baseSemantic as any).vertical).trim() || null }
            : {}),
          ...(typeof (baseSemantic as any).inferred === 'boolean'
            ? { inferred: (baseSemantic as any).inferred }
            : {}),
          ...(Number.isFinite(Number((baseSemantic as any).signal_strength))
            ? { signal_strength: Number((baseSemantic as any).signal_strength) }
            : {}),
        }
      : undefined;

  return {
    ...(typeof hasMore === 'boolean' ? { has_more: hasMore } : {}),
    ...(similarConfidence ? { similar_confidence: similarConfidence } : {}),
    ...(lowConfidence ? { low_confidence: true } : {}),
    ...(reasonCodes.length ? { low_confidence_reason_codes: reasonCodes } : {}),
    ...(underfill != null ? { underfill } : {}),
    ...(normalizedMix && (normalizedMix.internal != null || normalizedMix.external != null)
      ? { retrieval_mix: normalizedMix }
      : {}),
    ...(normalizedSelectionMix && Object.keys(normalizedSelectionMix).length > 0
      ? { selection_mix: normalizedSelectionMix }
      : {}),
    ...(normalizedBaseSemantic && Object.keys(normalizedBaseSemantic).length > 0
      ? { base_semantic: normalizedBaseSemantic }
      : {}),
  };
}

function getInitialSimilarState(payload: PDPPayload): {
  items: RecommendationsData['items'];
  strategy: string;
  metadata: RecommendationsData['metadata'] | null;
  rawCount: number;
} {
  const payloadRecommendations = getRecommendationsModuleData(payload);
  const recommendationCurrencyFallback =
    payload.product.price?.current.currency || payload.product.price?.compare_at?.currency || 'USD';
  const rawItems = normalizeRecommendationItems(
    payloadRecommendations?.items || [],
    recommendationCurrencyFallback,
  );

  return {
    items: dedupeRecommendationItems(rawItems),
    strategy:
      typeof payloadRecommendations?.strategy === 'string' && payloadRecommendations.strategy.trim()
        ? payloadRecommendations.strategy
        : 'related_products',
    metadata: normalizeSimilarMetadata(payloadRecommendations?.metadata),
    rawCount: Array.isArray(payloadRecommendations?.items) ? payloadRecommendations.items.length : 0,
  };
}

export function PdpContainer({
  payload: initialPayload,
  initialQuantity = 1,
  mode,
  onAddToCart,
  onBuyNow,
  onWriteReview,
  onSeeAllReviews,
  ugcCapabilities,
}: {
  payload: PDPPayload;
  initialQuantity?: number;
  mode?: 'beauty' | 'generic';
  onAddToCart: (args: {
    variant: Variant;
    quantity: number;
    merchant_id?: string;
    product_id?: string;
    offer_id?: string;
  }) => void;
  onBuyNow: (args: {
    variant: Variant;
    quantity: number;
    merchant_id?: string;
    product_id?: string;
    offer_id?: string;
  }) => void;
  onWriteReview?: () => void;
  onSeeAllReviews?: () => void;
  ugcCapabilities?: UgcCapabilities | null;
}) {
  const [payload, setPayload] = useState(initialPayload);
  const [selectedVariantId, setSelectedVariantId] = useState(
    initialPayload.product.default_variant_id || initialPayload.product.variants?.[0]?.variant_id,
  );
  const [quantity, setQuantity] = useState(initialQuantity);
  const reviewsTracked = useRef(false);
  const recentPurchasesTracked = useRef(false);
  const ugcTracked = useRef(false);
  const similarTracked = useRef(false);
  const [activeTab, setActiveTab] = useState('product');
  const [showColorSheet, setShowColorSheet] = useState(false);
  const [showOfferSheet, setShowOfferSheet] = useState(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [mediaViewer, setMediaViewer] = useState<{
    isOpen: boolean;
    mode: 'official' | 'ugc';
    source: string;
    initialIndex: number;
  }>({
    isOpen: false,
    mode: 'official',
    source: 'media_gallery',
    initialIndex: 0,
  });
  const [navVisible, setNavVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mounted, setMounted] = useState(false);
  const [promoDismissed, setPromoDismissed] = useState(false);
  const [ugcSnapshot, setUgcSnapshot] = useState(DEFAULT_UGC_SNAPSHOT);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const [questionOpen, setQuestionOpen] = useState(false);
  const [questionText, setQuestionText] = useState('');
  const [questionSubmitting, setQuestionSubmitting] = useState(false);
  const [ugcQuestions, setUgcQuestions] = useState<QuestionListItem[]>([]);
  const questionsFetchedProductIdRef = useRef<string>('');
  const latestProductGroupIdRef = useRef<string | null>(null);
  const productLineSwitchRequestRef = useRef(0);
  const productLineSwitchPendingRef = useRef(false);
  const productLinePayloadCacheRef = useRef(new Map<string, PDPPayload>());
  const productLinePayloadInflightRef = useRef(new Map<string, Promise<PDPPayload | null>>());
  const productLinePrefetchAttemptedRef = useRef(new Set<string>());
  const [pendingProductLineProductId, setPendingProductLineProductId] = useState<string | null>(null);

  useEffect(() => {
    setPayload(initialPayload);
  }, [initialPayload]);

  useEffect(() => {
    if (pendingProductLineProductId) return;
    const cacheKey = buildProductLinePayloadCacheKey(
      payload.product.product_id,
      payload.product.merchant_id,
    );
    if (!cacheKey) return;
    productLinePayloadCacheRef.current.set(cacheKey, payload);
  }, [payload, pendingProductLineProductId]);

  const variants = useMemo(() => payload.product.variants ?? [], [payload.product.variants]);

  const selectedVariant = useMemo(() => {
    return variants.find((v) => v.variant_id === selectedVariantId) || variants[0];
  }, [variants, selectedVariantId]);
  const variantSelectorData = getModuleData<VariantSelectorModuleData>(payload, 'variant_selector');
  const productLineOptions = useMemo(
    () =>
      normalizeProductLineOptions(
        payload.product.product_line_options?.length
          ? payload.product.product_line_options
          : variantSelectorData?.product_line_options,
      ),
    [payload.product.product_line_options, variantSelectorData?.product_line_options],
  );
  const selectedProductLineOption = useMemo(() => {
    const currentProductId = String(payload.product.product_id || '').trim();
    const currentMerchantId = String(payload.product.merchant_id || '').trim();
    return (
      productLineOptions.find((option) => option.selected) ||
      productLineOptions.find((option) => {
        const optionProductId = String(option.product_id || '').trim();
        const optionMerchantId = String(option.merchant_id || '').trim();
        return (
          optionProductId === currentProductId &&
          (!optionMerchantId || !currentMerchantId || optionMerchantId === currentMerchantId)
        );
      }) ||
      null
    );
  }, [payload.product.merchant_id, payload.product.product_id, productLineOptions]);
  const pendingProductLineOption = useMemo(
    () =>
      productLineOptions.find(
        (option) => String(option.product_id || '').trim() === pendingProductLineProductId,
      ) || null,
    [pendingProductLineProductId, productLineOptions],
  );
  const productLineOptionName = useMemo(
    () =>
      String(
        payload.product.product_line_option_name ||
          variantSelectorData?.product_line_option_name ||
          selectedProductLineOption?.option_name ||
          productLineOptions[0]?.option_name ||
          'Option',
      ).trim(),
    [
      payload.product.product_line_option_name,
      productLineOptions,
      selectedProductLineOption?.option_name,
      variantSelectorData?.product_line_option_name,
    ],
  );
  const productLineOptionAxis = String(selectedProductLineOption?.axis || productLineOptions[0]?.axis || '')
    .trim()
    .toLowerCase();

  const isInStock =
    typeof selectedVariant?.availability?.in_stock === 'boolean'
      ? selectedVariant.availability.in_stock
      : typeof payload.product.availability?.in_stock === 'boolean'
        ? payload.product.availability.in_stock
        : true;

  const availableQuantity = useMemo(() => {
    const qty = selectedVariant?.availability?.available_quantity ?? payload.product.availability?.available_quantity;
    if (typeof qty !== 'number' || !Number.isFinite(qty)) return undefined;
    return Math.max(0, Math.floor(qty));
  }, [payload.product.availability?.available_quantity, selectedVariant?.availability?.available_quantity]);

  const stockEstimateLabel = isInStock
    ? availableQuantity != null && availableQuantity <= 5
      ? 'Low stock'
      : 'In stock'
    : null;

  const maxQuantity = availableQuantity != null && availableQuantity > 0 ? availableQuantity : undefined;
  const resolvedQuantity = maxQuantity != null ? Math.min(quantity, maxQuantity) : quantity;

  useEffect(() => {
    if (maxQuantity == null) return;
    setQuantity((q) => Math.min(Math.max(1, q), maxQuantity));
  }, [maxQuantity, selectedVariantId]);

  const resolvedMode: 'beauty' | 'generic' = mode || (isBeautyProduct(payload.product) ? 'beauty' : 'generic');

  const media = getModuleData<MediaGalleryData>(payload, 'media_gallery');
  const pricePromo = getModuleData<PricePromoData>(payload, 'price_promo');
  const productIntel = getModuleData<ProductIntelData>(payload, 'product_intel');
  const productFacts = getModuleData<ProductFactsData>(payload, 'product_facts');
  const productOverview = getModuleData<ProductDetailsData>(payload, 'product_overview');
  const supplementalDetails = getModuleData<ProductDetailsData>(payload, 'supplemental_details');
  const isExternalSeedProduct =
    String(payload.product.merchant_id || '').trim().toLowerCase() === 'external_seed';
  const activeIngredients = sanitizeActiveIngredientsData(
    getModuleData<ActiveIngredientsData>(payload, 'active_ingredients'),
  );
  const ingredientsInci = sanitizeIngredientsInciData(
    getModuleData<IngredientsInciData>(payload, 'ingredients_inci'),
  );
  const howToUse = sanitizeHowToUseData(
    getModuleData<HowToUseData>(payload, 'how_to_use'),
  );
  const materials = getModuleData<ProductDetailsData>(payload, 'materials');
  const productSpecs = getModuleData<ProductDetailsData>(payload, 'product_specs');
  const sizeFitDetails = getModuleData<ProductDetailsData>(payload, 'size_fit');
  const careInstructions = getModuleData<ProductDetailsData>(payload, 'care_instructions');
  const usageSafety = getModuleData<ProductDetailsData>(payload, 'usage_safety');
  const hasGenericStructuredBlocks = Boolean(
    materials?.sections?.length ||
      productSpecs?.sections?.length ||
      sizeFitDetails?.sections?.length ||
      careInstructions?.sections?.length ||
      usageSafety?.sections?.length,
  );
  const details = chooseProductDetailsData({
    productFacts,
    productOverview,
    supplementalDetails,
    hasStructuredBlocks: Boolean(
      activeIngredients ||
        ingredientsInci ||
        howToUse ||
        hasGenericStructuredBlocks ||
        isExternalSeedProduct,
    ),
  });
  const detailSectionParts = useMemo(
    () => partitionDetailSections(Array.isArray(details?.sections) ? details.sections : []),
    [details],
  );
  const reviews = getModuleData<ReviewsPreviewData>(payload, 'reviews_preview');
  const brandNameForCard = String(reviews?.brand_card?.name || payload.product.brand?.name || '').trim();
  const payloadProductId = String(payload.product.product_id || '').trim();
  const payloadRecommendations = getRecommendationsModuleData(payload);
  const payloadRecommendationItemCount = Array.isArray(payloadRecommendations?.items)
    ? payloadRecommendations.items.length
    : 0;
  const recommendationCurrencyFallback =
    payload.product.price?.current.currency || payload.product.price?.compare_at?.currency || 'USD';
  const initialSimilarState = getInitialSimilarState(payload);
  const promoDismissStorageKey = useMemo(
    () => `pdp_promo_dismissed:${payloadProductId}`,
    [payloadProductId],
  );
  const [currentRelativePath, setCurrentRelativePath] = useState<string | null>(null);
  const brandHref = brandNameForCard
    ? buildBrandHref({
        brandName: brandNameForCard,
        subtitle: reviews?.brand_card?.subtitle || null,
        sourceProductId: payload.product.product_id,
        sourceMerchantId: payload.product.merchant_id,
        returnUrl: currentRelativePath,
      })
    : undefined;
  const [similarItems, setSimilarItems] =
    useState<RecommendationsData['items']>(initialSimilarState.items);
  const [similarVisibleCount, setSimilarVisibleCount] = useState(SIMILAR_PAGE_SIZE);
  const [similarHasMore, setSimilarHasMore] = useState(
    Boolean(initialSimilarState.metadata?.has_more),
  );
  const [similarLoadingMore, setSimilarLoadingMore] = useState(false);
  const [similarLoadMoreError, setSimilarLoadMoreError] = useState(false);
  const [similarStrategy, setSimilarStrategy] = useState(initialSimilarState.strategy);
  const [similarMetadata, setSimilarMetadata] =
    useState<RecommendationsData['metadata'] | null>(initialSimilarState.metadata);
  const [similarDetailCache, setSimilarDetailCache] = useState<Record<string, ProductResponse>>({});
  const [similarQuickActionLoadingKey, setSimilarQuickActionLoadingKey] = useState<string | null>(null);
  const [similarQuickActionSheetOpen, setSimilarQuickActionSheetOpen] = useState(false);
  const [similarQuickActionItem, setSimilarQuickActionItem] =
    useState<RecommendationsData['items'][number] | null>(null);
  const [similarQuickActionDetail, setSimilarQuickActionDetail] = useState<ProductResponse | null>(null);
  const [similarQuickActionSelectedVariantId, setSimilarQuickActionSelectedVariantId] = useState('');
  const [similarQuickActionSubmitting, setSimilarQuickActionSubmitting] = useState(false);
  const defaultReviewScope = useMemo(() => resolveDefaultReviewScope(reviews), [reviews]);
  const [selectedReviewScope, setSelectedReviewScope] = useState<string | null>(defaultReviewScope);
  const similarResetProductIdRef = useRef<string>('');
  const similarNoGrowthCountRef = useRef(0);
  const similarAutoLoadSentinelRef = useRef<HTMLDivElement | null>(null);
  const similarAutoLoadPendingRef = useRef(false);

  const offers = useMemo(() => payload.offers ?? [], [payload.offers]);
  const internalFirstDefaultOfferId = useMemo(
    () =>
      pickInternalFirstOfferId({
        offers,
        merchantId: payload.product.merchant_id || null,
        defaultOfferId: payload.default_offer_id || null,
      }),
    [offers, payload.default_offer_id, payload.product.merchant_id],
  );
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(() => {
    return pickInternalFirstOfferId({
      offers,
      merchantId: payload.product.merchant_id || null,
      defaultOfferId: payload.default_offer_id || null,
    });
  });
  const selectedOffer = useMemo(() => {
    if (!offers.length) return null;
    if (!selectedOfferId) {
      return offers.find((offer) => offer.offer_id === internalFirstDefaultOfferId) || offers[0] || null;
    }
    return (
      offers.find((o) => o.offer_id === selectedOfferId) ||
      offers.find((offer) => offer.offer_id === internalFirstDefaultOfferId) ||
      offers[0] ||
      null
    );
  }, [offers, selectedOfferId, internalFirstDefaultOfferId]);
  const variantAwareDefaultOfferId = useMemo(() => {
    if (!offers.length) return payload.default_offer_id || internalFirstDefaultOfferId;
    const variantEligibleOffers = offers.filter((offer) => offerSupportsVariant(offer, selectedVariant));
    const candidateOffers = variantEligibleOffers.length ? variantEligibleOffers : offers;
    return pickInternalFirstOfferId({
      offers: candidateOffers,
      merchantId: payload.product.merchant_id || null,
      defaultOfferId: payload.default_offer_id || null,
    });
  }, [
    offers,
    internalFirstDefaultOfferId,
    payload.default_offer_id,
    payload.product.merchant_id,
    selectedVariant,
  ]);
  const variantAwareBestPriceOfferId = useMemo(() => {
    if (!offers.length) return payload.best_price_offer_id;
    const ranked = offers
      .map((offer) => ({
        offerId: offer.offer_id,
        total: resolveOfferPricing(offer, selectedVariant).totalAmount,
      }))
      .filter(
        (entry): entry is { offerId: string; total: number } =>
          typeof entry.total === 'number' && Number.isFinite(entry.total),
      )
      .sort((a, b) => {
        if (a.total !== b.total) return a.total - b.total;
        if (a.offerId === payload.best_price_offer_id) return -1;
        if (b.offerId === payload.best_price_offer_id) return 1;
        return a.offerId.localeCompare(b.offerId);
      });
    return ranked[0]?.offerId || payload.best_price_offer_id;
  }, [offers, payload.best_price_offer_id, selectedVariant]);
  const offerDebugEnabled = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    const raw = String(params.get('pdp_debug') || params.get('debug') || '').trim().toLowerCase();
    if (!raw || raw === '0' || raw === 'false') return false;
    const envAllowed = String(process.env.NEXT_PUBLIC_PDP_DEBUG || '').trim() === '1';
    if (process.env.NODE_ENV === 'production' && !envAllowed) return false;
    return true;
  }, []);

  useEffect(() => {
    setCurrentRelativePath(getCurrentRelativePath());
  }, []);

  useEffect(() => {
    setSelectedReviewScope(defaultReviewScope);
  }, [defaultReviewScope, payload.product.product_id]);

  useEffect(() => {
    setSelectedOfferId(internalFirstDefaultOfferId);
  }, [payload.product.product_id, internalFirstDefaultOfferId]);

  useEffect(() => {
    if (!selectedOffer || offerSupportsVariant(selectedOffer, selectedVariant)) return;
    if (!variantAwareDefaultOfferId || variantAwareDefaultOfferId === selectedOfferId) return;
    setSelectedOfferId(variantAwareDefaultOfferId);
  }, [selectedOffer, selectedOfferId, selectedVariant, variantAwareDefaultOfferId]);

  useEffect(() => {
    if (!offerDebugEnabled) return;
    // eslint-disable-next-line no-console
    console.info('[pdp][offer-debug]', {
      product_id: payload.product.product_id,
      product_group_id: payload.product_group_id || selectedOffer?.product_group_id || null,
      selected_offer_id: selectedOfferId,
      default_offer_id: payload.default_offer_id || null,
      best_price_offer_id: payload.best_price_offer_id || null,
      merchant_id: selectedOffer?.merchant_id || payload.product.merchant_id || null,
    });
  }, [
    offerDebugEnabled,
    payload.product.product_id,
    payload.product_group_id,
    payload.default_offer_id,
    payload.best_price_offer_id,
    payload.product.merchant_id,
    selectedOfferId,
    selectedOffer?.merchant_id,
    selectedOffer?.product_group_id,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.sessionStorage.getItem(promoDismissStorageKey);
    setPromoDismissed(raw === '1');
  }, [promoDismissStorageKey]);

  const colorOptions = useMemo(() => collectColorOptions(variants), [variants]);
  const shouldUseProductLineColorSelector =
    productLineOptions.length > 1 && ['shade', 'color', 'colour', 'tone', 'hue'].includes(productLineOptionAxis);
  const isProductLineSwitching = shouldUseProductLineColorSelector && pendingProductLineProductId !== null;
  const shouldRenderColorOptions = colorOptions.length > 0 && !shouldUseProductLineColorSelector;
  const productLinePrefetchTargets = useMemo(() => {
    if (!shouldUseProductLineColorSelector || productLineOptions.length <= 1) return [];

    const currentProductId = String(payload.product.product_id || '').trim();
    const currentMerchantId = String(payload.product.merchant_id || '').trim();
    const selectedIndex = Math.max(
      0,
      productLineOptions.findIndex((option) => isSameProductLineOption(option, currentProductId, currentMerchantId)),
    );

    return productLineOptions
      .map((option, index) => ({ option, index, distance: Math.abs(index - selectedIndex) }))
      .filter(({ option }) => !isSameProductLineOption(option, currentProductId, currentMerchantId))
      .sort((left, right) => {
        if (left.distance !== right.distance) return left.distance - right.distance;
        return left.index - right.index;
      })
      .slice(0, PRODUCT_LINE_PREFETCH_LIMIT)
      .map(({ option }) => option);
  }, [
    payload.product.merchant_id,
    payload.product.product_id,
    productLineOptions,
    shouldUseProductLineColorSelector,
  ]);
  const colorSheetOptions = useMemo<GenericColorOption[]>(() => {
    if (!colorOptions.length) return [];

    const byValue = new Map<string, GenericColorOption>();
    const score = (opt: GenericColorOption) =>
      (opt.label_image_url ? 3 : 0) + (opt.image_url ? 2 : 0) + (opt.swatch_hex ? 1 : 0);

    variants.forEach((variant) => {
      const value = getOptionValue(variant, ['color', 'colour', 'shade', 'tone']);
      if (!value) return;

      const candidate: GenericColorOption = {
        value,
        label_image_url: variant.label_image_url,
        image_url: variant.image_url,
        swatch_hex: variant.swatch?.hex || variant.beauty_meta?.shade_hex,
      };

      const existing = byValue.get(value);
      if (!existing || score(candidate) > score(existing)) {
        byValue.set(value, candidate);
      }
    });

    return colorOptions.map((value) => byValue.get(value) || { value });
  }, [colorOptions, variants]);
  const rawSizeOptions = useMemo(() => collectSizeOptions(variants), [variants]);
  const staticSizeOption = useMemo(() => getStaticSizeOption(variants), [variants]);
  const sizeOptions = useMemo(
    () => (staticSizeOption ? rawSizeOptions.filter((value) => value !== staticSizeOption) : rawSizeOptions),
    [rawSizeOptions, staticSizeOption],
  );
  const [selectedColor, setSelectedColor] = useState<string | null>(
    getOptionValue(selectedVariant, ['color', 'colour', 'shade', 'tone']) || null,
  );
  const [selectedSize, setSelectedSize] = useState<string | null>(
    getOptionValue(selectedVariant, ['size', 'fit']) || null,
  );

  useEffect(() => {
    setSelectedColor(getOptionValue(selectedVariant, ['color', 'colour', 'shade', 'tone']) || null);
    setSelectedSize(getOptionValue(selectedVariant, ['size', 'fit']) || null);
  }, [selectedVariantId, selectedVariant]);

  useEffect(() => {
    const nextVariantId = payload.product.default_variant_id || variants[0]?.variant_id;
    if (nextVariantId) {
      setSelectedVariantId(nextVariantId);
    }
    setActiveMediaIndex(0);
  }, [payload.product.product_id, payload.product.default_variant_id, variants]);

  useEffect(() => {
    setActiveMediaIndex(0);
  }, [selectedVariantId]);

  useEffect(() => {
    reviewsTracked.current = false;
    recentPurchasesTracked.current = false;
    ugcTracked.current = false;
    similarTracked.current = false;
  }, [payload.product.product_id]);

  useEffect(() => {
    if (similarResetProductIdRef.current === payloadProductId) return;
    similarResetProductIdRef.current = payloadProductId;

    setSimilarItems(initialSimilarState.items);
    setSimilarStrategy(initialSimilarState.strategy);
    setSimilarMetadata(initialSimilarState.metadata);
    setSimilarVisibleCount(SIMILAR_PAGE_SIZE);
    setSimilarHasMore(Boolean(initialSimilarState.metadata?.has_more));
    setSimilarLoadingMore(false);
    setSimilarLoadMoreError(false);
    setSimilarDetailCache({});
    setSimilarQuickActionLoadingKey(null);
    setSimilarQuickActionSheetOpen(false);
    setSimilarQuickActionItem(null);
    setSimilarQuickActionDetail(null);
    setSimilarQuickActionSelectedVariantId('');
    setSimilarQuickActionSubmitting(false);
    similarNoGrowthCountRef.current = 0;
  }, [
    initialSimilarState,
    payloadProductId,
  ]);

  useEffect(() => {
    const incomingItems = normalizeRecommendationItems(
      payloadRecommendations?.items || [],
      recommendationCurrencyFallback,
    );
    if (!incomingItems.length) return;
    setSimilarItems((prev) => mergeRecommendationItems(prev, incomingItems).items);
    if (
      typeof payloadRecommendations?.strategy === 'string' &&
      payloadRecommendations.strategy.trim()
    ) {
      setSimilarStrategy(payloadRecommendations.strategy);
    }
    const incomingMetadata = normalizeSimilarMetadata(payloadRecommendations?.metadata);
    if (incomingMetadata) {
      setSimilarMetadata((prev) => ({ ...(prev || {}), ...incomingMetadata }));
      if (typeof incomingMetadata.has_more === 'boolean') {
        setSimilarHasMore(incomingMetadata.has_more);
      }
    }
  }, [
    payloadRecommendations?.items,
    payloadRecommendations?.metadata,
    payloadRecommendations?.strategy,
    recommendationCurrencyFallback,
  ]);

  const recommendations = useMemo<RecommendationsData>(
    () => ({
      strategy: similarStrategy || payloadRecommendations?.strategy || 'related_products',
      ...(similarMetadata ? { metadata: similarMetadata } : {}),
      items: similarItems,
    }),
    [payloadRecommendations?.strategy, similarItems, similarMetadata, similarStrategy],
  );
  const similarStatus = useMemo(
    () => buildSimilarMainlineStatus(recommendations.metadata),
    [recommendations.metadata],
  );

  useEffect(() => {
    if (!isInStock) {
      setQuantity(1);
    }
  }, [isInStock]);

  useEffect(() => {
    pdpTracking.setBaseContext({
      page_request_id: payload.tracking.page_request_id,
      entry_point: payload.tracking.entry_point,
      experiment: payload.tracking.experiment,
      product_id: payload.product.product_id,
    });
    pdpTracking.track('pdp_view', { pdp_mode: resolvedMode });
    pdpTracking.track('placeholder_cta_click_removed', {
      pdp_mode: resolvedMode,
      removed_ctas: ['take_quiz', 'view_shade_guide', 'ai_fit'],
    });
  }, [payload, resolvedMode]);

  useEffect(() => {
    if (reviews && !reviewsTracked.current) {
      reviewsTracked.current = true;
      pdpTracking.track('pdp_module_impression', { module: 'reviews_preview' });
    }
  }, [reviews]);

  const baseMediaItems = useMemo(() => media?.items ?? [], [media]);
  const galleryItems: MediaItem[] = useMemo(
    () => getStableGalleryItems({
      items: baseMediaItems,
      variants,
      selectedVariantId,
    }),
    [baseMediaItems, selectedVariantId, variants],
  );
  const galleryPreviewItems = useMemo(
    () => (shouldUseProductLineColorSelector ? [] : media?.preview_items ?? []),
    [media, shouldUseProductLineColorSelector],
  );
  const galleryData = useMemo(
    () => ({
      items: galleryItems,
      gallery_scope: media?.gallery_scope,
      preview_scope: media?.preview_scope,
      preview_items: galleryPreviewItems,
    }),
    [galleryItems, galleryPreviewItems, media?.gallery_scope, media?.preview_scope],
  );

  const heroUrl = resolveHeroMediaUrl({
    activeMediaIndex,
    galleryItems,
    fallbackUrl: payload.product.image_url || '',
  });
  const selectedOfferPricing = useMemo(
    () => resolveOfferPricing(selectedOffer, selectedVariant),
    [selectedOffer, selectedVariant],
  );
  const selectedOfferVariant = selectedOfferPricing.matchedVariant;
  const selectedVariantPriceAmount = selectedVariant.price?.current.amount;
  const baseCurrency =
    selectedVariant.price?.current.currency || payload.product.price?.current.currency || 'USD';
  const basePriceAmount =
    selectedVariant.price?.current.amount ?? payload.product.price?.current.amount ?? 0;
  const selectedOfferItemPrice = selectedOfferVariant?.price?.current.amount;
  const offerCurrency = selectedOfferPricing.currency || baseCurrency;
  const offerItemPrice = selectedOfferPricing.itemAmount;
  const offerTotalPrice = selectedOfferPricing.totalAmount;
  const shouldUseOfferVariantPrice =
    selectedOffer != null &&
    typeof selectedOfferItemPrice === 'number' &&
    Number.isFinite(selectedOfferItemPrice);
  const shouldUseBaseVariantPrice =
    !shouldUseOfferVariantPrice &&
    typeof selectedVariantPriceAmount === 'number' &&
    Number.isFinite(selectedVariantPriceAmount);
  const displayCurrency = shouldUseOfferVariantPrice
    ? offerCurrency
    : shouldUseBaseVariantPrice
      ? baseCurrency
      : selectedOffer
        ? offerCurrency
        : baseCurrency;
  const displayPriceAmount = shouldUseOfferVariantPrice
    ? offerTotalPrice ?? basePriceAmount
    : shouldUseBaseVariantPrice
      ? basePriceAmount
      : selectedOffer && offerTotalPrice != null
        ? offerTotalPrice
        : basePriceAmount;

  const effectiveMerchantId = selectedOffer?.merchant_id || payload.product.merchant_id;
  const effectiveProductId = String(selectedOffer?.product_id || payload.product.product_id || '').trim();
  const effectiveShippingEta =
    selectedOffer?.shipping?.eta_days_range || payload.product.shipping?.eta_days_range;
  const effectiveReturns = selectedOffer?.returns || payload.product.returns;
  const actionsByType = payload.actions.reduce<Record<string, string>>((acc, action) => {
    acc[action.action_type] = action.label;
    return acc;
  }, {});
  const headerHeight = 44;
  const navRowHeight = navVisible ? 36 : 0;
  const scrollMarginTop = headerHeight + navRowHeight + 14;

  const ugcFromReviews =
    reviews?.preview_items?.flatMap((item) => item.media || []) || [];
  // Keep gallery visible by falling back to product gallery media when UGC is sparse.
  const ugcFromMedia = media?.items || [];
  const normalizedReviewUgc = ugcFromReviews.filter((item) => item?.url);
  const normalizedMediaUgc = ugcFromMedia.filter((item) => item?.url);

  useEffect(() => {
    setUgcSnapshot(DEFAULT_UGC_SNAPSHOT);
  }, [payload.product.product_id]);

  useEffect(() => {
    setUgcSnapshot((prev) =>
      lockFirstUgcSource({
        current: prev,
        reviewsItems: normalizedReviewUgc,
        mediaItems: normalizedMediaUgc,
      }),
    );
  }, [normalizedMediaUgc, normalizedReviewUgc]);

  const ugcItems = useMemo(
    () =>
      mergeUgcItems({
        reviewsItems: normalizedReviewUgc,
        mediaItems: normalizedMediaUgc,
      }),
    [normalizedMediaUgc, normalizedReviewUgc],
  );
  const ugcSectionTitle =
    ugcSnapshot.source === 'media' || (!ugcSnapshot.source && normalizedMediaUgc.length > 0)
      ? 'Gallery'
      : resolvedMode === 'beauty'
        ? 'Customer Photos'
        : 'Style Gallery';

  const sourceLocks = useMemo(
    () => ({
      reviews:
        Boolean(payload.x_source_locks?.reviews) ||
        payload.x_reviews_state === 'ready',
      similar:
        Boolean(payload.x_source_locks?.similar) ||
        payload.x_recommendations_state === 'ready',
      ugc: ugcSnapshot.locked,
    }),
    [
      payload.x_source_locks?.reviews,
      payload.x_source_locks?.similar,
      payload.x_reviews_state,
      payload.x_recommendations_state,
      ugcSnapshot.locked,
    ],
  );

  const pdpViewModel = useMemo(
    () =>
      buildPdpViewModel({
        offers,
        reviews,
        recommendations,
        ugcCount: ugcItems.length,
        offersLoadState: payload.x_offers_state,
        reviewsLoadState: payload.x_reviews_state,
        similarLoadState: payload.x_recommendations_state,
        sourceLocks,
      }),
    [
      offers,
      payload.x_offers_state,
      payload.x_recommendations_state,
      payload.x_reviews_state,
      recommendations,
      reviews,
      sourceLocks,
      ugcItems.length,
    ],
  );

  const moduleStates = pdpViewModel.moduleStates;
  const hasReviews = moduleStates.reviews_preview !== 'ABSENT';
  const hasRecommendationItems = similarItems.length > 0;
  const showRecommendationsSection = moduleStates.similar !== 'ABSENT';

  useEffect(() => {
    const count = Array.isArray(payload.product.recent_purchases)
      ? payload.product.recent_purchases.length
      : 0;
    if (count <= 0 || recentPurchasesTracked.current) return;
    recentPurchasesTracked.current = true;
    pdpTracking.track('pdp_recent_purchases_impression', { count });
  }, [payload.product.recent_purchases]);

  useEffect(() => {
    if (!ugcItems.length || ugcTracked.current) return;
    ugcTracked.current = true;
    pdpTracking.track('ugc_impression', {
      count_shown: Math.min(9, ugcItems.length),
      source: ugcSnapshot.source || 'unknown',
      locked: ugcSnapshot.locked,
    });
  }, [ugcItems, ugcSnapshot.locked, ugcSnapshot.source]);

  useEffect(() => {
    const count = similarItems.length;
    if (count <= 0 || similarTracked.current) return;
    similarTracked.current = true;
    pdpTracking.track('similar_impression', {
      count,
      source: pdpViewModel.sourceLocks.similar ? 'locked' : 'live',
      latency_bucket:
        payload.x_recommendations_state === 'loading'
          ? 'late'
          : 'early',
    });
  }, [
    payload.x_recommendations_state,
    pdpViewModel.sourceLocks.similar,
    similarItems.length,
  ]);

  const showSizeGuide = resolvedMode === 'generic' && !!payload.product.size_guide;
  const hasInsights = isDisplayableProductIntelData(productIntel);
  const showSizeHelper = useMemo(() => {
    if (resolvedMode !== 'generic') return false;
    const categoryPath = payload.product.category_path || [];
    const tags = Array.isArray(payload.product.tags) ? payload.product.tags : [];
    const department = payload.product.department ? [payload.product.department] : [];
    const haystack = [...categoryPath, ...tags, ...department].join(' ').toLowerCase();
    if (!haystack) return false;

    const keywords = [
      // apparel
      'apparel',
      'clothing',
      'tops',
      'bottoms',
      'pants',
      'jeans',
      'dress',
      'skirt',
      'outerwear',
      'jacket',
      'coat',
      'hoodie',
      'sweater',
      'shirt',
      't-shirt',
      'tee',
      'activewear',
      // footwear
      'footwear',
      'shoe',
      'shoes',
      'sneaker',
      'sneakers',
      'boot',
      'boots',
      'heel',
      'heels',
      'sandals',
      'slippers',
    ];

    return keywords.some((kw) => haystack.includes(kw));
  }, [payload.product.category_path, payload.product.department, payload.product.tags, resolvedMode]);
  const recentPurchases = Array.isArray(payload.product.recent_purchases)
    ? payload.product.recent_purchases
    : [];

  const tabs = useMemo(() => {
    return [
      { id: 'product', label: 'Product' },
      ...(hasInsights ? [{ id: 'insights', label: 'Insights' }] : []),
      ...(hasReviews ? [{ id: 'reviews', label: 'Reviews' }] : []),
      ...(showSizeGuide ? [{ id: 'size', label: 'Size' }] : []),
      { id: 'details', label: 'Details' },
      ...(showRecommendationsSection ? [{ id: 'similar', label: 'Similar' }] : []),
    ];
  }, [hasInsights, hasReviews, showSizeGuide, showRecommendationsSection]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    sectionRefs.current[tabId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab('product');
    }
  }, [tabs, activeTab]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let frame = 0;
    const updateNavVisibility = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const maxScroll = Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight,
        );
        const viewportThreshold = window.innerHeight * 1.1;
        const threshold =
          maxScroll >= viewportThreshold
            ? viewportThreshold
            : Math.max(80, maxScroll * 0.4);
        const nextVisible = maxScroll > 0 && window.scrollY >= threshold;
        setNavVisible(nextVisible);
      });
    };
    updateNavVisibility();
    window.addEventListener('scroll', updateNavVisibility, { passive: true });
    window.addEventListener('resize', updateNavVisibility);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', updateNavVisibility);
      window.removeEventListener('resize', updateNavVisibility);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let frame = 0;
    const updateActive = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const offset = headerHeight + (navVisible ? 36 : 0) + 10;
        const anchor = offset + Math.min(180, Math.max(96, window.innerHeight * 0.18));
        const entries = tabs
          .map((tab) => {
            const node = sectionRefs.current[tab.id];
            if (!node) return null;
            return { id: tab.id, top: node.getBoundingClientRect().top };
          })
          .filter(Boolean) as Array<{ id: string; top: number }>;

        if (!entries.length) return;
        const current = resolveVisiblePdpTab(entries, anchor);
        if (current && current !== activeTab) {
          setActiveTab(current);
        }
      });
    };
    updateActive();
    window.addEventListener('scroll', updateActive, { passive: true });
    window.addEventListener('resize', updateActive);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', updateActive);
      window.removeEventListener('resize', updateActive);
    };
  }, [tabs, activeTab, navVisible, headerHeight]);

  const handleColorSelect = (value: string) => {
    setSelectedColor(value);
    const match = findVariantByOptions({ variants, color: value, size: selectedSize });
    if (match) {
      setSelectedVariantId(match.variant_id);
      setActiveMediaIndex(0);
    }
  };

  const handleSizeSelect = (value: string) => {
    setSelectedSize(value);
    const match = findVariantByOptions({ variants, color: selectedColor, size: value });
    if (match) {
      setSelectedVariantId(match.variant_id);
      setActiveMediaIndex(0);
    }
  };

  const handleVariantSelect = (variantId: string) => {
    setSelectedVariantId(variantId);
    setActiveMediaIndex(0);
  };

  const handleBack = () => {
    if (typeof window === 'undefined') {
      router.push('/products');
      return;
    }
    const current = new URLSearchParams(window.location.search);
    const rawReturn =
      current.get('return') ||
      current.get('return_url') ||
      current.get('returnUrl') ||
      '';
    const safeReturn = safeReturnUrl(rawReturn || null);
    if (safeReturn) {
      if (safeReturn.startsWith('/')) {
        router.push(safeReturn);
      } else {
        window.location.assign(safeReturn);
      }
      return;
    }

    const entryFromQuery = String(current.get('entry') || '').trim().toLowerCase();
    const embedFromQuery = String(current.get('embed') || '').trim() === '1';
    const parentOriginHint =
      String(current.get('parent_origin') || '').trim() ||
      String(current.get('parentOrigin') || '').trim();
    const safeParentOrigin = safeReturnUrl(parentOriginHint || null);
    const fromExternalAgent = embedFromQuery || Boolean(safeParentOrigin) || isExternalAgentEntry(entryFromQuery);
    if (fromExternalAgent) {
      const posted = postRequestCloseToParent({ reason: 'pdp_back' });
      if (posted) return;

      const externalFallback = safeParentOrigin || resolveExternalAgentHomeUrl(entryFromQuery);
      if (externalFallback) {
        if (externalFallback.startsWith('/')) {
          router.push(externalFallback);
        } else {
          window.location.assign(externalFallback);
        }
        return;
      }
      router.push('/');
      return;
    }
    router.push('/products');
  };

  const handleShare = () => {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    pdpTracking.track('pdp_action_click', { action_type: 'share' });

    if (navigator.share) {
      navigator.share({ title: payload.product.title, url }).catch(() => {
        // ignore share cancel
      });
      return;
    }

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).catch(() => {
        // ignore clipboard failures
      });
    }
  };

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    pdpTracking.track('pdp_action_click', { action_type: 'search', query });
    router.push(`/products?q=${encodeURIComponent(query)}`);
  };

  const openViewer = useCallback(
    ({
      mode: nextMode,
      source,
      index,
      trackThumbnail = false,
    }: {
      mode: 'official' | 'ugc';
      source: string;
      index: number;
      trackThumbnail?: boolean;
    }) => {
      const total = nextMode === 'official' ? galleryItems.length : ugcItems.length;
      const safeIndex = total > 0 ? Math.min(Math.max(Math.floor(index), 0), total - 1) : 0;
      if (trackThumbnail) {
        pdpTracking.track('pdp_gallery_click_thumbnail', {
          source,
          index: safeIndex,
          mode: nextMode,
        });
      }
      pdpTracking.track('pdp_gallery_open_viewer', {
        mode: nextMode,
        source,
        from_index: safeIndex,
        total,
      });
      if (nextMode === 'official') {
        setActiveMediaIndex(safeIndex);
      }
      setMediaViewer({
        isOpen: true,
        mode: nextMode,
        source,
        initialIndex: safeIndex,
      });
    },
    [galleryItems.length, ugcItems.length],
  );

  const selectedVariantHeaderLabel = useMemo(
    () => {
      const variantLabel = getDisplayVariantLabel(selectedVariant, 'Default');
      const lineLabel = selectedProductLineOption?.label || '';
      if (!lineLabel) return variantLabel;
      if (!variantLabel || variantLabel === 'Default') return lineLabel;
      return `${lineLabel} / ${variantLabel}`;
    },
    [selectedProductLineOption?.label, selectedVariant],
  );
  const attributeOptions = extractAttributeOptions(selectedVariant, {
    variants: payload.product.variants,
    selectedLabel: selectedVariantHeaderLabel,
  });
  const beautyAttributes = extractBeautyAttributes(selectedVariant);
  const suppressOverviewInDetails = hasLowQualityOverviewSection(details);
  const hasStructuredDetailBlocks = Boolean(
    activeIngredients?.items?.length ||
      ingredientsInci?.items?.length ||
      howToUse?.steps?.length ||
      hasGenericStructuredBlocks ||
      activeIngredients?.raw_text ||
      ingredientsInci?.raw_text ||
      howToUse?.raw_text,
  );
  const hasNonOverviewDetails = Boolean(
    detailSectionParts.supplementalSections.length || detailSectionParts.brandStorySection,
  );
  const hasDetailsSection = Boolean(
    (!suppressOverviewInDetails && details) ||
      hasStructuredDetailBlocks ||
      hasNonOverviewDetails,
  );
  const activeIngredientQualityStatus = String(
    activeIngredients?.source_quality_status ||
      (activeIngredients as any)?.sourceQualityStatus ||
      activeIngredients?.source_origin ||
      '',
  ).trim().toLowerCase();
  const shouldHideLowConfidenceActiveIngredients =
    isExternalSeedProduct &&
    isLikelyBeautyExternalSeedProduct(payload.product, resolvedMode) &&
    !['regulatory_active', 'regulatory', 'otc', 'drug_facts', 'captured', 'verified', 'authoritative'].includes(
      activeIngredientQualityStatus,
    );
  const compareAmount =
    pricePromo?.compare_at?.amount ??
    selectedVariant.price?.compare_at?.amount ??
    payload.product.price?.compare_at?.amount;
  const discountPercent =
    compareAmount && compareAmount > displayPriceAmount
      ? Math.round((1 - displayPriceAmount / compareAmount) * 100)
      : null;
  const trustBadges = [];
  if (payload.product.brand?.name) trustBadges.push('Authentic');
  if (effectiveReturns?.return_window_days) {
    trustBadges.push(
      effectiveReturns.free_returns
        ? 'Free returns'
        : `Returns · ${effectiveReturns.return_window_days} days`,
    );
  }
  if (effectiveShippingEta?.length) {
    trustBadges.push(
      `Shipping ${effectiveShippingEta[0]}–${effectiveShippingEta[1]} days`,
    );
  }
  const showTrustBadges = resolvedMode === 'beauty' && trustBadges.length > 0;
  const hasRightColumnSelectorSection =
    productLineOptions.length > 1 ||
    shouldRenderColorOptions ||
    sizeOptions.length > 0 ||
    (!sizeOptions.length && !shouldRenderColorOptions && variants.length > 1);
  const hasRightColumnSupportInfo =
    showTrustBadges || Boolean(effectiveShippingEta?.length || effectiveReturns?.return_window_days);
  const isDesktopInfoSparse =
    !hasRightColumnSelectorSection &&
    !hasRightColumnSupportInfo &&
    moduleStates.offers !== 'LOADING' &&
    offers.length <= 1;

  const productId = payloadProductId;
  const productGroupId = String(payload.product_group_id || selectedOffer?.product_group_id || '').trim() || null;
  const merchantId = String(payload.product.merchant_id || '').trim() || null;
  latestProductGroupIdRef.current = productGroupId;

  const navigateToSimilarPdp = useCallback(
    (item: RecommendationsData['items'][number]) => {
      router.push(appendCurrentPathAsReturn(buildProductHref(item.product_id, item.merchant_id)));
    },
    [router],
  );

  const getSimilarActionVariants = useCallback((detail: ProductResponse) => {
    return buildProductVariants(detail, detail.raw_detail);
  }, []);

  const resolveSimilarOfferForVariant = useCallback(
    (detail: ProductResponse, variant: Variant | null | undefined): Offer | null => {
      const offers = Array.isArray(detail.offers) ? detail.offers : [];
      if (!offers.length) return null;
      const eligibleOffers = offers.filter((offer) => offerSupportsVariant(offer, variant));
      const candidateOffers = eligibleOffers.length ? eligibleOffers : offers;
      const recommendedOfferId = pickInternalFirstOfferId({
        offers: candidateOffers,
        merchantId: detail.merchant_id || null,
        defaultOfferId: detail.default_offer_id || null,
      });
      return (
        candidateOffers.find((offer) => offer.offer_id === recommendedOfferId) ||
        candidateOffers[0] ||
        null
      );
    },
    [],
  );

  const resolveSimilarActionLabel = useCallback(
    (detail: ProductResponse, variant: Variant | null | undefined): 'Buy' | 'Open' => {
      const preferredOffer = resolveSimilarOfferForVariant(detail, variant);
      const resolvedMerchantId = String(preferredOffer?.merchant_id || detail.merchant_id || '').trim();
      const redirectUrl = preferredOffer
        ? getExternalRedirectUrlFromOffer(preferredOffer)
        : getExternalRedirectUrlFromProduct(detail);
      const isExternal = isExternalCtaTarget({
        offer: preferredOffer,
        product: detail,
        merchantId: resolvedMerchantId,
        redirectUrl,
      });
      return isExternal ? 'Open' : 'Buy';
    },
    [resolveSimilarOfferForVariant],
  );

  const ensureSimilarDetail = useCallback(
    async (item: RecommendationsData['items'][number]) => {
      const key = buildRecommendationProductKey(item);
      const cached = similarDetailCache[key];
      if (cached) return cached;
      if (!item.merchant_id) return null;
      const detail = await fetchSimilarPdpDetail({
        product_id: item.product_id,
        merchant_id: item.merchant_id,
        timeout_ms: 4500,
      });
      if (!detail) return null;

      setSimilarDetailCache((prev) => ({ ...prev, [key]: detail }));
      const resolvedVariants = buildProductVariants(detail, detail.raw_detail);
      const normalized = normalizeRecommendationItems(
        [
          {
            ...detail,
            variant_count: resolvedVariants.length || undefined,
          },
        ],
        recommendationCurrencyFallback,
      );
      if (normalized[0]) {
        setSimilarItems((prev) => mergeRecommendationItems(prev, [normalized[0]!]).items);
      }
      return detail;
    },
    [recommendationCurrencyFallback, similarDetailCache],
  );

  const executeSimilarQuickAction = useCallback(
    async ({
      item,
      detail,
      variant,
      entrySurface,
    }: {
      item: RecommendationsData['items'][number];
      detail: ProductResponse;
      variant: Variant;
      entrySurface: 'card_cta' | 'variant_sheet';
    }) => {
      const preferredOffer = resolveSimilarOfferForVariant(detail, variant);
      const searchParams =
        typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
      const target = resolveCheckoutTarget({
        product: {
          ...detail,
          variants: getSimilarActionVariants(detail),
        },
        offers: detail.offers,
        variant,
        quantity: 1,
        merchantId: preferredOffer?.merchant_id || detail.merchant_id || undefined,
        productId: preferredOffer?.product_id || detail.product_id,
        offerId: preferredOffer?.offer_id || null,
        searchParams,
      });

      pdpTracking.track('similar_quick_action_resolve', {
        product_id: item.product_id,
        merchant_id: item.merchant_id || null,
        resolved_offer_id: preferredOffer?.offer_id || null,
        entry_surface: entrySurface,
        result: target.kind,
      });

      if (target.kind === 'checkout') {
        router.push(target.href);
        return;
      }
      if (target.kind === 'external') {
        toast.success(target.notice);
        window.open(target.url, '_blank', 'noopener,noreferrer');
        return;
      }
      navigateToSimilarPdp(item);
    },
    [getSimilarActionVariants, navigateToSimilarPdp, resolveSimilarOfferForVariant, router],
  );

  const handleSimilarQuickAction = useCallback(
    async (item: RecommendationsData['items'][number], index: number) => {
      const key = buildRecommendationProductKey(item);
      if (!key || similarQuickActionLoadingKey === key || similarQuickActionSubmitting) return;

      setSimilarQuickActionLoadingKey(key);
      pdpTracking.track('similar_quick_action_click', {
        index,
        product_id: item.product_id,
        merchant_id: item.merchant_id || null,
        source: pdpViewModel.sourceLocks.similar ? 'locked' : 'live',
      });

      try {
        const detail = await ensureSimilarDetail(item);
        if (!detail) {
          navigateToSimilarPdp(item);
          return;
        }
        const variants = getSimilarActionVariants(detail);
        const initialVariantId = getInitialVariantIdFromDetail(detail, variants);
        const initialVariant =
          variants.find((variant) => variant.variant_id === initialVariantId) || variants[0] || null;
        if (!initialVariant) {
          navigateToSimilarPdp(item);
          return;
        }
        if (variants.length <= 1) {
          await executeSimilarQuickAction({
            item,
            detail,
            variant: initialVariant,
            entrySurface: 'card_cta',
          });
          return;
        }

        setSimilarQuickActionItem(item);
        setSimilarQuickActionDetail(detail);
        setSimilarQuickActionSelectedVariantId(initialVariant.variant_id);
        setSimilarQuickActionSheetOpen(true);
      } finally {
        setSimilarQuickActionLoadingKey((current) => (current === key ? null : current));
      }
    },
    [
      ensureSimilarDetail,
      executeSimilarQuickAction,
      getSimilarActionVariants,
      navigateToSimilarPdp,
      pdpViewModel.sourceLocks.similar,
      similarQuickActionLoadingKey,
      similarQuickActionSubmitting,
    ],
  );

  const loadMoreSimilarProducts = useCallback(async (entrySurface: 'auto' | 'retry') => {
    const targetVisibleCount = Math.min(
      Math.max(similarVisibleCount, Math.min(similarItems.length, SIMILAR_MAX)) + SIMILAR_PAGE_SIZE,
      SIMILAR_MAX,
    );
    pdpTracking.track('similar_load_more', {
      loaded_count: similarItems.length,
      visible_count: Math.min(similarVisibleCount, similarItems.length),
      target_visible_count: targetVisibleCount,
      source: pdpViewModel.sourceLocks.similar ? 'locked' : 'live',
      entry_surface: entrySurface,
    });

    if (targetVisibleCount <= similarItems.length) {
      setSimilarVisibleCount(targetVisibleCount);
      setSimilarLoadMoreError(false);
      return;
    }

    if (similarLoadingMore || !productId) return;

    setSimilarLoadingMore(true);
    setSimilarLoadMoreError(false);
    try {
      const result = await getSimilarProductsMainline({
        product_id: productId,
        ...(merchantId ? { merchant_id: merchantId } : {}),
        limit: Math.min(SIMILAR_PAGE_SIZE, SIMILAR_MAX - similarItems.length),
        exclude_items: similarItems.map((item) => ({
          product_id: item.product_id,
          ...(item.merchant_id ? { merchant_id: item.merchant_id } : {}),
        })),
        timeout_ms: 8000,
      });

      const incomingItems = normalizeRecommendationItems(
        result.items,
        recommendationCurrencyFallback,
      );
      const incomingMetadata = normalizeSimilarMetadata(result.metadata);
      const merged = mergeRecommendationItems(similarItems, incomingItems);
      const mergedLength = merged.items.length;
      const addedCount = merged.added;

      setSimilarItems(merged.items);

      if (incomingMetadata) {
        setSimilarMetadata((prev) => ({ ...(prev || {}), ...incomingMetadata }));
      }

      if (addedCount === 0) {
        similarNoGrowthCountRef.current += 1;
      } else {
        similarNoGrowthCountRef.current = 0;
      }

      const stopForNoGrowth = similarNoGrowthCountRef.current >= SIMILAR_NO_GROWTH_STOP_THRESHOLD;
      const upstreamHasMore =
        typeof incomingMetadata?.has_more === 'boolean'
          ? incomingMetadata.has_more
          : result.page_info.has_more;

      setSimilarHasMore(Boolean(upstreamHasMore) && !stopForNoGrowth && mergedLength < SIMILAR_MAX);
      setSimilarVisibleCount(Math.min(targetVisibleCount, mergedLength));
    } catch {
      setSimilarLoadMoreError(true);
    } finally {
      setSimilarLoadingMore(false);
    }
  }, [
    merchantId,
    pdpViewModel.sourceLocks.similar,
    productId,
    recommendationCurrencyFallback,
    similarItems,
    similarLoadingMore,
    similarVisibleCount,
  ]);

  const handleSimilarRetryLoadMore = useCallback(async () => {
    await loadMoreSimilarProducts('retry');
  }, [loadMoreSimilarProducts]);

  const similarQuickActionVariants = useMemo(() => {
    if (!similarQuickActionDetail) return [];
    return getSimilarActionVariants(similarQuickActionDetail);
  }, [getSimilarActionVariants, similarQuickActionDetail]);

  const similarQuickActionSelectedVariant = useMemo(() => {
    if (!similarQuickActionVariants.length) return null;
    return (
      similarQuickActionVariants.find((variant) => variant.variant_id === similarQuickActionSelectedVariantId) ||
      similarQuickActionVariants[0] ||
      null
    );
  }, [similarQuickActionSelectedVariantId, similarQuickActionVariants]);

  const similarQuickActionLabel = useMemo<'Buy' | 'Open'>(() => {
    if (!similarQuickActionDetail || !similarQuickActionSelectedVariant) return 'Buy';
    return resolveSimilarActionLabel(similarQuickActionDetail, similarQuickActionSelectedVariant);
  }, [resolveSimilarActionLabel, similarQuickActionDetail, similarQuickActionSelectedVariant]);

  const similarQuickActionSellerLabel = useMemo(() => {
    if (!similarQuickActionDetail || !similarQuickActionSelectedVariant) return null;
    return getDisplayMerchantName(
      resolveSimilarOfferForVariant(similarQuickActionDetail, similarQuickActionSelectedVariant),
      similarQuickActionDetail,
    );
  }, [resolveSimilarOfferForVariant, similarQuickActionDetail, similarQuickActionSelectedVariant]);

  const similarQuickActionState = useMemo(() => {
    const state: Record<string, { label: 'Buy' | 'Open'; loading?: boolean }> = {};
    for (const item of similarItems.slice(0, Math.max(similarVisibleCount, SIMILAR_PAGE_SIZE))) {
      const key = buildRecommendationProductKey(item);
      const detail = similarDetailCache[key];
      const variants = detail ? getSimilarActionVariants(detail) : [];
      const defaultVariant = detail
        ? variants.find((variant) => variant.variant_id === getInitialVariantIdFromDetail(detail, variants)) ||
          variants[0] ||
          null
        : null;
      state[key] = {
        label:
          detail && defaultVariant
            ? resolveSimilarActionLabel(detail, defaultVariant)
            : String(item.merchant_id || '').trim().toLowerCase() === 'external_seed'
              ? 'Open'
              : 'Buy',
        ...(similarQuickActionLoadingKey === key ? { loading: true } : {}),
      };
    }
    return state;
  }, [
    getSimilarActionVariants,
    resolveSimilarActionLabel,
    similarDetailCache,
    similarItems,
    similarQuickActionLoadingKey,
    similarVisibleCount,
  ]);

  useEffect(() => {
    if (!showRecommendationsSection) return;
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;
    const node = similarAutoLoadSentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        const canRevealLoaded = similarVisibleCount < similarItems.length;
        const canFetchMore = similarHasMore && similarItems.length < SIMILAR_MAX;
        if ((!canRevealLoaded && !canFetchMore) || similarLoadingMore || similarLoadMoreError) return;
        if (similarAutoLoadPendingRef.current) return;
        similarAutoLoadPendingRef.current = true;
        pdpTracking.track('similar_auto_load', {
          loaded_count: similarItems.length,
          visible_count: Math.min(similarVisibleCount, similarItems.length),
          source: pdpViewModel.sourceLocks.similar ? 'locked' : 'live',
        });
        void loadMoreSimilarProducts('auto').finally(() => {
          similarAutoLoadPendingRef.current = false;
        });
      },
      { rootMargin: '240px 0px' },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      similarAutoLoadPendingRef.current = false;
    };
  }, [
    loadMoreSimilarProducts,
    pdpViewModel.sourceLocks.similar,
    showRecommendationsSection,
    similarHasMore,
    similarItems.length,
    similarLoadMoreError,
    similarLoadingMore,
    similarVisibleCount,
  ]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (!productId) return () => {};
    if (questionsFetchedProductIdRef.current === productId) return () => {};

    async function run() {
      try {
        questionsFetchedProductIdRef.current = productId;
        const groupId = latestProductGroupIdRef.current;
        const res = await listQuestions({
          productId,
          ...(groupId ? { productGroupId: groupId } : {}),
          limit: 10,
          timeout_ms: 6000,
        });
        if (cancelled) return;
        setUgcQuestions(res?.items || []);
      } catch {
        if (!cancelled && questionsFetchedProductIdRef.current === productId) {
          questionsFetchedProductIdRef.current = '';
        }
      }
    }

    timer = setTimeout(() => {
      void run();
    }, 220);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [productId]);

  const openQuestionsHub = () => {
    if (!productId) return;
    const params = new URLSearchParams();
    params.set('product_id', productId);
    if (productGroupId) params.set('product_group_id', productGroupId);
    if (merchantId) params.set('merchant_id', merchantId);
    router.push(`/community/questions?${params.toString()}`);
  };

  const openQuestionThread = (questionId: number) => {
    if (!productId) return;
    const qid = Number(questionId);
    if (!Number.isFinite(qid) || qid <= 0) return;
    const params = new URLSearchParams();
    params.set('product_id', productId);
    if (productGroupId) params.set('product_group_id', productGroupId);
    if (merchantId) params.set('merchant_id', merchantId);
    router.push(`/community/questions/${qid}?${params.toString()}`);
  };

  const handleProductLinePreviewSelect = useCallback(
    (item: MediaItem, index: number) => {
      const nextProductId = String(item.product_id || '').trim();
      if (!nextProductId) return;
      const nextMerchantId = String(item.merchant_id || '').trim();
      const currentProductId = String(payload.product.product_id || '').trim();
      const currentMerchantId = String(payload.product.merchant_id || '').trim();
      if (
        nextProductId === currentProductId &&
        (!nextMerchantId || nextMerchantId === currentMerchantId)
      ) {
        return;
      }
      const params = new URLSearchParams();
      if (nextMerchantId) params.set('merchant_id', nextMerchantId);
      if (currentRelativePath) params.set('return', currentRelativePath);
      pdpTracking.track('pdp_gallery_click_thumbnail', {
        source: 'product_line_preview',
        index,
        mode: 'preview_navigation',
        target_product_id: nextProductId,
        target_merchant_id: nextMerchantId || null,
      });
      router.push(
        `/products/${encodeURIComponent(nextProductId)}${params.toString() ? `?${params.toString()}` : ''}`,
      );
    },
    [currentRelativePath, payload.product.merchant_id, payload.product.product_id, router],
  );

  const ensureProductLineCorePayload = useCallback(
    (args: { productId: string; merchantId: string; timeoutMs?: number }) => {
      const { productId, merchantId, timeoutMs = 8000 } = args;
      const cacheKey = buildProductLinePayloadCacheKey(productId, merchantId);
      if (cacheKey) {
        const cachedPayload = productLinePayloadCacheRef.current.get(cacheKey);
        if (cachedPayload) {
          return Promise.resolve(cachedPayload);
        }
        const inflightRequest = productLinePayloadInflightRef.current.get(cacheKey);
        if (inflightRequest) {
          return inflightRequest;
        }
      }

      let requestPromise: Promise<PDPPayload | null>;
      requestPromise = getPdpV2({
        product_id: productId,
        ...(merchantId ? { merchant_id: merchantId } : {}),
        include: [...PRODUCT_LINE_FAST_INCLUDE],
        timeout_ms: timeoutMs,
      })
        .then((response) => {
          const mappedPayload = mapPdpV2ToPdpPayload(response);
          if (!mappedPayload) return null;
          const nextPayload = stripProductLineAsyncModules(mappedPayload);
          if (cacheKey) {
            productLinePayloadCacheRef.current.set(cacheKey, nextPayload);
          }
          return nextPayload;
        })
        .catch(() => null)
        .finally(() => {
          if (!cacheKey) return;
          if (productLinePayloadInflightRef.current.get(cacheKey) === requestPromise) {
            productLinePayloadInflightRef.current.delete(cacheKey);
          }
        });

      if (cacheKey) {
        productLinePayloadInflightRef.current.set(cacheKey, requestPromise);
      }
      return requestPromise;
    },
    [],
  );

  const backfillProductLineOptionalModules = useCallback(
    (args: { requestId: number; productId: string; merchantId: string }) => {
      const { requestId, productId, merchantId } = args;
      const cacheKey = buildProductLinePayloadCacheKey(productId, merchantId);

      void getPdpV2({
        product_id: productId,
        ...(merchantId ? { merchant_id: merchantId } : {}),
        include: ['reviews_preview'],
        timeout_ms: PRODUCT_LINE_REVIEWS_TIMEOUT_MS,
      })
        .then((response) => {
          const mapped = mapPdpV2ToPdpPayload(response);
          setPayload((current) => {
            if (productLineSwitchRequestRef.current !== requestId) return current;
            if (String(current.product.product_id || '').trim() !== productId) return current;
            const currentMerchantId = String(current.product.merchant_id || '').trim();
            if (merchantId && currentMerchantId && currentMerchantId !== merchantId) return current;
            const merged = mergeProductLineReviewsPayload(current, mapped);
            if (cacheKey) productLinePayloadCacheRef.current.set(cacheKey, merged);
            return merged;
          });
        })
        .catch(() => {
          setPayload((current) => {
            if (productLineSwitchRequestRef.current !== requestId) return current;
            if (String(current.product.product_id || '').trim() !== productId) return current;
            const currentMerchantId = String(current.product.merchant_id || '').trim();
            if (merchantId && currentMerchantId && currentMerchantId !== merchantId) return current;
            return {
              ...current,
              x_reviews_state: 'error',
            };
          });
        });

      void getPdpV2({
        product_id: productId,
        ...(merchantId ? { merchant_id: merchantId } : {}),
        include: ['similar'],
        timeout_ms: PRODUCT_LINE_SIMILAR_TIMEOUT_MS,
      })
        .then((response) => {
          const mapped = mapPdpV2ToPdpPayload(response);
          setPayload((current) => {
            if (productLineSwitchRequestRef.current !== requestId) return current;
            if (String(current.product.product_id || '').trim() !== productId) return current;
            const currentMerchantId = String(current.product.merchant_id || '').trim();
            if (merchantId && currentMerchantId && currentMerchantId !== merchantId) return current;
            const merged = mergeProductLineSimilarPayload(current, mapped);
            if (cacheKey) productLinePayloadCacheRef.current.set(cacheKey, merged);
            return merged;
          });
        })
        .catch(() => {
          setPayload((current) => {
            if (productLineSwitchRequestRef.current !== requestId) return current;
            if (String(current.product.product_id || '').trim() !== productId) return current;
            const currentMerchantId = String(current.product.merchant_id || '').trim();
            if (merchantId && currentMerchantId && currentMerchantId !== merchantId) return current;
            return {
              ...current,
              x_recommendations_state: 'error',
            };
          });
        });
    },
    [],
  );

  const prefetchProductLineOption = useCallback(
    (option: ProductLineOption) => {
      if (!shouldUseProductLineColorSelector) return;
      const productId = String(option.product_id || '').trim();
      const merchantId = String(option.merchant_id || '').trim();
      const currentProductId = String(payload.product.product_id || '').trim();
      const currentMerchantId = String(payload.product.merchant_id || '').trim();
      if (!productId || isSameProductLineOption(option, currentProductId, currentMerchantId)) {
        return;
      }
      const cacheKey = buildProductLinePayloadCacheKey(productId, merchantId);
      if (!cacheKey) return;
      productLinePrefetchAttemptedRef.current.add(cacheKey);
      void ensureProductLineCorePayload({
        productId,
        merchantId,
        timeoutMs: PRODUCT_LINE_PREFETCH_TIMEOUT_MS,
      });
    },
    [
      ensureProductLineCorePayload,
      payload.product.merchant_id,
      payload.product.product_id,
      shouldUseProductLineColorSelector,
    ],
  );

  useEffect(() => {
    if (!shouldUseProductLineColorSelector || pendingProductLineProductId || moduleStates.similar === 'LOADING') {
      return;
    }

    let cancelled = false;
    let nextIndex = 0;
    let activeCount = 0;
    const targets = productLinePrefetchTargets.filter((option) => {
      const productId = String(option.product_id || '').trim();
      const merchantId = String(option.merchant_id || '').trim();
      const cacheKey = buildProductLinePayloadCacheKey(productId, merchantId);
      if (!cacheKey) return false;
      if (productLinePayloadCacheRef.current.has(cacheKey)) return false;
      if (productLinePayloadInflightRef.current.has(cacheKey)) return false;
      if (productLinePrefetchAttemptedRef.current.has(cacheKey)) return false;
      return true;
    });

    if (!targets.length) return;

    const pump = () => {
      if (cancelled) return;
      while (activeCount < PRODUCT_LINE_PREFETCH_CONCURRENCY && nextIndex < targets.length) {
        const nextOption = targets[nextIndex++];
        const productId = String(nextOption.product_id || '').trim();
        const merchantId = String(nextOption.merchant_id || '').trim();
        const cacheKey = buildProductLinePayloadCacheKey(productId, merchantId);
        if (!cacheKey) continue;
        productLinePrefetchAttemptedRef.current.add(cacheKey);
        activeCount += 1;
        void ensureProductLineCorePayload({
          productId,
          merchantId,
          timeoutMs: PRODUCT_LINE_PREFETCH_TIMEOUT_MS,
        }).finally(() => {
          activeCount -= 1;
          pump();
        });
      }
    };

    pump();

    return () => {
      cancelled = true;
    };
  }, [
    ensureProductLineCorePayload,
    moduleStates.similar,
    pendingProductLineProductId,
    productLinePrefetchTargets,
    shouldUseProductLineColorSelector,
  ]);

  const handleProductLineOptionSelect = useCallback(
    async (option: ProductLineOption, index: number) => {
      if (productLineSwitchPendingRef.current) {
        return;
      }
      const nextProductId = String(option.product_id || '').trim();
      if (!nextProductId) return;
      const nextMerchantId = String(option.merchant_id || '').trim();
      const currentProductId = String(payload.product.product_id || '').trim();
      const currentMerchantId = String(payload.product.merchant_id || '').trim();
      if (
        nextProductId === currentProductId &&
        (!nextMerchantId || !currentMerchantId || nextMerchantId === currentMerchantId)
      ) {
        return;
      }
      const targetHref = buildProductHref(nextProductId, nextMerchantId);
      const params = new URLSearchParams(targetHref.split('?')[1] || '');
      if (currentRelativePath) params.set('return', currentRelativePath);
      pdpTracking.track('pdp_action_click', {
        action_type: 'select_product_line_option',
        option_name: productLineOptionName,
        option_label: option.label,
        option_axis: option.axis || null,
        index,
        target_product_id: nextProductId,
        target_merchant_id: nextMerchantId || null,
      });

      if (shouldUseProductLineColorSelector) {
        const requestId = productLineSwitchRequestRef.current + 1;
        productLineSwitchRequestRef.current = requestId;
        const previousPayload = payload;
        const targetPath = buildInlineProductLineTargetPath(
          nextProductId,
          nextMerchantId,
          currentRelativePath,
        );
        const cacheKey = buildProductLinePayloadCacheKey(nextProductId, nextMerchantId);
        const cachedPayload = cacheKey
          ? productLinePayloadCacheRef.current.get(cacheKey) || null
          : null;

        if (cachedPayload) {
          setPayload(cachedPayload);
          if (typeof window !== 'undefined') {
            window.history.replaceState(window.history.state, '', targetPath);
            setCurrentRelativePath(getCurrentRelativePath());
          }
          if (needsProductLineOptionalBackfill(cachedPayload)) {
            backfillProductLineOptionalModules({
              requestId,
              productId: nextProductId,
              merchantId: nextMerchantId,
            });
          }
          return;
        }

        productLineSwitchPendingRef.current = true;
        setPendingProductLineProductId(nextProductId);
        setPayload((current) => withSelectedProductLineOption(current, option));

        try {
          const nextPayload = await ensureProductLineCorePayload({
            productId: nextProductId,
            merchantId: nextMerchantId,
            timeoutMs: 8000,
          });
          if (productLineSwitchRequestRef.current !== requestId) return;
          if (!nextPayload) {
            throw new Error('PDP payload unavailable');
          }
          setPayload(nextPayload);
          if (typeof window !== 'undefined') {
            window.history.replaceState(window.history.state, '', targetPath);
            setCurrentRelativePath(getCurrentRelativePath());
          }
          if (needsProductLineOptionalBackfill(nextPayload)) {
            backfillProductLineOptionalModules({
              requestId,
              productId: nextProductId,
              merchantId: nextMerchantId,
            });
          }
        } catch {
          if (productLineSwitchRequestRef.current === requestId) {
            setPayload(previousPayload);
            toast.error('Could not switch shade. Please try again.');
          }
        } finally {
          if (productLineSwitchRequestRef.current === requestId) {
            productLineSwitchPendingRef.current = false;
            setPendingProductLineProductId(null);
          }
        }
        return;
      }

      const pathname = targetHref.split('?')[0];
      router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`);
    },
    [
      backfillProductLineOptionalModules,
      currentRelativePath,
      ensureProductLineCorePayload,
      payload,
      productLineOptionName,
      router,
      shouldUseProductLineColorSelector,
    ],
  );

  const mergedQuestions = useMemo(() => {
    const merged = new Map<
      string,
      {
        question_id?: number;
        question: string;
        answer?: string;
        replies?: number;
        source?: 'merchant_faq' | 'review_derived' | 'community' | string;
        source_label?: string;
        support_count?: number;
      }
    >();

    const upsert = (item: {
      question_id?: number;
      question: string;
      answer?: string;
      replies?: number;
      source?: 'merchant_faq' | 'review_derived' | 'community' | string;
      source_label?: string;
      support_count?: number;
    }) => {
      const text = String(item?.question || '').trim();
      const qid = Number(item?.question_id) || 0;
      const key = text
        .toLowerCase()
        .replace(/[?？]+$/, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      if (!text || !key) return;

      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, {
          ...(qid ? { question_id: qid } : {}),
          question: text,
          ...(item.answer ? { answer: item.answer } : {}),
          ...(typeof item.replies === 'number' ? { replies: item.replies } : {}),
          ...(item.source ? { source: item.source } : {}),
          ...(item.source_label ? { source_label: item.source_label } : {}),
          ...(typeof item.support_count === 'number' ? { support_count: item.support_count } : {}),
        });
        return;
      }

      if (!existing.question_id && qid) existing.question_id = qid;
      if (!existing.answer && item.answer) existing.answer = item.answer;
      if (existing.replies == null && typeof item.replies === 'number') existing.replies = item.replies;
      if ((!existing.source || existing.source === 'community') && item.source) existing.source = item.source;
      if (!existing.source_label && item.source_label) existing.source_label = item.source_label;
      if ((existing.support_count || 0) < (item.support_count || 0)) {
        existing.support_count = item.support_count;
      }
    };

    for (const q of ugcQuestions) {
      upsert({
        ...(Number(q?.question_id) ? { question_id: Number(q.question_id) } : {}),
        question: String(q?.question || '').trim(),
        ...(typeof q?.replies === 'number' ? { replies: q.replies } : {}),
        source: 'community',
        source_label: 'Community',
      });
    }

    const legacy = (reviews as any)?.questions;
    if (Array.isArray(legacy)) {
      for (const q of legacy) {
        upsert({
          ...(Number(q?.question_id) ? { question_id: Number(q.question_id) } : {}),
          question: String(q?.question || '').trim(),
          ...(q?.answer ? { answer: String(q.answer) } : {}),
          ...(typeof q?.replies === 'number' ? { replies: q.replies } : {}),
          ...(q?.source ? { source: String(q.source) } : {}),
          ...(q?.source_label ? { source_label: String(q.source_label) } : {}),
          ...(typeof q?.support_count === 'number' ? { support_count: q.support_count } : {}),
        });
      }
    }

    return Array.from(merged.values());
  }, [reviews, ugcQuestions]);

  const reviewsForRender = useMemo(() => {
    if (!reviews) return null;
    const scopedSummaries =
      reviews.scoped_summaries && typeof reviews.scoped_summaries === 'object'
        ? reviews.scoped_summaries
        : null;
    const activeScopeId =
      selectedReviewScope && scopedSummaries?.[selectedReviewScope]
        ? selectedReviewScope
        : defaultReviewScope;
    const activeSummary =
      activeScopeId && scopedSummaries?.[activeScopeId]
        ? scopedSummaries[activeScopeId]
        : null;

    return {
      ...(reviews as any),
      ...(activeSummary ? activeSummary : {}),
      aggregation_scope: activeScopeId || reviews.aggregation_scope,
      scope_label: buildReviewScopeLabel(activeScopeId, reviews),
      tabs: Array.isArray(reviews.tabs)
        ? reviews.tabs.map((tab) => ({
            ...tab,
            default: tab.id === activeScopeId,
          }))
        : reviews.tabs,
      questions: mergedQuestions,
    } as ReviewsPreviewData;
  }, [defaultReviewScope, mergedQuestions, reviews, selectedReviewScope]);

  const canUploadMedia = Boolean(ugcCapabilities?.canUploadMedia);
  const canWriteReview = Boolean(ugcCapabilities?.canWriteReview);
  const canAskQuestion = Boolean(ugcCapabilities?.canAskQuestion);
  const uploadReason = ugcCapabilities?.reasons?.upload;
  const reviewReason = ugcCapabilities?.reasons?.review;
  const questionReason = ugcCapabilities?.reasons?.question;
  const ugcUserState =
    uploadReason === 'NOT_AUTHENTICATED' ||
    reviewReason === 'NOT_AUTHENTICATED' ||
    questionReason === 'NOT_AUTHENTICATED'
      ? 'anonymous'
      : reviewReason === 'ALREADY_REVIEWED'
        ? 'already_reviewed'
        : canUploadMedia || canWriteReview
          ? 'purchaser'
          : 'non_purchaser';

  const requireLogin = (intent: 'upload' | 'review' | 'question') => {
    const redirect =
      typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}`
        : '/';
    const label =
      intent === 'upload'
        ? 'share media'
        : intent === 'review'
          ? 'write a review'
          : 'ask a question';
    toast.message(`Please log in to ${label}.`);
    router.push(`/login?redirect=${encodeURIComponent(redirect)}`);
  };

  const appendReviewWriteContext = (params: URLSearchParams) => {
    if (typeof window === 'undefined') return;
    const current = new URLSearchParams(window.location.search);
    const explicitReturn =
      current.get('return') ||
      current.get('return_url') ||
      current.get('returnUrl') ||
      '';
    const embedFromQuery = String(current.get('embed') || '').trim() === '1';
    const entryFromQuery = String(current.get('entry') || '').trim().toLowerCase();
    const isEmbed = embedFromQuery || isExternalAgentEntry(entryFromQuery);

    if (explicitReturn.trim()) {
      params.set('return', explicitReturn.trim());
    } else if (!isEmbed) {
      params.set('return', `${window.location.pathname}${window.location.search}`);
    }

    const passthroughKeys = ['embed', 'entry', 'parent_origin', 'parentOrigin'];
    for (const key of passthroughKeys) {
      const value = String(current.get(key) || '').trim();
      if (!value) continue;
      if (!params.has(key)) params.set(key, value);
    }
  };

  const handleUploadMedia = () => {
    pdpTracking.track('pdp_action_click', {
      action_type: 'ugc_upload',
      entry_point: 'station',
      user_state: ugcUserState,
      reason: uploadReason || null,
    });
    if (canUploadMedia) {
      const params = new URLSearchParams();
      params.set('product_id', productId);
      if (payload.product.merchant_id) params.set('merchant_id', payload.product.merchant_id);
      params.set('entry', 'ugc_upload');
      appendReviewWriteContext(params);
      router.push(`/reviews/write?${params.toString()}`);
      return;
    }
    if (uploadReason === 'NOT_AUTHENTICATED') {
      requireLogin('upload');
      return;
    }
    toast.message('Purchase required to share media.');
  };

  const handleWriteReview = () => {
    const reviewGate = resolveReviewGate({
      isAuthenticated: reviewReason !== 'NOT_AUTHENTICATED',
      canWriteReview,
      reason: reviewReason || null,
    });
    const reviewGateReason = reviewGateResultToReason(reviewGate);
    pdpTracking.track('pdp_action_click', {
      action_type: 'open_embed',
      target: 'write_review',
      entry_point: 'station',
      entry_surface: 'pdp',
      user_state: ugcUserState,
      reason: reviewReason || null,
      review_gate_reason: reviewGateReason,
      metric: 'pdp_review_gate_total',
    });
    if (reviewGate === 'ALLOW_WRITE') {
      if (onWriteReview) {
        onWriteReview();
      } else {
        const params = new URLSearchParams();
        params.set('product_id', productId);
        if (payload.product.merchant_id) params.set('merchant_id', payload.product.merchant_id);
        appendReviewWriteContext(params);
        router.push(`/reviews/write?${params.toString()}`);
      }
      return;
    }
    if (reviewGate === 'REQUIRE_LOGIN') {
      requireLogin('review');
      return;
    }
    const message = reviewGateMessage(reviewGate);
    if (message) toast.message(message);
  };

  const handleAskQuestion = () => {
    pdpTracking.track('pdp_action_click', {
      action_type: 'open_embed',
      target: 'ask_question',
      entry_point: 'station',
      user_state: ugcUserState,
      reason: questionReason || null,
    });
    if (canAskQuestion) {
      setQuestionOpen(true);
      return;
    }
    if (questionReason === 'NOT_AUTHENTICATED') {
      requireLogin('question');
      return;
    }
    if (questionReason === 'RATE_LIMITED') {
      toast.message('Too many questions. Please try again in a minute.');
      return;
    }
    requireLogin('question');
  };

  const submitQuestion = async () => {
    if (questionSubmitting) return;
    const question = questionText.trim();
    if (!question) {
      toast.message('Please enter a question.');
      return;
    }
    if (!productId) {
      toast.error('Missing product id.');
      return;
    }

    setQuestionSubmitting(true);
    try {
      const res = await postQuestion({
        productId,
        ...(productGroupId ? { productGroupId } : {}),
        question,
      });
      const qid = Number((res as any)?.question_id ?? (res as any)?.questionId ?? (res as any)?.id) || Date.now();
      toast.success('Question submitted.');
      setUgcQuestions((prev) => {
        const next: QuestionListItem = {
          question_id: qid,
          question,
          created_at: new Date().toISOString(),
          replies: 0,
        };
        return [next, ...(prev || []).filter((it) => String(it?.question || '').trim() !== question)].slice(0, 10);
      });
      setQuestionText('');
      setQuestionOpen(false);
    } catch (err: any) {
      if (err?.code === 'NOT_AUTHENTICATED' || err?.status === 401) {
        requireLogin('question');
        return;
      }
      if (err?.code === 'RATE_LIMITED' || err?.status === 429) {
        toast.error('Too many questions. Please try again in a minute.');
        return;
      }
      toast.error(err?.message || 'Failed to submit question.');
    } finally {
      setQuestionSubmitting(false);
    }
  };

  return (
    <div
      className={cn(
        'relative min-h-screen bg-background lovable-pdp',
        isDesktop ? 'pb-0' : 'pb-[calc(120px+env(safe-area-inset-bottom,0px))] lg:pb-0',
      )}
    >
      <div
        className={cn(
          'fixed left-0 right-0 z-50 pointer-events-none transition-colors',
          navVisible ? 'bg-gradient-to-b from-white via-white to-white/95 shadow-sm' : 'bg-transparent',
        )}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto flex h-11 max-w-md items-center gap-2 px-2.5 pointer-events-none sm:px-3 lg:max-w-6xl">
          <button
            type="button"
            onClick={handleBack}
            className={cn(
              'h-9 w-9 rounded-full border border-border flex items-center justify-center pointer-events-auto',
              navVisible ? 'bg-white' : 'bg-white/90',
            )}
            aria-label="Go back"
          >
            <ChevronLeft className="h-4 w-4 text-foreground" />
          </button>
          {navVisible ? (
            <form className="flex-1 pointer-events-auto" onSubmit={handleSearchSubmit}>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search"
                enterKeyHint="search"
                className="w-full h-8 rounded-full border border-border/70 bg-muted/40 px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </form>
          ) : null}
          <button
            type="button"
            onClick={handleShare}
            className={cn(
              'h-9 w-9 rounded-full border border-border flex items-center justify-center ml-auto pointer-events-auto',
              navVisible ? 'bg-white' : 'bg-white/90',
            )}
            aria-label="Share"
          >
            <Share2 className="h-4 w-4 text-foreground" />
          </button>
        </div>
        {navVisible ? (
          <div className="bg-white border-b border-border/60 pointer-events-auto">
            <div className="max-w-md lg:max-w-6xl mx-auto flex">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={cn(
                    'relative flex-1 py-2.5 text-xs font-semibold transition-colors',
                    activeTab === tab.id ? 'text-primary' : 'text-muted-foreground',
                  )}
                  aria-current={activeTab === tab.id ? 'page' : undefined}
                >
                  {tab.label}
                  {activeTab === tab.id ? (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-10 bg-primary rounded-full" />
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

        <div className="mx-auto w-full max-w-md lg:max-w-6xl">
        <div
          ref={(el) => {
            sectionRefs.current.product = el;
          }}
          style={{ scrollMarginTop }}
        >
          <div className="pb-2 lg:grid lg:grid-cols-[1fr_420px] lg:gap-10">
            <div className="lg:sticky lg:top-20 lg:self-start">
            <div className="relative">
              <MediaGallery
                data={galleryData}
                title={payload.product.title}
                fallbackUrl={payload.product.image_url}
                heroUrlOverride={heroUrl}
                activeIndex={activeMediaIndex}
                onSelect={(index) => {
                  setActiveMediaIndex(index);
                  pdpTracking.track('pdp_gallery_click_thumbnail', {
                    source: 'media_gallery',
                    index,
                    mode: 'official',
                  });
                }}
                onHeroSwipe={({ fromIndex, toIndex, direction }) => {
                  pdpTracking.track('pdp_gallery_swipe', {
                    mode: 'official',
                    source: 'media_gallery',
                    from_index: fromIndex,
                    to_index: toIndex,
                    direction,
                  });
                }}
                onSelectPreviewItem={handleProductLinePreviewSelect}
                aspectClass={resolvedMode === 'generic' ? 'aspect-square' : 'aspect-[6/5]'}
                fit={resolvedMode === 'generic' ? 'object-contain' : 'object-cover'}
              />
            </div>

            </div>

            <div className="lg:pt-3">
            <div className="px-2.5 py-1 sm:px-3 lg:px-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[26px] font-semibold text-foreground leading-none lg:text-[30px]">{formatPrice(displayPriceAmount, displayCurrency)}</span>
                {!isInStock ? (
                  <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">
                    Out of stock
                  </span>
                ) : stockEstimateLabel ? (
                  <span
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                      stockEstimateLabel === 'Low stock'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                    )}
                  >
                    {stockEstimateLabel}
                  </span>
                ) : null}
                {compareAmount && compareAmount > displayPriceAmount ? (
                  <span className="text-[10px] text-muted-foreground line-through">
                    {formatPrice(compareAmount, displayCurrency)}
                  </span>
                ) : null}
                {discountPercent ? (
                  <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    -{discountPercent}%
                  </span>
                ) : null}
                {offers.length > 1 ? (
                  <button
                    type="button"
                    className="ml-auto text-[11px] font-semibold text-primary"
                    onClick={() => {
                      pdpTracking.track('pdp_action_click', { action_type: 'open_offer_sheet' });
                      setShowOfferSheet(true);
                    }}
                  >
                    Other offers ({Math.max(0, offers.length - 1)})
                  </button>
                ) : null}
              </div>

              <h1 className="mt-1 text-[17px] font-semibold leading-snug text-foreground">
                {payload.product.brand?.name ? `${payload.product.brand.name} ` : ''}{payload.product.title}
              </h1>
              {payload.product.subtitle ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">{payload.product.subtitle}</p>
              ) : null}
              {selectedVariant ? (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Selected: <span className="text-foreground">{selectedVariantHeaderLabel}</span>
                </div>
              ) : null}

              {reviews?.review_count ? (
                <button
                  className="mt-1 flex items-center gap-1.5"
                  onClick={() => handleTabChange('reviews')}
                >
                  <StarRating value={(reviews.rating / reviews.scale) * 5} />
                  <span className="text-xs font-medium">{reviews.rating.toFixed(1)}</span>
                  <span className="text-xs text-muted-foreground">({reviews.review_count})</span>
                </button>
              ) : null}

              {resolvedMode === 'beauty' && beautyAttributes.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {beautyAttributes.map((opt) => (
                    <span
                      key={`${opt.label}-${opt.value}`}
                      className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px]"
                    >
                      {opt.value}
                    </span>
                  ))}
                </div>
              ) : null}

              {attributeOptions.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {attributeOptions.map((opt) => (
                    <span
                      key={`${opt.name}-${opt.value}`}
                      className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px]"
                    >
                      {opt.name}: {opt.value}
                    </span>
                  ))}
                </div>
              ) : null}

              {productLineOptions.length > 1 ? (
                <div className="mt-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold">{productLineOptionName}</div>
                    {isProductLineSwitching && pendingProductLineOption?.label ? (
                      <div className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                        <span aria-hidden="true" className="h-2 w-2 flex-shrink-0 rounded-full bg-current opacity-60 animate-pulse" />
                        <span>Switching to {pendingProductLineOption.label}...</span>
                      </div>
                    ) : selectedProductLineOption?.label ? (
                      <div className="truncate text-[11px] text-muted-foreground">
                        Selected: {selectedProductLineOption.label}
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-1.5 overflow-x-auto">
                    <div className="flex gap-1.5 pb-1">
                      {productLineOptions.map((option, index) => {
                        const isSelected =
                          option.selected ||
                          (option.product_id === payload.product.product_id &&
                            (!option.merchant_id ||
                              !payload.product.merchant_id ||
                              option.merchant_id === payload.product.merchant_id));
                        const isPending = pendingProductLineProductId === String(option.product_id || '').trim();
                        const swatch = shouldUseProductLineColorSelector
                          ? getProductLineSwatch(option)
                          : {};
                        const hasSwatch = Boolean(swatch.imageUrl || swatch.color);
                        return (
                          <button
                            key={option.option_id || `${option.product_id}-${option.value || option.label}`}
                            type="button"
                            disabled={isProductLineSwitching}
                            aria-pressed={isSelected}
                            aria-busy={isPending || undefined}
                            onMouseEnter={() => prefetchProductLineOption(option)}
                            onFocus={() => prefetchProductLineOption(option)}
                            onClick={() => handleProductLineOptionSelect(option, index)}
                            className={cn(
                              'flex min-h-8 flex-shrink-0 items-center gap-1.5 rounded-md border bg-card text-xs text-foreground transition-colors',
                              hasSwatch ? 'px-2 py-1.5' : 'px-3 py-1',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-wait disabled:opacity-100',
                              isSelected
                                ? 'border-[color:var(--accent-600)] bg-[var(--accent-50)] text-[color:var(--accent-800)] font-semibold shadow-[inset_0_0_0_1px_var(--accent-600)]'
                                : 'border-border hover:bg-muted/30 hover:border-muted-foreground/40',
                              isPending ? 'opacity-75' : '',
                            )}
                          >
                            {hasSwatch ? (
                              <span
                                aria-hidden="true"
                                className={cn(
                                  'h-4 w-4 flex-shrink-0 overflow-hidden rounded-full border',
                                  isSelected ? 'border-[color:var(--accent-600)]' : 'border-border',
                                )}
                                style={{
                                  backgroundColor: swatch.color || undefined,
                                  backgroundImage: swatch.imageUrl ? `url("${swatch.imageUrl}")` : undefined,
                                  backgroundSize: 'cover',
                                  backgroundPosition: 'center',
                                }}
                              />
                            ) : null}
                            <span>{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}

              {shouldRenderColorOptions ? (
                <div className="mt-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold">Color</div>
                    <button
                      type="button"
                      onClick={() => setShowColorSheet(true)}
                      className="text-[11px] font-medium text-primary"
                    >
                      View all →
                    </button>
                  </div>
                  <div className="mt-1.5 overflow-x-auto">
                    <div className="flex gap-1.5 pb-1">
                      {colorOptions.slice(0, 8).map((color) => {
                        const isSelected = selectedColor === color;
                        return (
                          <button
                            key={color}
                            onClick={() => handleColorSelect(color)}
                            className={cn(
                              'flex-shrink-0 rounded-full border bg-card px-3 py-1 text-xs text-foreground transition-colors',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                              'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/30 disabled:text-muted-foreground',
                              isSelected
                                ? 'border-[color:var(--accent-600)] bg-[var(--accent-50)] text-[color:var(--accent-800)] font-semibold'
                                : 'border-border hover:bg-muted/30 hover:border-muted-foreground/40',
                            )}
                          >
                            {color}
                          </button>
                        );
                      })}
                      {colorOptions.length > 8 ? (
                        <button
                          type="button"
                          onClick={() => setShowColorSheet(true)}
                          className="flex-shrink-0 rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground"
                        >
                          +{colorOptions.length - 8} more
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {staticSizeOption ? (
                <div className="mt-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold">Size</div>
                    <div className="text-[11px] text-muted-foreground">Same across all variants</div>
                  </div>
                  <div className="mt-1.5">
                    <span className="inline-flex h-10 items-center rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground">
                      {staticSizeOption}
                    </span>
                  </div>
                </div>
              ) : null}

              {sizeOptions.length ? (
                <div className="mt-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold">Size</div>
                    <div className="text-[11px] text-muted-foreground">Select a size</div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {sizeOptions.map((size) => {
                      const isSelected = selectedSize === size;
                      return (
                        <button
                          key={size}
                          onClick={() => handleSizeSelect(size)}
                          className={cn(
                            'relative inline-flex h-10 min-w-10 items-center justify-center rounded-full border bg-card px-3 text-xs leading-none text-foreground transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                            'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/30 disabled:text-muted-foreground',
                            isSelected
                              ? cn(
                                  'border-[color:var(--accent-600)] bg-[var(--accent-50)] text-[color:var(--accent-800)] font-semibold',
                                )
                              : 'border-border hover:bg-muted/30 hover:border-muted-foreground/40',
                          )}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {!sizeOptions.length &&
              !shouldRenderColorOptions &&
              variants.length > 0 &&
              !(productLineOptions.length > 1 && variants.length === 1) ? (
                <div className="mt-2">
                  <VariantSelector
                    variants={variants}
                    selectedVariantId={selectedVariant.variant_id}
                    onChange={(variantId) => {
                      handleVariantSelect(variantId);
                      pdpTracking.track('pdp_action_click', { action_type: 'select_variant', variant_id: variantId });
                    }}
                    mode={resolvedMode}
                  />
                </div>
              ) : null}
            </div>

          {showTrustBadges ? (
            <div className="mx-2.5 mt-1.5 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-[10px] sm:mx-3 lg:mx-0">
              {trustBadges.map((badge, idx) => (
                <div key={`${badge}-${idx}`} className="flex items-center gap-2">
                  <span>{badge}</span>
                  {idx < trustBadges.length - 1 ? <span className="text-border">•</span> : null}
                </div>
              ))}
            </div>
          ) : (effectiveShippingEta?.length || effectiveReturns?.return_window_days) ? (
            <div className="mx-2.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 sm:mx-3 lg:mx-0">
              {effectiveShippingEta?.length ? (
                <span>
                  Shipping {effectiveShippingEta[0]}–{effectiveShippingEta[1]} days
                </span>
              ) : null}
              {effectiveReturns?.return_window_days ? (
                <span>
                  {effectiveReturns.free_returns ? 'Free returns' : 'Returns'} · {effectiveReturns.return_window_days} days
                </span>
              ) : null}
            </div>
          ) : null}

          {moduleStates.offers === 'LOADING' ? (
            <div
              className="mx-2.5 mt-2 space-y-2 rounded-lg border border-border bg-card px-3 py-3 sm:mx-3 lg:mx-0"
              style={{ minHeight: pdpViewModel.heightSpec.offers }}
              data-module-state="loading"
            >
              <div className="h-3 w-28 rounded bg-muted/30 animate-pulse" />
              <div className="h-3 w-full rounded bg-muted/20 animate-pulse" />
            </div>
          ) : null}

          <div
            className="hidden lg:block mt-6"
            style={isDesktopInfoSparse ? { marginTop: 'max(10rem, calc(58vh - 14rem))' } : undefined}
          >
            <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
              {pricePromo?.promotions?.length && !promoDismissed ? (
                <div className="flex items-center justify-between px-4 py-2 bg-primary/5 text-xs">
                  <span className="flex items-center gap-2">
                    <span className="text-primary">🎁</span>
                    <span>{pricePromo.promotions[0].label}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPromoDismissed(true);
                      if (typeof window !== 'undefined') {
                        window.sessionStorage.setItem(promoDismissStorageKey, '1');
                      }
                      pdpTracking.track('pdp_action_click', {
                        action_type: 'dismiss_promotion',
                      });
                    }}
                    className="text-muted-foreground"
                    aria-label="Dismiss promotion"
                  >
                    ×
                  </button>
                </div>
              ) : null}
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex flex-1 gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 h-11 rounded-full font-semibold text-sm"
                    disabled={!isInStock}
                    onClick={() => {
                      pdpTracking.track('pdp_action_click', { action_type: 'add_to_cart', variant_id: selectedVariant.variant_id });
                      dispatchPdpAction('add_to_cart', {
                        variant: selectedVariant,
                        quantity: resolvedQuantity,
                        merchant_id: effectiveMerchantId,
                        product_id: effectiveProductId || undefined,
                        offer_id: selectedOffer?.offer_id || undefined,
                        onAddToCart,
                      });
                    }}
                  >
                    {actionsByType.add_to_cart || 'Add to Cart'}
                  </Button>
                  <Button
                    className="flex-[1.5] h-11 rounded-full bg-primary hover:bg-primary/90 font-semibold text-sm"
                    disabled={!isInStock}
                    onClick={() => {
                      pdpTracking.track('pdp_action_click', { action_type: 'buy_now', variant_id: selectedVariant.variant_id });
                      dispatchPdpAction('buy_now', {
                        variant: selectedVariant,
                        quantity: resolvedQuantity,
                        merchant_id: effectiveMerchantId,
                        product_id: effectiveProductId || undefined,
                        offer_id: selectedOffer?.offer_id || undefined,
                        onBuyNow,
                      });
                    }}
                  >
                    {actionsByType.buy_now || 'Buy Now'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
          </div>
          </div>

          {resolvedMode === 'beauty' ? (
            <>
              {recentPurchases.length ? (
                <BeautyRecentPurchases
                  items={recentPurchases}
                  showEmpty={false}
                />
              ) : null}
              <ModuleShell
                state={moduleStates.ugc_preview}
                height={pdpViewModel.heightSpec.ugc_preview}
                skeleton={(
                  <div className="mt-4 px-2.5 sm:px-3">
                    <div className="h-4 w-32 rounded bg-muted/20 animate-pulse" />
                    <div className="mt-2 grid grid-cols-3 gap-1">
                      {Array.from({ length: 9 }).map((_, idx) => (
                        <div
                          key={idx}
                          className="aspect-square rounded-md bg-muted/20 animate-pulse"
                        />
                      ))}
                    </div>
                  </div>
                )}
              >
                <BeautyUgcGallery
                  items={ugcItems}
                  title={ugcSectionTitle}
                  showEmpty
                  ctaLabel="Share yours +"
                  ctaEnabled={canUploadMedia}
                  onCtaClick={handleUploadMedia}
                  onOpenAll={() => {
                    pdpTracking.track('ugc_open_all', {
                      source: ugcSnapshot.source || 'unknown',
                    });
                    openViewer({
                      mode: 'ugc',
                      source: ugcSnapshot.source || 'unknown',
                      index: 0,
                    });
                  }}
                  onItemClick={(index) => {
                    pdpTracking.track('ugc_click_item', {
                      index,
                      source: ugcSnapshot.source || 'unknown',
                    });
                    openViewer({
                      mode: 'ugc',
                      source: ugcSnapshot.source || 'unknown',
                      index,
                      trackThumbnail: true,
                    });
                  }}
                />
              </ModuleShell>
            </>
          ) : resolvedMode === 'generic' ? (
            <>
              {recentPurchases.length ? (
                <GenericRecentPurchases
                  items={recentPurchases}
                  showEmpty={false}
                />
              ) : null}
              <ModuleShell
                state={moduleStates.ugc_preview}
                height={pdpViewModel.heightSpec.ugc_preview}
                skeleton={(
                  <div className="mt-4 px-2.5 sm:px-3">
                    <div className="h-4 w-32 rounded bg-muted/20 animate-pulse" />
                    <div className="mt-2 grid grid-cols-3 gap-1">
                      {Array.from({ length: 9 }).map((_, idx) => (
                        <div
                          key={idx}
                          className="aspect-[3/4] rounded-md bg-muted/20 animate-pulse"
                        />
                      ))}
                    </div>
                  </div>
                )}
              >
                <GenericStyleGallery
                  items={ugcItems}
                  title={ugcSectionTitle}
                  showEmpty
                  ctaLabel="Share yours +"
                  ctaEnabled={canUploadMedia}
                  onCtaClick={handleUploadMedia}
                  onOpenAll={() => {
                    pdpTracking.track('ugc_open_all', {
                      source: ugcSnapshot.source || 'unknown',
                    });
                    openViewer({
                      mode: 'ugc',
                      source: ugcSnapshot.source || 'unknown',
                      index: 0,
                    });
                  }}
                  onItemClick={(index) => {
                    pdpTracking.track('ugc_click_item', {
                      index,
                      source: ugcSnapshot.source || 'unknown',
                    });
                    openViewer({
                      mode: 'ugc',
                      source: ugcSnapshot.source || 'unknown',
                      index,
                      trackThumbnail: true,
                    });
                  }}
                />
              </ModuleShell>
              {showSizeHelper ? <GenericSizeHelper /> : null}
            </>
          ) : null}
        </div>

        {hasInsights && productIntel ? (
          <div
            ref={(el) => {
              sectionRefs.current.insights = el;
            }}
            className="border-t border-muted/60"
            style={{ scrollMarginTop }}
          >
            <PivotaInsightsSection data={productIntel} />
          </div>
        ) : null}

        {hasReviews ? (
          <div
            ref={(el) => {
              sectionRefs.current.reviews = el;
            }}
            className="border-t border-muted/60"
            style={{ scrollMarginTop }}
          >
            <ModuleShell
              state={moduleStates.reviews_preview}
              height={pdpViewModel.heightSpec.reviews_preview}
              skeleton={(
                <div className="px-3.5 py-5 sm:px-4">
                  <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                    <div className="flex items-start gap-4">
                      <div className="w-24">
                        <div className="h-8 w-16 rounded bg-muted/20 animate-pulse" />
                        <div className="mt-2 h-4 w-20 rounded bg-muted/20 animate-pulse" />
                        <div className="mt-2 h-4 w-16 rounded bg-muted/20 animate-pulse" />
                      </div>
                      <div className="flex-1 space-y-2">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className="h-3 w-4 rounded bg-muted/20 animate-pulse" />
                            <div className="h-3 flex-1 rounded-full bg-muted/20 animate-pulse" />
                            <div className="h-3 w-10 rounded bg-muted/20 animate-pulse" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            >
              {reviews ? (
                <BeautyReviewsSection
                  data={(reviewsForRender || reviews) as ReviewsPreviewData}
                  onSelectScope={(scopeId) => {
                    setSelectedReviewScope(scopeId);
                    pdpTracking.track('pdp_action_click', {
                      action_type: 'select_review_scope',
                      target: scopeId,
                    });
                  }}
                  brandName={payload.product.brand?.name}
                  brandHref={brandHref}
                  showEmpty
                  onWriteReview={() => {
                    handleWriteReview();
                  }}
                  writeReviewLabel={nonEmptyText(reviews?.entry_points?.write_review?.label, 'Write a review')}
                  writeReviewEnabled={canWriteReview}
                  onSeeAll={
                    onSeeAllReviews
                      ? () => {
                          pdpTracking.track('pdp_action_click', { action_type: 'open_embed', target: 'open_reviews' });
                          onSeeAllReviews();
                        }
                      : undefined
                  }
                  openReviewsLabel={nonEmptyText(reviews?.entry_points?.open_reviews?.label, 'View all reviews')}
                  onAskQuestion={() => {
                    handleAskQuestion();
                  }}
                  askQuestionLabel="Ask a question"
                  askQuestionEnabled={canAskQuestion}
                  onSeeAllQuestions={() => {
                    pdpTracking.track('pdp_action_click', { action_type: 'open_embed', target: 'open_questions' });
                    openQuestionsHub();
                  }}
                  openQuestionsLabel="View all"
                  onOpenQuestion={(questionId) => {
                    pdpTracking.track('pdp_action_click', { action_type: 'open_embed', target: 'open_question_thread' });
                    openQuestionThread(questionId);
                  }}
                />
              ) : moduleStates.reviews_preview === 'ERROR' ? (
                <div className="px-3.5 py-4 text-sm text-muted-foreground sm:px-4">
                  Reviews are temporarily unavailable.
                </div>
              ) : null}
            </ModuleShell>
          </div>
          ) : null}

        {showSizeGuide ? (
          <div
            ref={(el) => {
              sectionRefs.current.size = el;
            }}
            className="border-t border-muted/60"
            style={{ scrollMarginTop }}
          >
            {resolvedMode === 'generic' ? (
              <GenericSizeGuide sizeGuide={payload.product.size_guide} />
            ) : (
              <div className="px-3.5 py-3 sm:px-4">
                <h2 className="text-sm font-semibold mb-2">Size Guide</h2>
                <div className="flex flex-wrap gap-2">
                  {sizeOptions.map((size) => {
                    const isSelected = selectedSize === size;
                    return (
                      <button
                        key={size}
                        onClick={() => handleSizeSelect(size)}
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs transition-colors',
                          isSelected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/30',
                        )}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">Sizing is based on merchant-provided options.</div>
              </div>
            )}
          </div>
        ) : null}

        {hasDetailsSection ? (
          <div
            ref={(el) => {
              sectionRefs.current.details = el;
            }}
            className="border-t border-muted/60"
            style={{ scrollMarginTop }}
          >
            {resolvedMode === 'beauty' ? (
              <BeautyDetailsSection
                data={details}
                product={payload.product}
                media={media}
                activeIngredients={activeIngredients}
                ingredientsInci={ingredientsInci}
                howToUse={howToUse}
                hideLowConfidenceActiveIngredients={shouldHideLowConfidenceActiveIngredients}
                suppressOverview={suppressOverviewInDetails}
                showDetailMedia={!isExternalSeedProduct}
                showProductInformation={!isExternalSeedProduct}
              />
            ) : resolvedMode === 'generic' ? (
              <GenericDetailsSection
                data={details}
                product={payload.product}
                media={media}
                materials={materials}
                productSpecs={productSpecs}
                sizeFit={sizeFitDetails}
                careInstructions={careInstructions}
                usageSafety={usageSafety}
                howToUse={howToUse}
                suppressOverview={suppressOverviewInDetails}
              />
            ) : (
              <div className="px-3.5 py-4 sm:px-4">
                <h2 className="text-sm font-semibold mb-3">Details</h2>
                <DetailsAccordion data={details || { sections: [] }} />
              </div>
            )}
          </div>
        ) : null}

        {showRecommendationsSection ? (
          <div
            ref={(el) => {
              sectionRefs.current.similar = el;
            }}
            className="border-t border-muted/60"
            style={{ scrollMarginTop }}
          >
            <ModuleShell
              state={moduleStates.similar}
              height={pdpViewModel.heightSpec.similar}
              className="px-0 py-3"
              skeleton={<RecommendationsSkeleton />}
            >
              {hasRecommendationItems ? (
                <>
                  <RecommendationsGrid
                    data={recommendations}
                    visibleCount={similarVisibleCount}
                    statusNoteTitle={similarStatus?.title || null}
                    statusNote={similarStatus?.body || null}
                    quickActionState={similarQuickActionState}
                    onQuickAction={(item, index) => {
                      void handleSimilarQuickAction(item, index);
                    }}
                    onItemClick={(item, index) => {
                      pdpTracking.track('similar_click', {
                        index,
                        product_id: item.product_id,
                        merchant_id: item.merchant_id || null,
                        source: pdpViewModel.sourceLocks.similar ? 'locked' : 'live',
                      });
                    }}
                  />
                  {similarLoadMoreError ? (
                    <div className="px-3.5 pb-2 sm:px-4">
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/80 px-3 py-3">
                        <div className="text-xs text-muted-foreground">
                          Could not load more similar products right now.
                        </div>
                        <button
                          type="button"
                          className="shrink-0 text-xs font-semibold text-primary"
                          onClick={() => {
                            void handleSimilarRetryLoadMore();
                          }}
                        >
                          Retry
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div
                    ref={similarAutoLoadSentinelRef}
                    className="h-8"
                    aria-hidden="true"
                  />
                </>
              ) : moduleStates.similar === 'ERROR' ? (
                <div className="rounded-xl border border-border bg-white/90 px-3.5 py-4 text-sm text-muted-foreground sm:px-4">
                  Similar products are temporarily unavailable.
                </div>
              ) : moduleStates.similar === 'EMPTY' ? (
                <div className="rounded-xl border border-border bg-white/90 px-3.5 py-4 text-sm text-muted-foreground sm:px-4">
                  No similar products yet.
                </div>
              ) : null}
            </ModuleShell>
          </div>
        ) : null}
      </div>

      {mounted && !isDesktop
        ? createPortal(
            <div className="fixed inset-x-0 bottom-0 z-[2147483646]">
              <div
                className="mx-auto max-w-md px-2.5 sm:px-3"
                style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
              >
                <div className="rounded-2xl border border-border bg-white shadow-[0_-10px_24px_rgba(0,0,0,0.12)] overflow-hidden mb-2">
                  {pricePromo?.promotions?.length && !promoDismissed ? (
                    <div className="flex items-center justify-between px-4 py-2 bg-primary/5 text-xs">
                      <span className="flex items-center gap-2">
                        <span className="text-primary">🎁</span>
                        <span>{pricePromo.promotions[0].label}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setPromoDismissed(true);
                          if (typeof window !== 'undefined') {
                            window.sessionStorage.setItem(promoDismissStorageKey, '1');
                          }
                          pdpTracking.track('pdp_action_click', {
                            action_type: 'dismiss_promotion',
                          });
                        }}
                        className="text-muted-foreground"
                        aria-label="Dismiss promotion"
                      >
                        ×
                      </button>
                    </div>
                  ) : null}

                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex flex-1 gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 h-10 rounded-full font-semibold text-sm"
                        disabled={!isInStock}
                        onClick={() => {
                          pdpTracking.track('pdp_action_click', { action_type: 'add_to_cart', variant_id: selectedVariant.variant_id });
                          dispatchPdpAction('add_to_cart', {
                            variant: selectedVariant,
                            quantity: resolvedQuantity,
                            merchant_id: effectiveMerchantId,
                            product_id: effectiveProductId || undefined,
                            offer_id: selectedOffer?.offer_id || undefined,
                            onAddToCart,
                          });
                        }}
                      >
                        {actionsByType.add_to_cart || 'Add to Cart'}
                      </Button>
                      <Button
                        className="flex-[1.5] h-10 rounded-full bg-primary hover:bg-primary/90 font-semibold text-sm"
                        disabled={!isInStock}
                        onClick={() => {
                          pdpTracking.track('pdp_action_click', { action_type: 'buy_now', variant_id: selectedVariant.variant_id });
                          dispatchPdpAction('buy_now', {
                            variant: selectedVariant,
                            quantity: resolvedQuantity,
                            merchant_id: effectiveMerchantId,
                            product_id: effectiveProductId || undefined,
                            offer_id: selectedOffer?.offer_id || undefined,
                            onBuyNow,
                          });
                        }}
                      >
                        {actionsByType.buy_now || 'Buy Now'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      <PdpMediaViewer
        isOpen={mediaViewer.isOpen}
        initialIndex={mediaViewer.initialIndex}
        officialItems={galleryItems}
        ugcItems={ugcItems}
        defaultMode={mediaViewer.mode}
        officialSource="media_gallery"
        ugcSource={ugcSnapshot.source || mediaViewer.source || 'unknown'}
        onClose={() =>
          setMediaViewer((prev) => ({
            ...prev,
            isOpen: false,
          }))
        }
        onCloseWithState={(payload) => {
          pdpTracking.track('pdp_gallery_close_viewer', {
            mode: payload.mode,
            source: payload.source,
            index: payload.index,
          });
        }}
        onOpenGrid={(payload) => {
          pdpTracking.track('pdp_gallery_open_grid', {
            mode: payload.mode,
            source: payload.source,
          });
        }}
        onSwipe={(payload) => {
          pdpTracking.track('pdp_gallery_swipe', {
            mode: payload.mode,
            source: payload.source,
            from_index: payload.fromIndex,
            to_index: payload.toIndex,
            direction: payload.direction,
          });
        }}
        onIndexChange={({ mode: viewerMode, index }) => {
          if (viewerMode === 'official') {
            setActiveMediaIndex(index);
          }
        }}
      />
      {questionOpen ? (
        <div className="fixed inset-0 z-[2147483647] flex items-end lg:items-center justify-center bg-black/40 px-3 py-6">
          <div className="w-full max-w-md lg:max-w-lg rounded-2xl bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Ask a question</h3>
              <button
                type="button"
                className="h-8 w-8 rounded-full border border-border text-muted-foreground"
                onClick={() => {
                  if (!questionSubmitting) setQuestionOpen(false);
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Ask about sizing, materials, shipping, or anything else.
            </p>
            <textarea
              className="mt-3 w-full min-h-[120px] rounded-xl border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              placeholder="Type your question…"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              disabled={questionSubmitting}
            />
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                disabled={questionSubmitting}
                onClick={() => setQuestionOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 rounded-xl"
                disabled={questionSubmitting}
                onClick={submitQuestion}
              >
                {questionSubmitting ? 'Submitting…' : 'Submit'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <GenericColorSheet
        open={showColorSheet}
        onClose={() => setShowColorSheet(false)}
        options={colorSheetOptions}
        selectedValue={selectedColor}
        onSelect={(value) => {
          handleColorSelect(value);
          pdpTracking.track('pdp_action_click', {
            action_type: 'select_variant',
            option_name: 'color',
            option_value: value,
          });
        }}
      />
      <SimilarQuickActionSheet
        open={similarQuickActionSheetOpen}
        onClose={() => {
          if (similarQuickActionSubmitting) return;
          setSimilarQuickActionSheetOpen(false);
        }}
        title={similarQuickActionItem?.title || 'Select option'}
        sellerLabel={similarQuickActionSellerLabel}
        variants={similarQuickActionVariants}
        selectedVariantId={similarQuickActionSelectedVariant?.variant_id || ''}
        actionLabel={similarQuickActionLabel}
        isSubmitting={similarQuickActionSubmitting}
        onSelect={(variantId) => setSimilarQuickActionSelectedVariantId(variantId)}
        onSubmit={() => {
          if (!similarQuickActionItem || !similarQuickActionDetail || !similarQuickActionSelectedVariant) {
            return;
          }
          setSimilarQuickActionSubmitting(true);
          void executeSimilarQuickAction({
            item: similarQuickActionItem,
            detail: similarQuickActionDetail,
            variant: similarQuickActionSelectedVariant,
            entrySurface: 'variant_sheet',
          }).finally(() => {
            setSimilarQuickActionSubmitting(false);
            setSimilarQuickActionSheetOpen(false);
          });
        }}
      />
      <OfferSheet
        open={showOfferSheet}
        offers={offers}
        selectedOfferId={selectedOfferId}
        defaultOfferId={variantAwareDefaultOfferId ?? undefined}
        bestPriceOfferId={variantAwareBestPriceOfferId}
        selectedVariant={selectedVariant}
        onClose={() => setShowOfferSheet(false)}
        onSelect={(offerId) => {
          setSelectedOfferId(offerId);
          setShowOfferSheet(false);
          const offer = offers.find((o) => o.offer_id === offerId) || null;
          pdpTracking.track('pdp_action_click', {
            action_type: 'select_offer',
            offer_id: offerId,
            merchant_id: offer?.merchant_id,
          });
        }}
      />
      {offerDebugEnabled ? (
        <details className="mx-auto max-w-md lg:max-w-6xl px-3 pb-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Offer debug</summary>
          <div className="mt-2 rounded-xl border border-border bg-card/60 p-3 font-mono text-[11px] leading-relaxed">
            <div>selected_offer_id: {selectedOfferId || 'null'}</div>
            <div>default_offer_id: {variantAwareDefaultOfferId || 'null'}</div>
            <div>best_price_offer_id: {variantAwareBestPriceOfferId || 'null'}</div>
            <div>
              product_group_id: {payload.product_group_id || selectedOffer?.product_group_id || 'null'}
            </div>
            <div>merchant_id: {selectedOffer?.merchant_id || payload.product.merchant_id || 'null'}</div>
          </div>
        </details>
      ) : null}
    </div>
  );
}
