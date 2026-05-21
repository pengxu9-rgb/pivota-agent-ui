'use client';

import { useEffect, useRef, useState } from 'react';
import type { Offer, Variant } from '@/features/pdp/types';
import { BeautyMobileGallery } from '@/features/pdp/components/BeautyMobileGallery';
import { BeautyProductHeader } from '@/features/pdp/components/BeautyProductHeader';
import { BeautyPriceRow } from '@/features/pdp/components/BeautyPriceRow';
import { BeautyShadeSelector, type BeautyShade } from '@/features/pdp/components/BeautyShadeSelector';
import { BeautySizeSelector, type BeautySize } from '@/features/pdp/components/BeautySizeSelector';
import { BeautyMobileSellerPicker } from '@/features/pdp/components/BeautyMobileSellerPicker';
import { BeautyShippingStrip } from '@/features/pdp/components/BeautyShippingStrip';
import { BeautyRecentPurchasesRows, type BeautyPurchase } from '@/features/pdp/components/BeautyRecentPurchasesRows';
import { BeautyCustomerPhotos } from '@/features/pdp/components/BeautyCustomerPhotos';
import { BeautyPivotaInsights, type BeautyInsightsData } from '@/features/pdp/components/BeautyPivotaInsights';
import { BeautyAccordion } from '@/features/pdp/components/BeautyAccordion';
import { BeautyReviewsPreview, type BeautyReviewItem } from '@/features/pdp/components/BeautyReviewsPreview';
import { BeautyYouMayAlsoLike, type BeautySimilarItem } from '@/features/pdp/components/BeautyYouMayAlsoLike';
import { BeautyStickyTabs, type BeautyTab } from '@/features/pdp/components/BeautyStickyTabs';
import { BeautyStickyTopBar } from '@/features/pdp/components/BeautyStickyTopBar';
import { BeautyMobileBuyBar } from '@/features/pdp/components/BeautyMobileBuyBar';
import { BeautyQuestions, type BeautyQuestion } from '@/features/pdp/components/BeautyQuestions';
import { BeautyBrandCard } from '@/features/pdp/components/BeautyBrandCard';
import { WaysToSave } from '@/features/pdp/components/WaysToSave';
import { FashionBenefitsStrip } from '@/features/pdp/components/FashionBenefitsStrip';
import { FashionModelInfo } from '@/features/pdp/components/FashionModelInfo';
import { FashionSizeFitGuide, type FashionFitChart } from '@/features/pdp/components/FashionSizeFitGuide';
import { FashionMaterialCare } from '@/features/pdp/components/FashionMaterialCare';
import { FashionPivotaStyling, type FashionPairing } from '@/features/pdp/components/FashionPivotaStyling';

/**
 * FashionPDPMobile — the from-scratch redesigned Fashion mobile PDP.
 *
 * Same architecture as `BeautyPDPMobile`: a relative scroll container with
 * sticky top bar / sticky tab nav / sticky buy bar overlays. PdpContainer
 * renders this as an early return when `isFashionMobile` is true.
 *
 * Reuses every shared Beauty* leaf component; adds fashion-specific:
 *   • FashionBenefitsStrip   — push-up cup / plus M-XXXL / OEKO-TEX / 30-day return
 *   • FashionModelInfo       — "Model is 5'8" wearing M" inline pill
 *   • FashionSizeFitGuide    — weight-range chart in a dialog
 *   • FashionMaterialCare    — Material / Origin / Care 3-row block
 *   • FashionPivotaStyling   — outfit pairings horizontal carousel
 *
 * The Reviews accordion and Customer Photos grid render UNCONDITIONALLY
 * (see empty-state fix in §Part 1 of the handoff README) so a freshly-
 * launched fashion product still surfaces the "Write a review" and
 * "+ Add your photo" actions.
 */

export type FashionPDPMobileProps = {
  // header / price
  brand?: string | null;
  title: string;
  subtitle?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  price: number;
  compareAt?: number | null;
  discountPct?: number | null;
  currency: string;
  // gallery
  galleryImages: string[];
  onOpenViewer?: (index: number) => void;
  // variants
  colors?: BeautyShade[] | null;                  // shape matches BeautyShade; swatches are images/hex
  selectedColorId?: string | null;
  onSelectColor?: (id: string) => void;
  sizes?: BeautySize[] | null;
  selectedSizeId?: string | null;
  onSelectSize?: (id: string) => void;
  // size + fit guide (modal)
  fitChart?: FashionFitChart | null;
  // model
  modelInfo?: string | null;
  modelAvatar?: string | null;
  // benefits — short labels driven by payload
  benefits?: string[] | null;
  // material / care
  material?: string | null;
  origin?: string | null;
  care?: string | null;
  // sellers
  offers: Offer[];
  selectedVariant: Variant | null;
  selectedOfferId: string | null;
  bestPriceOfferId: string | null;
  primaryMerchantId: string | null;
  onSelectOffer: (offerId: string) => void;
  // shipping
  etaRange?: [number, number] | null;
  shippingMethodLabel?: string | null;
  freeShipping?: boolean | null;
  returnWindowDays?: number | null;
  freeReturns?: boolean | null;
  shippingSellerLabel?: string | null;
  // ways to save — passed through directly to the existing component
  product: React.ComponentProps<typeof WaysToSave>['product'];
  // social proof
  recentPurchases?: BeautyPurchase[] | null;
  recentPurchasesTotal?: string | number | null;
  customerPhotos?: string[] | null;
  customerPhotosTotal?: string | number | null;
  onUgcViewAll?: () => void;
  onUgcShare?: () => void;
  onUgcPhotoClick?: (index: number) => void;
  // insights
  insights?: BeautyInsightsData | null;
  // styling pairings
  pairings?: FashionPairing[] | null;
  onPairingClick?: (item: FashionPairing) => void;
  // reviews accordion
  reviews?: BeautyReviewItem[] | null;
  onWriteReview?: () => void;
  onSeeAllReviews?: () => void;
  // accordions
  details?: React.ReactNode;
  shippingReturnsText?: React.ReactNode;
  // questions
  questions?: BeautyQuestion[] | null;
  onAskQuestion?: () => void;
  onSeeAllQuestions?: () => void;
  onOpenQuestion?: (questionId: number) => void;
  canAskQuestion?: boolean;
  // recommendations
  similar?: BeautySimilarItem[] | null;
  onSimilarClick?: (item: BeautySimilarItem, index: number) => void;
  onSimilarBuy?: (item: BeautySimilarItem, index: number) => void;
  // brand
  brandName?: string | null;
  brandHref?: string | null;
  // buy bar
  buyNowLabel?: string;
  inStock: boolean;
  quantity: number;
  onQtyChange: (next: number) => void;
  onAddToCart: () => void;
  onBuyNow: () => void;
  // chrome
  onBack?: () => void;
  onShare?: () => void;
  onSearch?: () => void;
};

const SECTION_TABS: BeautyTab[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'fit',      label: 'Fit' },
  { id: 'reviews',  label: 'Reviews' },
  { id: 'similar',  label: 'Similar' },
];

export function FashionPDPMobile(props: FashionPDPMobileProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const overviewRef = useRef<HTMLDivElement | null>(null);
  const fitRef = useRef<HTMLDivElement | null>(null);
  const reviewsRef = useRef<HTMLDivElement | null>(null);
  const similarRef = useRef<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [tabsVisible, setTabsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [guideOpen, setGuideOpen] = useState(false);

  const sectionRefs: Record<string, React.RefObject<HTMLDivElement | null>> = {
    overview: overviewRef,
    fit: fitRef,
    reviews: reviewsRef,
    similar: similarRef,
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const top = el.scrollTop;
      const pastFirstPage = top >= Math.max(320, el.clientHeight - 80);
      setScrolled(pastFirstPage);
      setTabsVisible(pastFirstPage);
      let current = 'overview';
      for (const id of ['overview', 'fit', 'reviews', 'similar']) {
        const node = sectionRefs[id].current;
        if (node && node.offsetTop - el.scrollTop <= 120) current = id;
      }
      setActiveTab(current);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToTab = (id: string) => {
    setActiveTab(id);
    const node = sectionRefs[id]?.current;
    const scroller = scrollRef.current;
    if (node && scroller) scroller.scrollTo({ top: Math.max(0, node.offsetTop - 8), behavior: 'smooth' });
  };

  const availableTabs = SECTION_TABS.filter((t) => {
    if (t.id === 'fit') return Boolean(props.fitChart);
    if (t.id === 'similar') return Boolean(props.similar?.length);
    return true; // overview + reviews always available (empty-state fix)
  });

  return (
    <div className="lovable-pdp relative min-h-screen bg-background text-foreground">
      <BeautyStickyTopBar
        scrolled={scrolled}
        onBack={props.onBack}
        onShare={props.onShare}
        onSearch={props.onSearch}
      />
      <BeautyStickyTabs visible={tabsVisible} activeTab={activeTab} tabs={availableTabs} onTabChange={goToTab} />

      <div ref={scrollRef} className="h-screen overflow-y-auto overflow-x-hidden" style={{ paddingBottom: 96 }}>
        <div ref={overviewRef}>
          <BeautyMobileGallery images={props.galleryImages} alt={props.title} onOpenViewer={props.onOpenViewer} />
          <BeautyProductHeader
            brand={props.brand}
            title={props.title}
            subtitle={props.subtitle}
            rating={props.rating}
            reviewCount={props.reviewCount}
            onSeeReviews={() => goToTab('reviews')}
          />
          <BeautyPriceRow
            price={props.price}
            compareAt={props.compareAt}
            discountPct={props.discountPct}
            currency={props.currency}
          />

          {/* Color swatches — BeautyShadeSelector handles image/hex swatches */}
          {props.colors?.length ? (
            <BeautyShadeSelector
              shades={props.colors}
              selectedId={props.selectedColorId}
              onSelect={props.onSelectColor || (() => {})}
              axisLabel="Color"
            />
          ) : null}

          {/* Size — with "Size + fit guide" link in the label slot.
              BeautySizeSelector renders the pills; the link is placed inline
              below if a fitChart is provided. */}
          {props.sizes?.length ? (
            <>
              <BeautySizeSelector
                sizes={props.sizes}
                selectedId={props.selectedSizeId}
                onSelect={props.onSelectSize || (() => {})}
              />
              {props.fitChart ? (
                <div ref={fitRef} className="mt-3 px-[18px]">
                  <button
                    type="button"
                    onClick={() => setGuideOpen(true)}
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="9" width="20" height="6" rx="1"/>
                      <path d="M6 9v3M10 9v6M14 9v3M18 9v6"/>
                    </svg>
                    Size + fit guide
                  </button>
                </div>
              ) : null}
            </>
          ) : null}

          {/* Model line */}
          {props.modelInfo ? (
            <FashionModelInfo info={props.modelInfo} avatarUrl={props.modelAvatar} />
          ) : null}

          {/* Benefits strip (4 items) */}
          {props.benefits?.length ? <FashionBenefitsStrip benefits={props.benefits} /> : null}

          {/* Multi-seller compare */}
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

          {/* Ways to save (promo codes + cart unlocks + shipping + payment) */}
          <WaysToSave
            product={props.product}
            selectedOffer={props.offers.find((o) => o.offer_id === props.selectedOfferId)}
            selectedVariant={props.selectedVariant}
            quantity={props.quantity}
          />

          {/* Shipping + returns strip (with free 30-day + size exchange) */}
          <BeautyShippingStrip
            etaRange={props.etaRange}
            methodLabel={props.shippingMethodLabel}
            freeShipping={props.freeShipping}
            returnWindowDays={props.returnWindowDays}
            freeReturns={props.freeReturns}
            sellerLabel={props.shippingSellerLabel}
          />

          {/* Material / Origin / Care */}
          {(props.material || props.origin || props.care) ? (
            <FashionMaterialCare material={props.material} origin={props.origin} care={props.care} />
          ) : null}

          {/* Recent purchases */}
          {props.recentPurchases?.length ? (
            <BeautyRecentPurchasesRows
              items={props.recentPurchases}
              totalLabel={props.recentPurchasesTotal}
            />
          ) : null}

          {/* Customer photos — always renders (empty-state fix) */}
          <BeautyCustomerPhotos
            photos={props.customerPhotos ?? []}
            totalLabel={props.customerPhotosTotal}
            onViewAll={props.onUgcViewAll}
            onShare={props.onUgcShare}
            onPhotoClick={props.onUgcPhotoClick}
          />
        </div>

        {/* Insights */}
        {props.insights ? <BeautyPivotaInsights insights={props.insights} /> : null}

        {/* Pivota styling — outfit pairings carousel */}
        {props.pairings?.length ? (
          <FashionPivotaStyling pairings={props.pairings} onItemClick={props.onPairingClick} />
        ) : null}

        {/* Reviews + accordions */}
        <div ref={reviewsRef} className="mt-2.5">
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

        <BeautyBrandCard brandName={props.brandName} brandHref={props.brandHref} />

        {props.similar?.length ? (
          <div ref={similarRef}>
            <BeautyYouMayAlsoLike
              items={props.similar}
              onItemClick={props.onSimilarClick}
              onBuy={props.onSimilarBuy}
            />
          </div>
        ) : null}

        <div className="h-3" />
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-10">
        <BeautyMobileBuyBar
          unitPrice={props.price}
          currency={props.currency}
          quantity={props.quantity}
          disabled={!props.inStock}
          buyNowLabel={props.buyNowLabel}
          onQtyChange={props.onQtyChange}
          onAddToCart={props.onAddToCart}
          onBuyNow={props.onBuyNow}
        />
      </div>

      {/* Size + fit guide modal */}
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
