'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { Heart, ShoppingCart, Star } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { normalizeDisplayImageUrl } from '@/lib/displayImage';
import { hideProductRouteLoading, showProductRouteLoading } from '@/lib/productRouteLoading';
import { buildProductHrefForProduct } from '@/lib/productHref';
import { appendCurrentPathAsReturn } from '@/lib/returnUrl';
import { buildSavingsPresentation, getSummaryBadges } from '@/lib/savingsPresentation';
import type { ProductResponse } from '@/lib/api';

export type CardColorVariant = 'coral' | 'teal' | 'purple';

export const CARD_COLOR_VARIANTS: CardColorVariant[] = ['coral', 'teal', 'purple'];

const COLOR_MAP: Record<CardColorVariant, { bg: string; icon: string }> = {
  coral:  { bg: '#FAECE7', icon: '#993C1D' },
  teal:   { bg: '#E1F5EE', icon: '#0F6E56' },
  purple: { bg: '#EEEDFE', icon: '#3C3489' },
};

type Props = {
  product: ProductResponse;
  onAddToCart: (product: ProductResponse) => void;
  colorVariant?: CardColorVariant;
};

function formatPrice(product: ProductResponse): string {
  const currency = String(product.currency || '').trim();
  const price = typeof product.price === 'number' && Number.isFinite(product.price) ? product.price : 0;
  if (currency && currency !== 'USD') return `${currency} ${price.toFixed(2)}`;
  return `$${price.toFixed(2)}`;
}

function hasEvidenceOffers(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === 'object' &&
      Array.isArray((value as any).offers) &&
      (value as any).offers.length > 0,
  );
}

function hasMultipleSellerOffers(product: ProductResponse): boolean {
  const sellerIds = new Set<string>();
  if (Array.isArray(product.offers)) {
    for (const offer of product.offers as any[]) {
      const merchantId = String(offer?.merchant_id || '').trim();
      if (merchantId) sellerIds.add(merchantId);
    }
  }
  return sellerIds.size > 1 || Number(product.offers_count || 0) > 1;
}

function pickOfferSavingsSource(product: ProductResponse): any | null {
  const offers = Array.isArray(product.offers) ? product.offers.filter(Boolean) : [];
  return offers.find(
    (offer: any) =>
      hasEvidenceOffers(offer?.store_discount_evidence) ||
      hasEvidenceOffers(offer?.payment_offer_evidence),
  ) || null;
}

function StarRating({ rating, count }: { rating: number; count?: number }) {
  const stars = Math.round(Math.min(Math.max(rating, 0), 5));
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className="h-2.5 w-2.5"
          fill={i < stars ? '#EF9F27' : 'none'}
          stroke={i < stars ? '#EF9F27' : '#D1D5DB'}
          strokeWidth={1.5}
        />
      ))}
      {count ? (
        <span className="ml-1 text-[10px] text-[#2C2C2A]/40">({count})</span>
      ) : null}
    </div>
  );
}

function ChatRecommendationCardComponent({ product, onAddToCart, colorVariant = 'coral' }: Props) {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const resolvedImage = normalizeDisplayImageUrl(product.image_url, '/placeholder.svg');
  const [imageSrc, setImageSrc] = useState(resolvedImage);
  const lastTouchTsRef = useRef(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchMovedRef = useRef(false);
  const isNavigatingRef = useRef(false);
  const resetTimerRef = useRef<number | null>(null);

  const href = buildProductHrefForProduct(product);
  const multipleSellerOffers = hasMultipleSellerOffers(product);
  const offerSavingsSource = pickOfferSavingsSource(product);
  const storeDiscountEvidence =
    offerSavingsSource?.store_discount_evidence ||
    (!multipleSellerOffers ? product.store_discount_evidence : undefined);
  const paymentOfferEvidence =
    offerSavingsSource?.payment_offer_evidence ||
    (!multipleSellerOffers ? product.payment_offer_evidence : undefined);
  const paymentPricing =
    offerSavingsSource?.payment_pricing ||
    (!multipleSellerOffers ? product.payment_pricing : undefined);
  const savingsBadges = getSummaryBadges(
    buildSavingsPresentation({
      product: product as any,
      offer: offerSavingsSource,
      store_discount_evidence: storeDiscountEvidence,
      payment_offer_evidence: paymentOfferEvidence,
      payment_pricing: paymentPricing,
      pricing: { total: product.price, currency: product.currency },
      currency: product.currency,
    }),
    2,
  );

  const rating = Number((product as any).rating ?? product.review_summary?.rating ?? product.review_summary?.average_rating);
  const reviewCount = Number((product as any).review_count ?? product.review_summary?.review_count ?? product.review_summary?.count);
  const hasRating = Number.isFinite(rating) && rating > 0;
  const recommendationReason = String(
    product.recommendation_reason ||
      product.match_reason ||
      product.card_highlight ||
      product.search_card?.highlight_candidate ||
      product.shopping_card?.highlight ||
      '',
  ).trim();

  const colors = COLOR_MAP[colorVariant];

  const handleCardClick = () => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    setIsNavigating(true);
    showProductRouteLoading();
    if (typeof window !== 'undefined') {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = window.setTimeout(() => {
        isNavigatingRef.current = false;
        setIsNavigating(false);
        hideProductRouteLoading();
      }, 20000);
    }
    window.requestAnimationFrame(() => {
      router.push(appendCurrentPathAsReturn(href));
    });
  };

  useEffect(() => { setImageSrc(resolvedImage); }, [resolvedImage]);
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && resetTimerRef.current)
        window.clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handleTouchStart: React.TouchEventHandler<HTMLDivElement> = (e) => {
    const t = e.touches?.[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY };
    touchMovedRef.current = false;
  };
  const handleTouchMove: React.TouchEventHandler<HTMLDivElement> = (e) => {
    const start = touchStartRef.current;
    const t = e.touches?.[0];
    if (!start || !t) return;
    if (Math.abs(t.clientX - start.x) > 10 || Math.abs(t.clientY - start.y) > 10)
      touchMovedRef.current = true;
  };
  const handleTouchEnd: React.TouchEventHandler<HTMLDivElement> = () => {
    if (touchMovedRef.current) return;
    lastTouchTsRef.current = Date.now();
    handleCardClick();
  };
  const handleClickSafe: React.MouseEventHandler<HTMLDivElement> = () => {
    if (Date.now() - lastTouchTsRef.current < 900) return;
    handleCardClick();
  };

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-xl border border-[rgba(44,44,42,0.08)] bg-white transition-all duration-200 ${
        isNavigating ? 'pointer-events-none opacity-75' : 'cursor-pointer active:scale-[0.98]'
      }`}
      style={{ borderWidth: '0.5px' }}
      role="button"
      tabIndex={0}
      aria-disabled={isNavigating}
      onClick={handleClickSafe}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(); }
      }}
    >
      {/* Image / color-block area */}
      <div className="relative aspect-square w-full" style={{ backgroundColor: colors.bg }}>
        <Image
          src={imageSrc}
          alt={product.title}
          fill
          sizes="(max-width: 768px) 160px, 200px"
          className="object-cover"
          unoptimized
          onError={() => { if (imageSrc !== '/placeholder.svg') setImageSrc('/placeholder.svg'); }}
        />

        {/* Recommended badge — top-left */}
        <span
          className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-semibold text-white"
          style={{ backgroundColor: '#534AB7' }}
        >
          Recommended
        </span>

        {/* Favorite button — top-right */}
        <button
          type="button"
          aria-label="Add to favorites"
          className="absolute right-2 top-2 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white shadow-sm transition-transform active:scale-90"
          onClick={(e) => { e.stopPropagation(); setIsFavorited((v) => !v); }}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <Heart
            className="h-3 w-3"
            fill={isFavorited ? '#D85A30' : 'none'}
            stroke={isFavorited ? '#D85A30' : '#2C2C2A'}
            strokeWidth={1.5}
          />
        </button>
      </div>

      {/* Content area */}
      <div className="flex flex-1 flex-col gap-0.5 p-2">
        {/* Title with inline brand prefix */}
        <p className="line-clamp-2 text-[12px] font-medium leading-[1.35] text-[#2C2C2A]">
          {product.brand ? <span className="text-[#2C2C2A]/40">{product.brand} · </span> : null}{product.title}
        </p>

        {recommendationReason ? (
          <p className="line-clamp-2 text-[10px] leading-[1.25] text-[#534AB7]">
            {recommendationReason}
          </p>
        ) : null}

        {/* Rating */}
        {hasRating ? (
          <StarRating rating={rating} count={Number.isFinite(reviewCount) && reviewCount > 0 ? reviewCount : undefined} />
        ) : null}

        {/* Price row */}
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-[15px] font-medium text-[#2C2C2A]">{formatPrice(product)}</span>
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap gap-1">
          {savingsBadges.map((badge) => (
            <span
              key={badge}
              className="rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-tight"
              style={{ backgroundColor: '#E1F5EE', color: '#1D9E75' }}
            >
              {badge}
            </span>
          ))}
          {!product.in_stock ? (
            <span
              className="rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-tight"
              style={{ backgroundColor: '#FAECE7', color: '#993C1D' }}
            >
              Low stock
            </span>
          ) : null}
        </div>

        {/* Add to cart — small purple circle, bottom-right */}
        <div className="flex justify-end">
          <button
            type="button"
            aria-label="Add to cart"
            className="flex h-7 w-7 items-center justify-center rounded-full text-white transition-opacity active:opacity-75"
            style={{ backgroundColor: '#534AB7' }}
            onClick={(e) => { e.stopPropagation(); onAddToCart(product); }}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <ShoppingCart className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export const ChatRecommendationCard = memo(ChatRecommendationCardComponent);
ChatRecommendationCard.displayName = 'ChatRecommendationCard';
