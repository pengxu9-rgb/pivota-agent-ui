'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { normalizeDisplayImageUrl } from '@/lib/displayImage';
import { useCartStore } from '@/store/cartStore';
import { hideProductRouteLoading, showProductRouteLoading } from '@/lib/productRouteLoading';
import { buildProductHref } from '@/lib/productHref';
import { appendCurrentPathAsReturn } from '@/lib/returnUrl';
import { toast } from 'sonner';

interface ProductCardProps {
  product_id: string;
  merchant_id?: string;
  merchant_name?: string;
  variant_id?: string;
  sku?: string;
  external_redirect_url?: string;
  title: string;
  subtitle?: string;
  badge?: string;
  price: number;
  currency?: string;
  image: string;
  description?: string;
  compact?: boolean;
  onBuy?: () => void;
  onAddToCart?: () => void;
}

export default function ProductCard({
  product_id,
  merchant_id,
  merchant_name,
  variant_id,
  sku,
  external_redirect_url,
  title,
  subtitle,
  badge,
  price,
  currency,
  image,
  description,
  compact = false,
  onBuy,
  onAddToCart,
}: ProductCardProps) {
  const router = useRouter();
  const resolvedImage = normalizeDisplayImageUrl(image, '/placeholder.svg');
  const [imageSrc, setImageSrc] = useState(resolvedImage);
  const [isNavigating, setIsNavigating] = useState(false);
  const isNavigatingRef = useRef(false);
  const resetTimerRef = useRef<number | null>(null);
  const { addItem } = useCartStore();
  const isExternal = Boolean(external_redirect_url);
  const displayPrice = Number(price);
  const hasValidDisplayPrice = Number.isFinite(displayPrice) && displayPrice > 0;

  const href = buildProductHref(product_id, merchant_id);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (onAddToCart) {
      onAddToCart();
    } else {
      const resolvedVariantId = String(variant_id || '').trim() || product_id;
      const cartItemId = merchant_id
        ? `${merchant_id}:${resolvedVariantId}`
        : resolvedVariantId;
      addItem({
        id: cartItemId,
        product_id,
        variant_id: resolvedVariantId,
        sku,
        title,
        price: displayPrice,
        currency,
        imageUrl: resolvedImage,
        merchant_id,
        quantity: 1,
      });
      toast.success(`✓ Added to cart! ${title}`);
    }
  };

  const handleViewDetails = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(appendCurrentPathAsReturn(href));
  };

  const handleBuyNow = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onBuy) {
      onBuy();
    }
  };

  const handleCardNavigate = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isNavigatingRef.current || isNavigating) {
      e.preventDefault();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    isNavigatingRef.current = true;
    setIsNavigating(true);
    showProductRouteLoading();
    if (typeof window !== 'undefined') {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = window.setTimeout(() => {
        isNavigatingRef.current = false;
        hideProductRouteLoading();
        setIsNavigating(false);
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
    setImageSrc(resolvedImage);
  }, [resolvedImage]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  if (!hasValidDisplayPrice) {
    console.error('ProductCard received a non-positive price and will not render', {
      product_id,
      merchant_id,
      price,
    });
    return null;
  }

  return (
    <Link
      href={href}
      prefetch={false}
      onClick={handleCardNavigate}
      className={isNavigating ? 'pointer-events-none' : ''}
      aria-disabled={isNavigating}
    >
      <GlassCard
        className={`relative overflow-hidden group transition-all duration-300 hover:scale-[1.02] hover:shadow-glass-hover ${
          compact ? 'h-full p-0' : 'p-0'
        }`}
      >
        <div
          className={`relative overflow-hidden bg-muted/30 ${
            compact ? 'aspect-square' : 'aspect-[3/4]'
          }`}
        >
          <Image
            src={imageSrc}
            alt={title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            unoptimized
            onError={() => {
              if (imageSrc !== '/placeholder.svg') setImageSrc('/placeholder.svg');
            }}
          />

          {badge ? (
            <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-1 text-[10px] font-semibold tracking-[-0.01em] text-slate-700 shadow-sm">
              {badge}
            </span>
          ) : null}
        </div>

        <div className={compact ? 'space-y-1.5 p-2.5' : 'space-y-2 p-3'}>
          <h3
            className={`font-medium line-clamp-2 transition-colors group-hover:text-primary ${
              compact ? 'text-xs leading-5' : 'text-sm'
            }`}
          >
            {title}
          </h3>

          {subtitle ? (
            <p className="text-xs text-muted-foreground line-clamp-1">{subtitle}</p>
          ) : null}

          {!subtitle && merchant_name && (
            <p className="text-xs text-muted-foreground line-clamp-1">
              {merchant_name}
            </p>
          )}

          {!compact && !subtitle && description && (
            <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
          )}

          <div className={compact ? 'text-base font-bold text-primary' : 'text-lg font-bold text-primary'}>
            ${displayPrice.toFixed(2)}
          </div>

          <div className="flex gap-2">
            {isExternal ? (
              <Button
                variant="gradient"
                size="sm"
                onClick={handleViewDetails}
                className={`flex-1 ${compact ? 'px-2 text-xs' : ''}`}
              >
                View details
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddToCart}
                  className={`flex-1 ${compact ? 'px-2 text-xs' : ''}`}
                >
                  Add to Cart
                </Button>
                {onBuy && (
                  <Button
                    variant="gradient"
                    size="sm"
                    onClick={handleBuyNow}
                    className={`flex-1 ${compact ? 'px-2 text-xs' : ''}`}
                  >
                    Buy Now
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </GlassCard>
    </Link>
  );
}
