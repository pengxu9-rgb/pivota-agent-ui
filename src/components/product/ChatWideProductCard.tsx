'use client';

import { useRef, useState, useEffect } from 'react';
import { Heart, ShoppingCart } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { normalizeDisplayImageUrl } from '@/lib/displayImage';
import { hideProductRouteLoading, showProductRouteLoading } from '@/lib/productRouteLoading';
import { buildProductHref } from '@/lib/productHref';
import { appendCurrentPathAsReturn } from '@/lib/returnUrl';
import { buildSavingsPresentation, getSummaryBadges } from '@/lib/savingsPresentation';
import type { ProductResponse } from '@/lib/api';
import type { CardColorVariant } from './ChatRecommendationCard';

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

function pickOfferSavingsSource(product: ProductResponse): any | null {
  const offers = Array.isArray(product.offers) ? product.offers.filter(Boolean) : [];
  return offers.find(
    (offer: any) =>
      Boolean(offer?.store_discount_evidence?.offers?.length) ||
      Boolean(offer?.payment_offer_evidence?.offers?.length),
  ) || null;
}

export function ChatWideProductCard({ product, onAddToCart, colorVariant = 'teal' }: Props) {
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

  const href = buildProductHref(product.product_id, product.merchant_id);
  const offerSavingsSource = pickOfferSavingsSource(product);
  const savingsBadges = getSummaryBadges(
    buildSavingsPresentation({
      product: product as any,
      offer: offerSavingsSource,
      store_discount_evidence: offerSavingsSource?.store_discount_evidence ?? product.store_discount_evidence,
      payment_offer_evidence: offerSavingsSource?.payment_offer_evidence ?? product.payment_offer_evidence,
      payment_pricing: offerSavingsSource?.payment_pricing ?? product.payment_pricing,
      pricing: { total: product.price, currency: product.currency },
      currency: product.currency,
    }),
    1,
  );

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
    window.requestAnimationFrame(() => router.push(appendCurrentPathAsReturn(href)));
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
      className={`group flex items-center gap-3 overflow-hidden rounded-xl border bg-white p-2 transition-all duration-200 ${
        isNavigating ? 'pointer-events-none opacity-75' : 'cursor-pointer active:scale-[0.98]'
      }`}
      style={{ borderWidth: '0.5px', borderColor: 'rgba(44,44,42,0.08)' }}
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
      {/* 68px square color-block image */}
      <div
        className="relative h-[68px] w-[68px] flex-shrink-0 overflow-hidden rounded-lg"
        style={{ backgroundColor: colors.bg }}
      >
        <Image
          src={imageSrc}
          alt={product.title}
          fill
          sizes="68px"
          className="object-cover"
          unoptimized
          onError={() => { if (imageSrc !== '/placeholder.svg') setImageSrc('/placeholder.svg'); }}
        />
      </div>

      {/* Text block */}
      <div className="min-w-0 flex-1">
        {product.brand ? (
          <p className="truncate text-[10px] text-[#2C2C2A]/40">{product.brand}</p>
        ) : null}
        <p className="line-clamp-2 text-[12px] font-medium leading-[1.35] text-[#2C2C2A]">
          {product.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span className="text-[13px] font-medium text-[#2C2C2A]">{formatPrice(product)}</span>
          {savingsBadges.map((badge) => (
            <span
              key={badge}
              className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
              style={{ backgroundColor: '#E1F5EE', color: '#1D9E75' }}
            >
              {badge}
            </span>
          ))}
          {!product.in_stock ? (
            <span
              className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
              style={{ backgroundColor: '#FAECE7', color: '#993C1D' }}
            >
              Low stock
            </span>
          ) : null}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-shrink-0 flex-col items-center gap-1.5">
        <button
          type="button"
          aria-label="Add to favorites"
          className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[rgba(44,44,42,0.04)] transition-opacity active:opacity-60"
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
  );
}
