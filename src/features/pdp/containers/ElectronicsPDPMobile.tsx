'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Offer, Variant } from '@/features/pdp/types';
import { BeautyMobileGallery } from '@/features/pdp/components/BeautyMobileGallery';
import { BeautyProductHeader } from '@/features/pdp/components/BeautyProductHeader';
import { BeautyPriceRow } from '@/features/pdp/components/BeautyPriceRow';
import { BeautyShadeSelector, type BeautyShade } from '@/features/pdp/components/BeautyShadeSelector';
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
import { ElectronicsConfigurator, type ConfiguratorGroup } from '@/features/pdp/components/ElectronicsConfigurator';
import { ElectronicsProtectionPlan, type ProtectionPlan } from '@/features/pdp/components/ElectronicsProtectionPlan';
import { ElectronicsProReviews, type ProReview } from '@/features/pdp/components/ElectronicsProReviews';
import { ElectronicsInTheBox } from '@/features/pdp/components/ElectronicsInTheBox';
import { ElectronicsTechSpecs, type SpecGroup } from '@/features/pdp/components/ElectronicsTechSpecs';

/**
 * ElectronicsPDPMobile — mobile container for the electronics PDP.
 *
 * Differs from Beauty/Fashion in two ways:
 *  1) Owns local configurator + protection-plan state. The total price
 *     threaded into the buy bar = basePrice + sum(group deltas) + plan price.
 *  2) The sticky buy bar shows a one-line config summary above the qty+CTA:
 *        Midnight · 16 GB · 512 GB · AppleCare+
 *
 * Two presentations are supported:
 *  - Config-heavy (configuratorGroups non-empty, e.g. MacBook Air M3) —
 *    Memory + Storage cards render under the multi-seller picker.
 *  - Simpler (configuratorGroups empty, e.g. Sony WH-1000XM5) — the
 *    section is skipped; only color + protection plan show.
 */

export type ElectronicsPDPMobileProps = {
  // header / price
  brand?: string | null;
  title: string;
  subtitle?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  basePrice: number;                                  // pre-config price
  compareAt?: number | null;
  discountPct?: number | null;
  currency: string;
  // gallery
  galleryImages: string[];
  onOpenViewer?: (index: number) => void;
  // variants
  colors?: BeautyShade[] | null;
  selectedColorId?: string | null;
  onSelectColor?: (id: string) => void;
  // configurator + protection
  configuratorGroups?: ConfiguratorGroup[] | null;
  initialConfigSelection?: Record<string, string> | null;   // group_id → option_id
  protectionPlans?: ProtectionPlan[] | null;
  initialProtectionId?: string | null;
  onSelectionChange?: (sel: { config: Record<string, string>; protection: string | null; total: number }) => void;
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
  // insights
  insights?: BeautyInsightsData | null;
  // electronics-specific content
  specGroups?: SpecGroup[] | null;
  proReviews?: ProReview[] | null;
  inBox?: string[] | null;
  // social proof
  recentPurchases?: BeautyPurchase[] | null;
  recentPurchasesTotal?: string | number | null;
  customerPhotos?: string[] | null;
  customerPhotosTotal?: string | number | null;
  onUgcViewAll?: () => void;
  onUgcShare?: () => void;
  onUgcPhotoClick?: (index: number) => void;
  // reviews + accordions
  reviews?: BeautyReviewItem[] | null;
  onWriteReview?: () => void;
  onSeeAllReviews?: () => void;
  compatibilityText?: React.ReactNode;
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
  { id: 'specs',    label: 'Specs' },
  { id: 'reviews',  label: 'Reviews' },
  { id: 'similar',  label: 'Similar' },
];

export function ElectronicsPDPMobile(props: ElectronicsPDPMobileProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const overviewRef = useRef<HTMLDivElement | null>(null);
  const specsRef = useRef<HTMLDivElement | null>(null);
  const reviewsRef = useRef<HTMLDivElement | null>(null);
  const similarRef = useRef<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [tabsVisible, setTabsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Configurator state — defaults from `initialConfigSelection` or the first
  // option per group.
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

  const total = useMemo(() => {
    const cfgDelta = (props.configuratorGroups || []).reduce((sum, g) => {
      const opt = g.options.find((o) => o.id === config[g.id]);
      return sum + (opt?.delta ?? 0);
    }, 0);
    const plan = props.protectionPlans?.find((p) => p.id === protection);
    return props.basePrice + cfgDelta + (plan?.price ?? 0);
  }, [props.basePrice, props.configuratorGroups, props.protectionPlans, config, protection]);

  useEffect(() => {
    props.onSelectionChange?.({ config, protection, total });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, protection, total]);

  const sectionRefs: Record<string, React.RefObject<HTMLDivElement | null>> = {
    overview: overviewRef, specs: specsRef, reviews: reviewsRef, similar: similarRef,
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
      for (const id of ['overview', 'specs', 'reviews', 'similar']) {
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
    if (t.id === 'specs') return Boolean(props.specGroups?.length);
    if (t.id === 'similar') return Boolean(props.similar?.length);
    return true;
  });

  const selectedColorName = props.colors?.find((c) => c.id === props.selectedColorId)?.name;
  const configSummary = [
    selectedColorName,
    ...(props.configuratorGroups || []).map((g) => g.options.find((o) => o.id === config[g.id])?.label),
    props.protectionPlans?.find((p) => p.id === protection && p.price > 0)?.label,
  ].filter(Boolean).join(' · ');

  return (
    <div className="lovable-pdp relative min-h-screen bg-background text-foreground">
      <BeautyStickyTopBar scrolled={scrolled} onBack={props.onBack} onShare={props.onShare} onSearch={props.onSearch} />
      <BeautyStickyTabs visible={tabsVisible} activeTab={activeTab} tabs={availableTabs} onTabChange={goToTab} />

      <div ref={scrollRef} className="h-screen overflow-y-auto overflow-x-hidden" style={{ paddingBottom: 110 }}>
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
            price={props.basePrice + (props.configuratorGroups || []).reduce((s, g) => s + (g.options.find((o) => o.id === config[g.id])?.delta ?? 0), 0)}
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

          {/* Configurator groups — only renders when present */}
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

          {/* Protection plan — sits after Ways to Save so the shopper sees
              eligible discounts before deciding on coverage. */}
          {props.protectionPlans?.length ? (
            <ElectronicsProtectionPlan
              plans={props.protectionPlans}
              selectedId={protection}
              onSelect={setProtection}
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
        </div>

        {props.insights ? <BeautyPivotaInsights insights={props.insights} /> : null}

        {/* Tech specs — collapsible accordions per group */}
        {props.specGroups?.length ? (
          <div ref={specsRef}>
            <ElectronicsTechSpecs groups={props.specGroups} />
          </div>
        ) : null}

        {/* Pro reviews */}
        {props.proReviews?.length ? (
          <ElectronicsProReviews reviews={props.proReviews} />
        ) : null}

        {/* In-the-box */}
        {props.inBox?.length ? <ElectronicsInTheBox items={props.inBox} /> : null}

        {/* Social proof */}
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

      {/* Sticky buy bar — adds a one-line config summary above the standard
          qty + Buy now controls. We reuse the BeautyMobileBuyBar shell by
          stacking the summary in front of it. */}
      <div className="absolute bottom-0 left-0 right-0 z-10">
        {configSummary ? (
          <div className="border-t border-border bg-card/95 px-3.5 pb-1 pt-2 text-[11px] text-muted-foreground backdrop-blur">
            <span
              className="inline-block h-2 w-2 rounded-full align-middle"
              style={{ background: props.colors?.find((c) => c.id === props.selectedColorId)?.hex || 'var(--muted)' }}
              aria-hidden
            />{' '}
            <span className="align-middle">{configSummary}</span>
          </div>
        ) : null}
        <BeautyMobileBuyBar
          unitPrice={total}
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
