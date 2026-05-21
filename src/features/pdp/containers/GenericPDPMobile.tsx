'use client';

import { useEffect, useRef, useState } from 'react';
import type { Offer, Variant } from '@/features/pdp/types';
import { BeautyMobileGallery } from '@/features/pdp/components/BeautyMobileGallery';
import { BeautyProductHeader } from '@/features/pdp/components/BeautyProductHeader';
import { BeautyPriceRow } from '@/features/pdp/components/BeautyPriceRow';
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
import { BundleCompositionGrid } from '@/features/pdp/sections/BundleCompositionGrid';
import type { BundleCompositionData, BundleCompositionItem } from '@/features/pdp/types';

/**
 * GenericPDPMobile — brand-kit mobile PDP for products that don't fit
 * the beauty / fashion / electronics specializations (gift sets, bundles,
 * miscellaneous merchandise). Mirrors the section order and chrome of
 * FashionPDPMobile / ElectronicsPDPMobile but with no category-specific
 * overlays. Reuses every Beauty* design component to stay aligned with
 * the standard brand kit.
 */

export type GenericPDPMobileProps = {
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
  // variant / SKU selector — passed through as a React node so the caller
  // can drop in product-line, beauty-shade, fashion-color, or generic-size
  // selectors as needed. Keeps this container truly category-neutral.
  variantSelector?: React.ReactNode;
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
  // ways to save
  product: React.ComponentProps<typeof WaysToSave>['product'];
  quantity: number;
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
  // bundle composition (rendered above similar when product is a bundle)
  bundleComposition?: BundleCompositionData | null;
  onBundleComponentClick?: (item: BundleCompositionItem, index: number) => void;
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
  similarSentinelRef?: React.MutableRefObject<HTMLDivElement | null>;
  // brand
  brandName?: string | null;
  brandHref?: string | null;
  // buy bar
  buyNowLabel?: string;
  inStock: boolean;
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
  { id: 'bundle', label: "What's in the set" },
  { id: 'reviews', label: 'Reviews' },
  { id: 'similar', label: 'Similar' },
];

export function GenericPDPMobile(props: GenericPDPMobileProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const overviewRef = useRef<HTMLDivElement | null>(null);
  const bundleRef = useRef<HTMLDivElement | null>(null);
  const reviewsRef = useRef<HTMLDivElement | null>(null);
  const similarRef = useRef<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [tabsVisible, setTabsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const sectionRefs: Record<string, React.RefObject<HTMLDivElement | null>> = {
    overview: overviewRef,
    bundle: bundleRef,
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
      for (const id of ['overview', 'bundle', 'reviews', 'similar']) {
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

  const hasBundleItems = Boolean(props.bundleComposition?.items?.length);
  const hasSimilarItems = Boolean(props.similar?.length);

  const availableTabs = SECTION_TABS.filter((t) => {
    if (t.id === 'bundle') return hasBundleItems;
    if (t.id === 'similar') return hasSimilarItems;
    return true; // overview + reviews always available
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

          {props.variantSelector}

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

          {/* Ways to save */}
          <WaysToSave
            product={props.product}
            selectedOffer={props.offers.find((o) => o.offer_id === props.selectedOfferId)}
            selectedVariant={props.selectedVariant}
            quantity={props.quantity}
          />

          {/* Shipping + returns strip */}
          <BeautyShippingStrip
            etaRange={props.etaRange}
            methodLabel={props.shippingMethodLabel}
            freeShipping={props.freeShipping}
            returnWindowDays={props.returnWindowDays}
            freeReturns={props.freeReturns}
            sellerLabel={props.shippingSellerLabel}
          />

          {/* Recent purchases */}
          {props.recentPurchases?.length ? (
            <BeautyRecentPurchasesRows
              items={props.recentPurchases}
              totalLabel={props.recentPurchasesTotal}
            />
          ) : null}

          {/* Customer photos — always renders (empty-state CTA) */}
          <BeautyCustomerPhotos
            photos={props.customerPhotos ?? []}
            totalLabel={props.customerPhotosTotal}
            onViewAll={props.onUgcViewAll}
            onShare={props.onUgcShare}
            onPhotoClick={props.onUgcPhotoClick}
          />
        </div>

        {/* Bundle composition — between social proof and insights */}
        {hasBundleItems && props.bundleComposition ? (
          <div ref={bundleRef}>
            <BundleCompositionGrid
              data={props.bundleComposition}
              onItemClick={props.onBundleComponentClick}
            />
          </div>
        ) : null}

        {/* Insights */}
        {props.insights ? <BeautyPivotaInsights insights={props.insights} /> : null}

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

        {hasSimilarItems && props.similar ? (
          <div ref={similarRef}>
            <BeautyYouMayAlsoLike
              items={props.similar}
              onItemClick={props.onSimilarClick}
              onBuy={props.onSimilarBuy}
            />
          </div>
        ) : null}
        <div
          ref={(node) => {
            if (props.similarSentinelRef) props.similarSentinelRef.current = node;
          }}
          className="h-4"
          aria-hidden="true"
        />

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
    </div>
  );
}
