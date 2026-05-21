'use client';

import { useRef } from 'react';
import { BeautyMobileGallery } from '@/features/pdp/components/BeautyMobileGallery';
import { BeautyProductHeader } from '@/features/pdp/components/BeautyProductHeader';
import { BeautyPriceRow } from '@/features/pdp/components/BeautyPriceRow';
import { BeautyShadeSelector } from '@/features/pdp/components/BeautyShadeSelector';
import { BeautySizeSelector } from '@/features/pdp/components/BeautySizeSelector';
import { BeautyMobileSellerPicker } from '@/features/pdp/components/BeautyMobileSellerPicker';
import { BeautyShippingStrip } from '@/features/pdp/components/BeautyShippingStrip';
import { BeautyDesktopBuyBox } from '@/features/pdp/components/BeautyDesktopBuyBox';
import { BeautyRecentPurchasesRows } from '@/features/pdp/components/BeautyRecentPurchasesRows';
import { BeautyCustomerPhotos } from '@/features/pdp/components/BeautyCustomerPhotos';
import { BeautyPivotaInsights } from '@/features/pdp/components/BeautyPivotaInsights';
import { BeautyAccordion } from '@/features/pdp/components/BeautyAccordion';
import { BeautyReviewsPreview } from '@/features/pdp/components/BeautyReviewsPreview';
import { BeautyYouMayAlsoLike } from '@/features/pdp/components/BeautyYouMayAlsoLike';
import { BeautyQuestions } from '@/features/pdp/components/BeautyQuestions';
import { BeautyBrandCard } from '@/features/pdp/components/BeautyBrandCard';
import { WaysToSave } from '@/features/pdp/components/WaysToSave';
import { FashionBenefitsStrip } from '@/features/pdp/components/FashionBenefitsStrip';
import { FashionModelInfo } from '@/features/pdp/components/FashionModelInfo';
import { FashionSizeFitGuide } from '@/features/pdp/components/FashionSizeFitGuide';
import { FashionMaterialCare } from '@/features/pdp/components/FashionMaterialCare';
import { FashionPivotaStyling } from '@/features/pdp/components/FashionPivotaStyling';
import type { FashionPDPMobileProps } from '@/features/pdp/containers/FashionPDPMobile';
import { useState } from 'react';

/**
 * FashionPDPDesktop — desktop (≥1024px) layout for the Fashion PDP.
 * Derived from the mobile container; reuses every leaf component. Layout:
 *
 *   ┌─── sticky breadcrumb top bar ─────────────────────────────────┐
 *   │ gallery (sticky)        │  product header                     │
 *   │  - 4-up image grid      │  price                              │
 *   │                         │  color swatches                     │
 *   │                         │  size + "size + fit guide" link     │
 *   │                         │  model line                         │
 *   │                         │  benefits strip                     │
 *   │                         │  Add to bag · Buy now               │
 *   │                         │  multi-seller compare               │
 *   │                         │  ways to save                       │
 *   │                         │  shipping + returns                 │
 *   ├─────────────────────────┴─────────────────────────────────────┤
 *   │ Pivota Insights · Pivota Styling · Reviews · UGC · Similar    │
 *   └───────────────────────────────────────────────────────────────┘
 *
 * Accepts the same `FashionPDPMobileProps` so the container can be swapped
 * by breakpoint without re-deriving payload data.
 */
export function FashionPDPDesktop(props: FashionPDPMobileProps) {
  const reviewsAnchorRef = useRef<HTMLDivElement | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const scrollToReviews = () =>
    reviewsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="lovable-pdp min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-20 border-b border-border bg-white/95 backdrop-blur-md backdrop-saturate-150">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-3 px-8">
          {props.onBack ? (
            <button
              type="button"
              onClick={props.onBack}
              aria-label="Go back"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          ) : null}
          <div className="min-w-0 flex-1 truncate text-[13px] font-semibold">
            {props.brand ? <span className="text-primary">{props.brand}</span> : null}
            {props.brand ? <span className="mx-1.5 text-muted-foreground">·</span> : null}
            <span className="text-foreground">{props.title}</span>
          </div>
          {props.onShare ? (
            <button
              type="button"
              onClick={props.onShare}
              aria-label="Share"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-8 pb-24">
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 pt-6 lg:grid-cols-[minmax(0,1fr)_440px]">
          <div className="self-start lg:sticky lg:top-[76px]">
            <div className="overflow-hidden rounded-2xl border border-border">
              <BeautyMobileGallery images={props.galleryImages} alt={props.title} onOpenViewer={props.onOpenViewer} />
            </div>
          </div>

          <div className="-mx-[18px]">
            <BeautyProductHeader
              brand={props.brand}
              title={props.title}
              subtitle={props.subtitle}
              rating={props.rating}
              reviewCount={props.reviewCount}
              onSeeReviews={scrollToReviews}
            />
            <BeautyPriceRow
              price={props.price}
              compareAt={props.compareAt}
              discountPct={props.discountPct}
              currency={props.currency}
            />
            {props.colors?.length ? (
              <BeautyShadeSelector
                shades={props.colors}
                selectedId={props.selectedColorId}
                onSelect={props.onSelectColor || (() => {})}
                axisLabel="Color"
              />
            ) : null}
            {props.sizes?.length ? (
              <>
                <BeautySizeSelector
                  sizes={props.sizes}
                  selectedId={props.selectedSizeId}
                  onSelect={props.onSelectSize || (() => {})}
                />
                {props.fitChart ? (
                  <div className="mt-3 px-[18px]">
                    <button
                      type="button"
                      onClick={() => setGuideOpen(true)}
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
                    >
                      Size + fit guide
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
            {props.modelInfo ? (
              <FashionModelInfo info={props.modelInfo} avatarUrl={props.modelAvatar} />
            ) : null}
            {props.benefits?.length ? <FashionBenefitsStrip benefits={props.benefits} /> : null}
            <BeautyDesktopBuyBox
              unitPrice={props.price}
              currency={props.currency}
              quantity={props.quantity}
              disabled={!props.inStock}
              buyNowLabel={props.buyNowLabel}
              onQtyChange={props.onQtyChange}
              onAddToCart={props.onAddToCart}
              onBuyNow={props.onBuyNow}
            />
            {props.offers.length > 1 ? (
              <BeautyMobileSellerPicker
                offers={props.offers}
                selectedVariant={props.selectedVariant}
                selectedOfferId={props.selectedOfferId}
                bestPriceOfferId={props.bestPriceOfferId}
                primaryMerchantId={props.primaryMerchantId}
                onSelect={props.onSelectOffer}
              />
            ) : null}
            <WaysToSave
              product={props.product}
              selectedOffer={props.offers.find((o) => o.offer_id === props.selectedOfferId)}
              selectedVariant={props.selectedVariant}
              quantity={props.quantity}
            />
            <BeautyShippingStrip
              etaRange={props.etaRange}
              methodLabel={props.shippingMethodLabel}
              freeShipping={props.freeShipping}
              returnWindowDays={props.returnWindowDays}
              freeReturns={props.freeReturns}
              sellerLabel={props.shippingSellerLabel}
            />
            {(props.material || props.origin || props.care) ? (
              <FashionMaterialCare material={props.material} origin={props.origin} care={props.care} />
            ) : null}
          </div>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            {props.insights ? <BeautyPivotaInsights insights={props.insights} /> : null}
            {props.pairings?.length ? (
              <div className="mt-8">
                <FashionPivotaStyling pairings={props.pairings} onItemClick={props.onPairingClick} />
              </div>
            ) : null}
            <div ref={reviewsAnchorRef} className="mt-8 scroll-mt-20">
              <BeautyAccordion
                title="Reviews"
                count={props.reviewCount ?? props.reviews?.length ?? 0}
                defaultOpen
              >
                <BeautyReviewsPreview
                  rating={props.rating ?? 0}
                  reviewCount={props.reviewCount ?? props.reviews?.length ?? 0}
                  reviews={props.reviews ?? []}
                  onWriteReview={props.onWriteReview}
                  onSeeAll={props.onSeeAllReviews}
                />
              </BeautyAccordion>
              {props.details ? (
                <BeautyAccordion title="Details">{props.details}</BeautyAccordion>
              ) : null}
              {props.shippingReturnsText ? (
                <BeautyAccordion title="Shipping &amp; returns">
                  {props.shippingReturnsText}
                </BeautyAccordion>
              ) : null}
              <BeautyQuestions
                questions={props.questions ?? []}
                onAsk={props.onAskQuestion}
                onSeeAll={props.onSeeAllQuestions}
                onOpen={props.onOpenQuestion}
                canAsk={props.canAskQuestion}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {props.recentPurchases?.length ? (
              <BeautyRecentPurchasesRows
                items={props.recentPurchases}
                totalLabel={props.recentPurchasesTotal}
              />
            ) : null}
            <BeautyCustomerPhotos
              photos={props.customerPhotos ?? []}
              totalLabel={props.customerPhotosTotal}
              onViewAll={props.onUgcViewAll}
              onShare={props.onUgcShare}
              onPhotoClick={props.onUgcPhotoClick}
            />
            <BeautyBrandCard brandName={props.brandName} brandHref={props.brandHref} />
          </div>
        </div>

        {props.similar?.length ? (
          <div className="mt-12">
            <BeautyYouMayAlsoLike
              items={props.similar}
              onItemClick={props.onSimilarClick}
              onBuy={props.onSimilarBuy}
            />
          </div>
        ) : null}
      </div>

      {props.fitChart ? (
        <FashionSizeFitGuide
          open={guideOpen}
          onClose={() => setGuideOpen(false)}
          chart={props.fitChart}
          modelInfo={props.modelInfo}
          modelAvatar={props.modelAvatar}
        />
      ) : null}
    </div>
  );
}
