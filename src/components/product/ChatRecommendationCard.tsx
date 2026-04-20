'use client';

import { useEffect, useRef, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { hideProductRouteLoading, showProductRouteLoading } from '@/lib/productRouteLoading';
import { buildProductHref } from '@/lib/productHref';
import { appendCurrentPathAsReturn } from '@/lib/returnUrl';
import { buildSavingsPresentation, getSummaryBadges } from '@/lib/savingsPresentation';

import type { ProductResponse } from '@/lib/api';

type Props = {
  product: ProductResponse;
  onAddToCart: (product: ProductResponse) => void;
};

function formatPrice(product: ProductResponse): string {
  const currency = String(product.currency || '').trim();
  const price = typeof product.price === 'number' && Number.isFinite(product.price) ? product.price : 0;
  if (currency) return `${currency} ${price.toFixed(2)}`;
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

export function ChatRecommendationCard({ product, onAddToCart }: Props) {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const [imageSrc, setImageSrc] = useState(product.image_url || '/placeholder.svg');
  const lastTouchTsRef = useRef(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchMovedRef = useRef(false);
  const isNavigatingRef = useRef(false);
  const resetTimerRef = useRef<number | null>(null);

  const href = buildProductHref(product.product_id, product.merchant_id);
  const compactCopy = String(product.card_highlight || product.card_subtitle || '').trim();
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

  const handleCardClick = () => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    setIsNavigating(true);
    showProductRouteLoading();
    if (typeof window !== 'undefined') {
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = window.setTimeout(() => {
        isNavigatingRef.current = false;
        setIsNavigating(false);
        hideProductRouteLoading();
      }, 20000);
    }
    if (typeof window === 'undefined') {
      router.push(href);
      return;
    }
    window.requestAnimationFrame(() => {
      router.push(appendCurrentPathAsReturn(href));
    });
  };

  useEffect(() => {
    setImageSrc(product.image_url || '/placeholder.svg');
  }, [product.image_url]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const handleCardTouchStart: React.TouchEventHandler<HTMLDivElement> = (e) => {
    const t = e.touches?.[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY };
    touchMovedRef.current = false;
  };

  const handleCardTouchMove: React.TouchEventHandler<HTMLDivElement> = (e) => {
    const start = touchStartRef.current;
    const t = e.touches?.[0];
    if (!start || !t) return;
    const dx = Math.abs(t.clientX - start.x);
    const dy = Math.abs(t.clientY - start.y);
    if (dx > 10 || dy > 10) touchMovedRef.current = true;
  };

  const handleCardTouchEnd: React.TouchEventHandler<HTMLDivElement> = () => {
    if (touchMovedRef.current) return;
    lastTouchTsRef.current = Date.now();
    handleCardClick();
  };

  const handleCardClickSafe: React.MouseEventHandler<HTMLDivElement> = () => {
    if (Date.now() - lastTouchTsRef.current < 900) return;
    handleCardClick();
  };

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card/50 backdrop-blur-xl shadow-glass transition-all duration-300 ${
        isNavigating ? 'pointer-events-none opacity-80' : 'cursor-pointer hover:-translate-y-1 hover:shadow-glass-hover'
      }`}
      role="button"
      tabIndex={0}
      aria-disabled={isNavigating}
      onClick={handleCardClickSafe}
      onTouchStart={handleCardTouchStart}
      onTouchMove={handleCardTouchMove}
      onTouchEnd={handleCardTouchEnd}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
    >
      <div className="relative aspect-[4/5] w-full bg-muted/30">
        <Image
          src={imageSrc}
          alt={product.title}
          fill
          sizes="(max-width: 768px) 250px, 280px"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          unoptimized
          onError={() => {
            if (imageSrc !== '/placeholder.svg') setImageSrc('/placeholder.svg');
          }}
        />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddToCart(product);
          }}
          onTouchEnd={(e) => e.stopPropagation()}
          className="absolute bottom-2 right-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500 text-white shadow-glow transition hover:brightness-110"
          aria-label="Add to cart"
        >
          <ShoppingCart className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 flex-col px-3 pb-3 pt-3">
        <div className="line-clamp-2 text-[12px] font-semibold text-foreground group-hover:text-primary transition-colors">
          {product.title}
        </div>
        {compactCopy ? (
          <div className="mt-1 line-clamp-1 text-[10px] text-muted-foreground">
            {compactCopy}
          </div>
        ) : product.category ? (
          <div className="mt-1 line-clamp-1 text-[10px] text-muted-foreground">
            {product.category}
          </div>
        ) : null}
        <div className="mt-2 text-sm font-semibold text-primary">
          {formatPrice(product)}
        </div>
        {savingsBadges.length ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {savingsBadges.map((badge) => (
              <span
                key={badge}
                className="rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-emerald-800"
              >
                {badge}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
