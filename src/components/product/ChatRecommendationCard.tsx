'use client';

import { useRef } from 'react';
import { ShoppingCart } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

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

export function ChatRecommendationCard({ product, onAddToCart }: Props) {
  const router = useRouter();
  const lastTouchTsRef = useRef(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchMovedRef = useRef(false);

  const href = product.merchant_id
    ? `/products/${encodeURIComponent(product.product_id)}?merchant_id=${encodeURIComponent(product.merchant_id)}`
    : `/products/${encodeURIComponent(product.product_id)}`;

  const handleCardClick = () => {
    router.push(href);
  };

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
      className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-white shadow-[0_14px_34px_rgba(63,49,37,0.12)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_54px_rgba(63,49,37,0.16)]"
      role="button"
      tabIndex={0}
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
      <div className="relative aspect-[4/5] w-full bg-[#f5e3d4]">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.title}
            fill
            sizes="220px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            unoptimized
          />
        ) : null}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddToCart(product);
          }}
          onTouchEnd={(e) => e.stopPropagation()}
          className="absolute bottom-2 right-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f6b59b] text-[#3f3125] shadow-sm hover:bg-[#f29b7f]"
          aria-label="Add to cart"
        >
          <ShoppingCart className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 flex-col px-3 pb-3 pt-3">
        <div className="line-clamp-2 text-[12px] font-semibold text-[#3f3125]">
          {product.title}
        </div>
        {product.category ? (
          <div className="mt-1 line-clamp-1 text-[10px] text-[#a38b78]">
            {product.category}
          </div>
        ) : null}
        <div className="mt-2 text-sm font-semibold text-[#3f3125]">
          {formatPrice(product)}
        </div>
      </div>
    </div>
  );
}

