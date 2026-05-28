'use client';

import { useMemo, useRef, useState } from 'react';
import { Layers } from 'lucide-react';
import { BeautyMobileGallery } from '@/features/pdp/components/BeautyMobileGallery';
import { BeautyProductHeader } from '@/features/pdp/components/BeautyProductHeader';
import { BeautyPriceRow } from '@/features/pdp/components/BeautyPriceRow';
import { BeautyShadeSelector } from '@/features/pdp/components/BeautyShadeSelector';
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
import { ElectronicsConfigurator } from '@/features/pdp/components/ElectronicsConfigurator';
import { ElectronicsProtectionPlan } from '@/features/pdp/components/ElectronicsProtectionPlan';
import { ElectronicsProReviews } from '@/features/pdp/components/ElectronicsProReviews';
import { ElectronicsInTheBox } from '@/features/pdp/components/ElectronicsInTheBox';
import { ElectronicsTechSpecs } from '@/features/pdp/components/ElectronicsTechSpecs';
import { ElectronicsCompareTable } from '@/features/pdp/components/ElectronicsCompareTable';
import type { ElectronicsPDPMobileProps } from '@/features/pdp/containers/ElectronicsPDPMobile';

/**
 * ElectronicsPDPDesktop — desktop (≥1024px) layout for the electronics PDP.
 *
 * Layout:
 *   ┌─ top bar: brand · title · [Compare][Save][Share][Bag] ─────────┐
 *   │ gallery (large + 4 thumbs)        │  product header            │
 *   │                                   │  price (config-aware)      │
 *   │                                   │  color · memory · storage  │
 *   │                                   │  protection plan           │
 *   │                                   │  Add to bag · Buy now      │
 *   │                                   │  multi-seller compare      │
 *   │                                   │  ways to save              │
 *   │                                   │  shipping + returns        │
 *   ├───────────────────────────────────┴────────────────────────────┤
 *   │ Pivota Insights · [Compare table when open] · Tech specs       │
 *   │ Pro reviews · In-the-box · Reviews · UGC · Similar             │
 *   └────────────────────────────────────────────────────────────────┘
 */
export function ElectronicsPDPDesktop(props: ElectronicsPDPMobileProps & {
  compareAlternatives?: { id: string; title: string; rows: Record<string, string> }[] | null;
}) {
  const reviewsAnchorRef = useRef<HTMLDivElement | null>(null);
  const [comparing, setComparing] = useState(false);
  const [config, setConfig] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = { ...(props.initialConfigSelection || {}) };
    for (const g of props.configuratorGroups || []) {
      if (!init[g.id]) init[g.id] = g.options[0]?.id;
    }
    return init;
  });
  const [protection, setProtection] = useState<string | null>(
    props.initialProtectionId ?? (props.protectionPlans?.find((p) => p.popular)?.id ?? null),
  );

  const cfgDelta = useMemo(
    () => (props.configuratorGroups || []).reduce(
      (s, g) => s + (g.options.find((o) => o.id === config[g.id])?.delta ?? 0),
      0,
    ),
    [props.configuratorGroups, config],
  );
  const planPrice = props.protectionPlans?.find((p) => p.id === protection)?.price ?? 0;
  const total = props.basePrice + cfgDelta + planPrice;

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
          {/* Compare button — toggles the compare-table block below. Only
              renders when alternatives are supplied. */}
          {props.compareAlternatives?.length ? (
            <button
              type="button"
              onClick={() => setComparing((v) => !v)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-white px-3 text-[12px] font-medium text-foreground hover:border-primary/40"
            >
              <Layers className="h-3.5 w-3.5" />
              {comparing ? 'Hide compare' : 'Compare'}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-8 pb-24">
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 pt-6 lg:grid-cols-[minmax(0,1fr)_460px]">
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
              onSeeReviews={() => reviewsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            />
            <BeautyPriceRow
              price={props.basePrice + cfgDelta}
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
            {props.configuratorGroups?.length ? (
              <div>
                {props.configuratorGroups.map((g) => (
                  <ElectronicsConfigurator
                    key={g.id}
                    group={g}
                    selectedId={config[g.id]}
                    onSelect={(optId) => setConfig((c) => ({ ...c, [g.id]: optId }))}
                  />
                ))}
              </div>
            ) : null}
            {props.protectionPlans?.length ? (
              <ElectronicsProtectionPlan
                plans={props.protectionPlans}
                selectedId={protection}
                onSelect={setProtection}
              />
            ) : null}
            <BeautyDesktopBuyBox
              unitPrice={total}
              currency={props.currency}
              quantity={props.quantity}
              disabled={!props.inStock}
              buyNowLabel={props.buyNowLabel}
              isExternalPurchase={props.isExternalPurchase}
              externalRetailerLabel={props.externalRetailerLabel}
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
          </div>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            {props.insights ? <BeautyPivotaInsights insights={props.insights} /> : null}

            {comparing && props.compareAlternatives?.length ? (
              <div className="mt-8">
                <ElectronicsCompareTable thisProduct={{ id: 'this', title: props.title, rows: {} }} alternatives={props.compareAlternatives} />
              </div>
            ) : null}

            {props.specGroups?.length ? (
              <div className="mt-8">
                <ElectronicsTechSpecs groups={props.specGroups} layout="grid" />
              </div>
            ) : null}

            {props.proReviews?.length ? (
              <div className="mt-8">
                <ElectronicsProReviews reviews={props.proReviews} layout="grid" />
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
              {props.compatibilityText ? (
                <BeautyAccordion title="Compatibility &amp; ports">{props.compatibilityText}</BeautyAccordion>
              ) : null}
              {props.shippingReturnsText ? (
                <BeautyAccordion title="Shipping &amp; returns">{props.shippingReturnsText}</BeautyAccordion>
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
            {props.inBox?.length ? <ElectronicsInTheBox items={props.inBox} /> : null}
            {props.recentPurchases?.length ? (
              <BeautyRecentPurchasesRows items={props.recentPurchases} totalLabel={props.recentPurchasesTotal} />
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
    </div>
  );
}
