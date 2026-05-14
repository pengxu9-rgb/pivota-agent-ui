'use client';

import { useEffect, useRef, useState } from 'react';
import type { Offer, Variant } from '@/features/pdp/types';
import { BeautyMobileGallery } from '@/features/pdp/components/BeautyMobileGallery';
import { BeautyProductHeader } from '@/features/pdp/components/BeautyProductHeader';
import { BeautyPriceRow } from '@/features/pdp/components/BeautyPriceRow';
import { BeautyShadeSelector, type BeautyShade } from '@/features/pdp/components/BeautyShadeSelector';
import { BeautySizeSelector, type BeautySize } from '@/features/pdp/components/BeautySizeSelector';
import { BeautyBenefitsStrip } from '@/features/pdp/components/BeautyBenefitsStrip';
import { BeautyMobileSellerPicker } from '@/features/pdp/components/BeautyMobileSellerPicker';
import { BeautyShippingStrip } from '@/features/pdp/components/BeautyShippingStrip';
import { BeautyKeyClaims } from '@/features/pdp/components/BeautyKeyClaims';
import { BeautyRecentPurchasesRows, type BeautyPurchase } from '@/features/pdp/components/BeautyRecentPurchasesRows';
import { BeautyCustomerPhotos } from '@/features/pdp/components/BeautyCustomerPhotos';
import { BeautyPivotaInsights, type BeautyInsightsData } from '@/features/pdp/components/BeautyPivotaInsights';
import { BeautyAccordion } from '@/features/pdp/components/BeautyAccordion';
import { BeautyReviewsPreview, type BeautyReviewItem } from '@/features/pdp/components/BeautyReviewsPreview';
import { BeautyYouMayAlsoLike, type BeautySimilarItem } from '@/features/pdp/components/BeautyYouMayAlsoLike';
import { BeautyStickyTabs, type BeautyTab } from '@/features/pdp/components/BeautyStickyTabs';
import { BeautyStickyTopBar } from '@/features/pdp/components/BeautyStickyTopBar';
import { BeautyMobileBuyBar } from '@/features/pdp/components/BeautyMobileBuyBar';

/**
 * BeautyPDPMobile — the from-scratch redesigned Beauty mobile PDP.
 *
 * Assembles every section in the redesign/pivota-pdp.jsx order inside a
 * relative scroll container with StickyTopBar / StickyTabs / StickyBuyBar
 * overlays. PdpContainer renders this as an early return when
 * `isBeautyMobile` is true and supplies every prop from its in-scope data;
 * desktop and generic paths are untouched.
 *
 * Sections with no clean PDPPayload data source (BenefitsStrip, KeyClaims)
 * are simply not passed data and render nothing — never fabricated content.
 */

export type BeautyPDPMobileProps = {
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
  shades?: BeautyShade[] | null;
  selectedShadeId?: string | null;
  onSelectShade?: (id: string) => void;
  sizes?: BeautySize[] | null;
  selectedSizeId?: string | null;
  onSelectSize?: (id: string) => void;
  // benefits / claims (render nothing when absent)
  benefits?: string[] | null;
  claims?: string[] | null;
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
  // accordions
  reviews?: BeautyReviewItem[] | null;
  onSeeAllReviews?: () => void;
  ingredients?: React.ReactNode;
  howToUse?: React.ReactNode;
  shippingReturnsText?: React.ReactNode;
  // recommendations
  similar?: BeautySimilarItem[] | null;
  onSimilarClick?: (item: BeautySimilarItem, index: number) => void;
  onSimilarBuy?: (item: BeautySimilarItem, index: number) => void;
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
};

const SECTION_TABS: BeautyTab[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'insights', label: 'Insights' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'similar', label: 'Similar' },
];

export function BeautyPDPMobile(props: BeautyPDPMobileProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const overviewRef = useRef<HTMLDivElement | null>(null);
  const insightsRef = useRef<HTMLDivElement | null>(null);
  const reviewsRef = useRef<HTMLDivElement | null>(null);
  const similarRef = useRef<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [tabsVisible, setTabsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const sectionRefs: Record<string, React.RefObject<HTMLDivElement | null>> = {
    overview: overviewRef,
    insights: insightsRef,
    reviews: reviewsRef,
    similar: similarRef,
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const top = el.scrollTop;
      setScrolled(top > 280);
      setTabsVisible(top > 480);
      // active-tab scrollspy
      let current = 'overview';
      for (const id of ['overview', 'insights', 'reviews', 'similar']) {
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
    if (node && scroller) {
      scroller.scrollTo({ top: Math.max(0, node.offsetTop - 8), behavior: 'smooth' });
    }
  };

  const availableTabs = SECTION_TABS.filter((t) => {
    if (t.id === 'insights') return Boolean(props.insights);
    if (t.id === 'reviews') return Boolean(props.reviews?.length);
    if (t.id === 'similar') return Boolean(props.similar?.length);
    return true;
  });

  return (
    <div className="lovable-pdp relative min-h-screen bg-background text-foreground">
      <BeautyStickyTopBar
        scrolled={scrolled && !tabsVisible}
        scrolledTitle={props.brand ? `${props.brand}` : props.title}
        onBack={props.onBack}
        onShare={props.onShare}
      />
      <BeautyStickyTabs
        visible={tabsVisible}
        activeTab={activeTab}
        tabs={availableTabs}
        onTabChange={goToTab}
      />

      <div
        ref={scrollRef}
        className="h-screen overflow-y-auto overflow-x-hidden"
        style={{ paddingBottom: 96 }}
      >
        <div ref={overviewRef}>
          <BeautyMobileGallery
            images={props.galleryImages}
            alt={props.title}
            onOpenViewer={props.onOpenViewer}
          />
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
          {props.shades?.length ? (
            <BeautyShadeSelector
              shades={props.shades}
              selectedId={props.selectedShadeId}
              onSelect={props.onSelectShade || (() => {})}
            />
          ) : null}
          {props.sizes?.length ? (
            <BeautySizeSelector
              sizes={props.sizes}
              selectedId={props.selectedSizeId}
              onSelect={props.onSelectSize || (() => {})}
            />
          ) : null}
          {props.benefits?.length ? <BeautyBenefitsStrip benefits={props.benefits} /> : null}
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
          <BeautyShippingStrip
            etaRange={props.etaRange}
            methodLabel={props.shippingMethodLabel}
            freeShipping={props.freeShipping}
            returnWindowDays={props.returnWindowDays}
            freeReturns={props.freeReturns}
            sellerLabel={props.shippingSellerLabel}
          />
          {props.claims?.length ? <BeautyKeyClaims claims={props.claims} /> : null}
          {props.recentPurchases?.length ? (
            <BeautyRecentPurchasesRows
              items={props.recentPurchases}
              totalLabel={props.recentPurchasesTotal}
            />
          ) : null}
          {props.customerPhotos?.length ? (
            <BeautyCustomerPhotos
              photos={props.customerPhotos}
              totalLabel={props.customerPhotosTotal}
              onViewAll={props.onUgcViewAll}
              onShare={props.onUgcShare}
              onPhotoClick={props.onUgcPhotoClick}
            />
          ) : null}
        </div>

        {props.insights ? (
          <div ref={insightsRef}>
            <BeautyPivotaInsights insights={props.insights} />
          </div>
        ) : null}

        <div ref={reviewsRef} className="mt-4">
          {props.reviews?.length ? (
            <BeautyAccordion title="Reviews" count={props.reviewCount ?? props.reviews.length} defaultOpen>
              <BeautyReviewsPreview
                rating={props.rating ?? 0}
                reviewCount={props.reviewCount ?? props.reviews.length}
                reviews={props.reviews}
                onSeeAll={props.onSeeAllReviews}
              />
            </BeautyAccordion>
          ) : null}
          {props.ingredients ? (
            <BeautyAccordion title="Ingredients">{props.ingredients}</BeautyAccordion>
          ) : null}
          {props.howToUse ? (
            <BeautyAccordion title="How to use">{props.howToUse}</BeautyAccordion>
          ) : null}
          {props.shippingReturnsText ? (
            <BeautyAccordion title="Shipping &amp; returns">{props.shippingReturnsText}</BeautyAccordion>
          ) : null}
        </div>

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
    </div>
  );
}
