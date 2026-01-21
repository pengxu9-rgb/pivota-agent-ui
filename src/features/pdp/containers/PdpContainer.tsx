'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Heart, MessageCircle, Share2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  MediaGalleryData,
  PDPPayload,
  PricePromoData,
  ProductDetailsData,
  RecommendationsData,
  ReviewsPreviewData,
  Variant,
} from '@/features/pdp/types';
import { isBeautyProduct } from '@/features/pdp/utils/isBeautyProduct';
import {
  collectColorOptions,
  collectSizeOptions,
  extractAttributeOptions,
  extractBeautyAttributes,
  findVariantByOptions,
  getOptionValue,
} from '@/features/pdp/utils/variantOptions';
import { pdpTracking } from '@/features/pdp/tracking';
import { dispatchPdpAction } from '@/features/pdp/actions';
import { MediaGallery } from '@/features/pdp/sections/MediaGallery';
import { VariantSelector } from '@/features/pdp/sections/VariantSelector';
import { DetailsAccordion } from '@/features/pdp/sections/DetailsAccordion';
import { RecommendationsGrid } from '@/features/pdp/sections/RecommendationsGrid';
import { StickyTabNav } from '@/features/pdp/sections/StickyTabNav';
import { BeautyReviewsSection } from '@/features/pdp/sections/BeautyReviewsSection';
import { BeautyUgcGallery } from '@/features/pdp/sections/BeautyUgcGallery';
import { BeautyRecentPurchases } from '@/features/pdp/sections/BeautyRecentPurchases';
import { BeautyShadesSection } from '@/features/pdp/sections/BeautyShadesSection';
import { BeautyDetailsSection } from '@/features/pdp/sections/BeautyDetailsSection';
import { BeautyVariantSheet } from '@/features/pdp/sections/BeautyVariantSheet';
import { GenericColorSheet } from '@/features/pdp/sections/GenericColorSheet';
import { GenericRecentPurchases } from '@/features/pdp/sections/GenericRecentPurchases';
import { GenericStyleGallery } from '@/features/pdp/sections/GenericStyleGallery';
import { GenericSizeHelper } from '@/features/pdp/sections/GenericSizeHelper';
import { GenericSizeGuide } from '@/features/pdp/sections/GenericSizeGuide';
import { GenericDetailsSection } from '@/features/pdp/sections/GenericDetailsSection';
import { cn } from '@/lib/utils';

function getModuleData<T>(payload: PDPPayload, type: string): T | null {
  const m = payload.modules.find((x) => x.type === type);
  return (m?.data as T) ?? null;
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

function StarRating({ value }: { value: number }) {
  const rounded = Math.round(value);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn('h-3.5 w-3.5', i < rounded ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground')}
        />
      ))}
    </div>
  );
}

export function PdpContainer({
  payload,
  initialQuantity = 1,
  mode,
  onAddToCart,
  onBuyNow,
  onWriteReview,
  onSeeAllReviews,
}: {
  payload: PDPPayload;
  initialQuantity?: number;
  mode?: 'beauty' | 'generic';
  onAddToCart: (args: { variant: Variant; quantity: number }) => void;
  onBuyNow: (args: { variant: Variant; quantity: number }) => void;
  onWriteReview?: () => void;
  onSeeAllReviews?: () => void;
}) {
  const [selectedVariantId, setSelectedVariantId] = useState(payload.product.default_variant_id);
  const [quantity, setQuantity] = useState(initialQuantity);
  const reviewsTracked = useRef(false);
  const [activeTab, setActiveTab] = useState('product');
  const [showShadeSheet, setShowShadeSheet] = useState(false);
  const [showColorSheet, setShowColorSheet] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const selectedVariant = useMemo(() => {
    return payload.product.variants.find((v) => v.variant_id === selectedVariantId) || payload.product.variants[0];
  }, [payload, selectedVariantId]);

  const resolvedMode: 'beauty' | 'generic' = mode || (isBeautyProduct(payload.product) ? 'beauty' : 'generic');

  const media = getModuleData<MediaGalleryData>(payload, 'media_gallery');
  const pricePromo = getModuleData<PricePromoData>(payload, 'price_promo');
  const details = getModuleData<ProductDetailsData>(payload, 'product_details');
  const reviews = getModuleData<ReviewsPreviewData>(payload, 'reviews_preview');
  const recommendations = getModuleData<RecommendationsData>(payload, 'recommendations');

  const variants = payload.product.variants || [];
  const colorOptions = useMemo(() => collectColorOptions(variants), [variants]);
  const sizeOptions = useMemo(() => collectSizeOptions(variants), [variants]);
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
    pdpTracking.setBaseContext({
      page_request_id: payload.tracking.page_request_id,
      entry_point: payload.tracking.entry_point,
      experiment: payload.tracking.experiment,
      product_id: payload.product.product_id,
    });
    pdpTracking.track('pdp_view', { pdp_mode: resolvedMode });
  }, [payload, resolvedMode]);

  useEffect(() => {
    if (reviews && !reviewsTracked.current) {
      reviewsTracked.current = true;
      pdpTracking.track('pdp_module_impression', { module: 'reviews_preview' });
    }
  }, [reviews]);

  const heroUrl = media?.items?.[0]?.url || selectedVariant.image_url || payload.product.image_url || '';
  const currency = selectedVariant.price?.current.currency || payload.product.price?.current.currency || 'USD';
  const priceAmount = selectedVariant.price?.current.amount ?? payload.product.price?.current.amount ?? 0;
  const actionsByType = payload.actions.reduce<Record<string, string>>((acc, action) => {
    acc[action.action_type] = action.label;
    return acc;
  }, {});

  const hasReviews = !!reviews;
  const hasRecommendations = !!recommendations?.items?.length;
  const showShades = resolvedMode === 'beauty' && variants.length > 1;
  const showSize =
    resolvedMode === 'generic' && (sizeOptions.length > 0 || !!payload.product.size_guide);

  const tabs = [
    { id: 'product', label: 'Product' },
    ...(hasReviews ? [{ id: 'reviews', label: 'Reviews' }] : []),
    ...(showShades ? [{ id: 'shades', label: 'Shades' }] : []),
    ...(showSize ? [{ id: 'size', label: 'Size' }] : []),
    { id: 'details', label: 'Details' },
    ...(hasRecommendations ? [{ id: 'similar', label: 'Similar' }] : []),
  ];

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    sectionRefs.current[tabId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleColorSelect = (value: string) => {
    setSelectedColor(value);
    const match = findVariantByOptions({ variants, color: value, size: selectedSize });
    if (match) setSelectedVariantId(match.variant_id);
  };

  const handleSizeSelect = (value: string) => {
    setSelectedSize(value);
    const match = findVariantByOptions({ variants, color: selectedColor, size: value });
    if (match) setSelectedVariantId(match.variant_id);
  };

  const attributeOptions = extractAttributeOptions(selectedVariant);
  const beautyAttributes = extractBeautyAttributes(selectedVariant);
  const compareAmount =
    pricePromo?.compare_at?.amount ??
    selectedVariant.price?.compare_at?.amount ??
    payload.product.price?.compare_at?.amount;
  const discountPercent =
    compareAmount && compareAmount > priceAmount
      ? Math.round((1 - priceAmount / compareAmount) * 100)
      : null;
  const ugcFromReviews =
    reviews?.preview_items?.flatMap((item) => item.media || []) || [];
  const ugcFromMedia = (media?.items || []).slice(1);
  const ugcItems = (ugcFromReviews.length ? ugcFromReviews : ugcFromMedia).filter(
    (item) => item?.url,
  );
  const tagList = payload.product.tags || [];
  const halfTagCount = Math.ceil(tagList.length / 2);
  const popularLooks =
    payload.product.beauty_meta?.popular_looks || tagList.slice(0, halfTagCount);
  const bestFor =
    payload.product.beauty_meta?.best_for || tagList.slice(halfTagCount);
  const importantInfo = payload.product.beauty_meta?.important_info || [];
  const trustBadges = [];
  if (payload.product.brand?.name) trustBadges.push('Authentic');
  if (payload.product.returns?.return_window_days) {
    trustBadges.push(
      payload.product.returns.free_returns
        ? 'Free returns'
        : `Returns · ${payload.product.returns.return_window_days} days`,
    );
  }
  if (payload.product.shipping?.eta_days_range?.length) {
    trustBadges.push(
      `Shipping ${payload.product.shipping.eta_days_range[0]}–${payload.product.shipping.eta_days_range[1]} days`,
    );
  }
  const showTrustBadges = resolvedMode === 'beauty' && trustBadges.length > 0;

  return (
    <div className="relative min-h-screen bg-background pb-36">
      <StickyTabNav tabs={tabs} activeTab={activeTab} onTabChange={handleTabChange} />

      <div ref={(el) => { sectionRefs.current.product = el; }}>
        <div className="pb-4">
          <div className="relative">
            <MediaGallery
              data={media}
              title={payload.product.title}
              fallbackUrl={heroUrl}
              aspectClass={resolvedMode === 'generic' ? 'aspect-square' : 'aspect-[6/5]'}
              fit={resolvedMode === 'generic' ? 'object-contain' : 'object-cover'}
            />
          </div>

          {resolvedMode === 'beauty' && variants.length > 1 ? (
            <div className="border-b border-border bg-card py-2">
              <div className="overflow-x-auto">
                <div className="flex items-center gap-2 px-3">
                  {variants.slice(0, 6).map((variant) => {
                    const isSelected = variant.variant_id === selectedVariant.variant_id;
                    return (
                      <button
                        key={variant.variant_id}
                        onClick={() => {
                          setSelectedVariantId(variant.variant_id);
                          pdpTracking.track('pdp_action_click', { action_type: 'select_variant', variant_id: variant.variant_id });
                        }}
                        className={cn(
                          'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] whitespace-nowrap transition-all',
                          isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
                        )}
                      >
                        {variant.swatch?.hex ? (
                          <span className="h-3 w-3 rounded-full ring-1 ring-border" style={{ backgroundColor: variant.swatch.hex }} />
                        ) : null}
                        <span>{variant.title}</span>
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setShowShadeSheet(true)}
                    className="ml-auto text-[10px] text-primary font-medium whitespace-nowrap"
                  >
                    {variants.length} colors →
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {resolvedMode === 'generic' && colorOptions.length ? (
            <div className="border-b border-border bg-card py-2">
              <div className="overflow-x-auto">
                <div className="flex items-center gap-2 px-3">
                  {colorOptions.map((color) => {
                    const variantForColor = variants.find((v) => getOptionValue(v, ['color', 'colour', 'shade', 'tone']) === color) || selectedVariant;
                    const isSelected = selectedColor === color;
                    return (
                      <button
                        key={color}
                        onClick={() => handleColorSelect(color)}
                        className={cn(
                          'relative flex-shrink-0 rounded-md overflow-hidden border-2',
                          isSelected ? 'border-primary' : 'border-transparent',
                        )}
                      >
                        {variantForColor.image_url ? (
                          <img src={variantForColor.image_url} alt={color} className="h-14 w-10 object-cover" />
                        ) : variantForColor.swatch?.hex ? (
                          <span className="block h-14 w-10" style={{ backgroundColor: variantForColor.swatch.hex }} />
                        ) : (
                          <span className="flex h-14 w-10 items-center justify-center text-[10px] bg-muted">
                            {color}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setShowColorSheet(true)}
                    className="flex-shrink-0 h-14 px-3 rounded-md bg-muted/50 text-xs text-muted-foreground flex flex-col items-center justify-center"
                  >
                    <span>Colors</span>
                    <span className="font-medium">{variants.length}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="px-4 py-4">
            <div className="flex items-baseline gap-2 flex-wrap">
              <div className="text-2xl font-bold">{formatPrice(priceAmount, currency)}</div>
              {compareAmount && compareAmount > priceAmount ? (
                <div className="text-sm text-muted-foreground line-through">
                  {formatPrice(compareAmount, currency)}
                </div>
              ) : null}
              {discountPercent ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  -{discountPercent}%
                </span>
              ) : null}
              {reviews?.review_count && onSeeAllReviews ? (
                <button
                  onClick={onSeeAllReviews}
                  className="ml-auto text-[11px] text-muted-foreground flex items-center gap-1 whitespace-nowrap"
                >
                  {reviews.review_count} reviews <ChevronRight className="h-3 w-3" />
                </button>
              ) : null}
            </div>

            <h1 className="mt-2 text-lg font-semibold leading-snug">
              {payload.product.brand?.name ? `${payload.product.brand.name} ` : ''}{payload.product.title}
            </h1>
            {payload.product.subtitle ? (
              <div className="mt-1 text-sm text-muted-foreground">{payload.product.subtitle}</div>
            ) : null}

            {reviews?.review_count ? (
              <button
                className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"
                onClick={() => handleTabChange('reviews')}
              >
                <StarRating value={(reviews.rating / reviews.scale) * 5} />
                <span>{reviews.rating.toFixed(1)}</span>
                <span>({reviews.review_count})</span>
              </button>
            ) : null}

            {resolvedMode === 'beauty' && beautyAttributes.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {beautyAttributes.map((opt) => (
                  <span
                    key={`${opt.label}-${opt.value}`}
                    className="rounded-full border border-border bg-card px-3 py-1 text-[10px] text-muted-foreground"
                  >
                    {opt.value}
                  </span>
                ))}
              </div>
            ) : null}

            {attributeOptions.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {attributeOptions.map((opt) => (
                  <span
                    key={`${opt.name}-${opt.value}`}
                    className="rounded-full border border-border bg-card px-3 py-1 text-[10px] text-muted-foreground"
                  >
                    {opt.name}: {opt.value}
                  </span>
                ))}
              </div>
            ) : null}

            {resolvedMode === 'generic' && sizeOptions.length ? (
              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Size</div>
                  <div className="text-xs text-muted-foreground">Select a size</div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
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
              </div>
            ) : null}

            {resolvedMode === 'beauty' && variants.length > 1 ? (
              <div className="mt-4">
                <VariantSelector
                  variants={variants}
                  selectedVariantId={selectedVariant.variant_id}
                  onChange={(variantId) => {
                    setSelectedVariantId(variantId);
                    pdpTracking.track('pdp_action_click', { action_type: 'select_variant', variant_id: variantId });
                  }}
                  mode={resolvedMode}
                />
              </div>
            ) : null}

            {resolvedMode === 'generic' && !sizeOptions.length && variants.length > 1 ? (
              <div className="mt-4">
                <VariantSelector
                  variants={variants}
                  selectedVariantId={selectedVariant.variant_id}
                  onChange={(variantId) => {
                    setSelectedVariantId(variantId);
                    pdpTracking.track('pdp_action_click', { action_type: 'select_variant', variant_id: variantId });
                  }}
                  mode={resolvedMode}
                />
              </div>
            ) : null}
          </div>

          {showTrustBadges ? (
            <div className="mx-4 mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-[10px]">
              {trustBadges.map((badge, idx) => (
                <div key={`${badge}-${idx}`} className="flex items-center gap-2">
                  <span>{badge}</span>
                  {idx < trustBadges.length - 1 ? <span className="text-border">•</span> : null}
                </div>
              ))}
            </div>
          ) : (payload.product.shipping?.eta_days_range?.length || payload.product.returns?.return_window_days) ? (
            <div className="mx-4 rounded-2xl bg-card border border-border px-4 py-3 text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
              {payload.product.shipping?.eta_days_range?.length ? (
                <span>
                  Shipping {payload.product.shipping.eta_days_range[0]}–{payload.product.shipping.eta_days_range[1]} days
                </span>
              ) : null}
              {payload.product.returns?.return_window_days ? (
                <span>
                  {payload.product.returns.free_returns ? 'Free returns' : 'Returns'} · {payload.product.returns.return_window_days} days
                </span>
              ) : null}
            </div>
          ) : null}

          {resolvedMode === 'beauty' ? (
            <>
              <BeautyRecentPurchases
                items={payload.product.recent_purchases || []}
                showEmpty
              />
              <BeautyUgcGallery items={ugcItems} showEmpty />
            </>
          ) : resolvedMode === 'generic' ? (
            <>
              <GenericRecentPurchases items={payload.product.recent_purchases || []} showEmpty />
              <GenericStyleGallery items={ugcItems} showEmpty />
              <GenericSizeHelper />
            </>
          ) : null}
        </div>
      </div>

      {hasReviews ? (
        <div ref={(el) => { sectionRefs.current.reviews = el; }} className="border-t-8 border-muted">
          <BeautyReviewsSection
            data={reviews as ReviewsPreviewData}
            brandName={payload.product.brand?.name}
            showEmpty
            onWriteReview={
              onWriteReview
                ? () => {
                    pdpTracking.track('pdp_action_click', { action_type: 'open_embed', target: 'write_review' });
                    onWriteReview();
                  }
                : undefined
            }
            onSeeAll={
              onSeeAllReviews
                ? () => {
                    pdpTracking.track('pdp_action_click', { action_type: 'open_embed', target: 'open_reviews' });
                    onSeeAllReviews();
                  }
                : undefined
            }
          />
        </div>
      ) : null}

      {showShades ? (
        <div ref={(el) => { sectionRefs.current.shades = el; }} className="border-t-8 border-muted">
          {resolvedMode === 'beauty' ? (
            <BeautyShadesSection
              variants={variants}
              selectedVariant={selectedVariant}
              onVariantChange={(variantId) => {
                setSelectedVariantId(variantId);
                pdpTracking.track('pdp_action_click', { action_type: 'select_variant', variant_id: variantId });
              }}
              popularLooks={popularLooks}
              bestFor={bestFor}
              importantInfo={importantInfo}
              mediaItems={media?.items || []}
              brandName={payload.product.brand?.name}
              showEmpty
            />
          ) : (
            <div className="px-4 py-6">
              <h2 className="text-sm font-semibold mb-3">Shades</h2>
              <div className="grid grid-cols-3 gap-3">
                {variants.map((variant) => {
                  const isSelected = variant.variant_id === selectedVariant.variant_id;
                  return (
                    <button
                      key={variant.variant_id}
                      onClick={() => {
                        setSelectedVariantId(variant.variant_id);
                        pdpTracking.track('pdp_action_click', { action_type: 'select_variant', variant_id: variant.variant_id });
                      }}
                      className={cn(
                        'rounded-xl border p-3 text-left transition-colors',
                        isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {variant.swatch?.hex ? (
                          <span className="h-6 w-6 rounded-full ring-1 ring-border" style={{ backgroundColor: variant.swatch.hex }} />
                        ) : (
                          <span className="h-6 w-6 rounded-full bg-muted" />
                        )}
                        <span className="text-xs font-medium">{variant.title}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {showSize ? (
        <div ref={(el) => { sectionRefs.current.size = el; }} className="border-t-8 border-muted">
          {resolvedMode === 'generic' ? (
            <GenericSizeGuide sizeGuide={payload.product.size_guide} />
          ) : (
            <div className="px-4 py-6">
              <h2 className="text-sm font-semibold mb-3">Size Guide</h2>
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
              <div className="mt-3 text-xs text-muted-foreground">Sizing is based on merchant-provided options.</div>
            </div>
          )}
        </div>
      ) : null}

      {details ? (
        <div ref={(el) => { sectionRefs.current.details = el; }} className="border-t-8 border-muted">
          {resolvedMode === 'beauty' ? (
            <BeautyDetailsSection data={details} product={payload.product} media={media} />
          ) : resolvedMode === 'generic' ? (
            <GenericDetailsSection data={details} product={payload.product} media={media} />
          ) : (
            <div className="px-4 py-6">
              <h2 className="text-sm font-semibold mb-3">Details</h2>
              <DetailsAccordion data={details} />
            </div>
          )}
        </div>
      ) : null}

      {recommendations ? (
        <div ref={(el) => { sectionRefs.current.similar = el; }} className="border-t-8 border-muted">
          <div className="px-4 py-6">
            <RecommendationsGrid data={recommendations} />
          </div>
        </div>
      ) : null}

      <div className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border">
        <div className="max-w-md mx-auto">
          {pricePromo?.promotions?.length ? (
            <div className="flex items-center justify-between px-4 py-2 bg-primary/5 text-xs">
              <span className="flex items-center gap-2">
                <span className="text-primary">🎁</span>
                <span>{pricePromo.promotions[0].label}</span>
              </span>
            </div>
          ) : null}

          {resolvedMode === 'generic' ? (
            <div className="flex items-center gap-2 px-4 pt-3">
              <button
                onClick={() => pdpTracking.track('pdp_action_click', { action_type: 'favorite' })}
                className="h-9 w-9 rounded-full border border-border flex items-center justify-center hover:bg-muted/40 transition-colors"
                aria-label="Save"
              >
                <Heart className="h-4 w-4 text-muted-foreground" />
              </button>
              <button
                onClick={() => pdpTracking.track('pdp_action_click', { action_type: 'ask' })}
                className="h-9 w-9 rounded-full border border-border flex items-center justify-center hover:bg-muted/40 transition-colors"
                aria-label="Ask"
              >
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
              </button>
              <button
                onClick={() => pdpTracking.track('pdp_action_click', { action_type: 'share' })}
                className="h-9 w-9 rounded-full border border-border flex items-center justify-center hover:bg-muted/40 transition-colors"
                aria-label="Share"
              >
                <Share2 className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          ) : null}

          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="icon"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
              >
                −
              </Button>
              <div className="w-10 text-center text-sm font-semibold">{quantity}</div>
              <Button
                variant="secondary"
                size="icon"
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="Increase quantity"
              >
                +
              </Button>
            </div>
            <div className="flex flex-1 gap-2">
              <Button
                variant="outline"
                className="flex-1 h-11 rounded-full font-medium"
                onClick={() => {
                  pdpTracking.track('pdp_action_click', { action_type: 'add_to_cart', variant_id: selectedVariant.variant_id });
                  dispatchPdpAction('add_to_cart', {
                    variant: selectedVariant,
                    quantity,
                    onAddToCart,
                  });
                }}
              >
                {actionsByType.add_to_cart || 'Add to Cart'}
              </Button>
              <Button
                variant="gradient"
                className="flex-[1.2] h-11 rounded-full font-medium"
                onClick={() => {
                  pdpTracking.track('pdp_action_click', { action_type: 'buy_now', variant_id: selectedVariant.variant_id });
                  dispatchPdpAction('buy_now', {
                    variant: selectedVariant,
                    quantity,
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
      <BeautyVariantSheet
        open={resolvedMode === 'beauty' && showShadeSheet}
        onClose={() => setShowShadeSheet(false)}
        variants={variants}
        selectedVariantId={selectedVariant.variant_id}
        onSelect={(variantId) => {
          setSelectedVariantId(variantId);
          pdpTracking.track('pdp_action_click', { action_type: 'select_variant', variant_id: variantId });
        }}
      />
      <GenericColorSheet
        open={resolvedMode === 'generic' && showColorSheet}
        onClose={() => setShowColorSheet(false)}
        variants={variants}
        selectedVariantId={selectedVariant.variant_id}
        onSelect={(variantId) => {
          setSelectedVariantId(variantId);
          pdpTracking.track('pdp_action_click', { action_type: 'select_variant', variant_id: variantId });
        }}
      />
    </div>
  );
}
