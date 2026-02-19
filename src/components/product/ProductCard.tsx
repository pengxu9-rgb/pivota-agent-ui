'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/store/cartStore';
import { toast } from 'sonner';

interface ProductCardProps {
  product_id: string;
  merchant_id?: string;
  merchant_name?: string;
  variant_id?: string;
  sku?: string;
  external_redirect_url?: string;
  title: string;
  price: number;
  currency?: string;
  image: string;
  description?: string;
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
  price,
  currency,
  image,
  description,
  onBuy,
  onAddToCart,
}: ProductCardProps) {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const { addItem } = useCartStore();
  const isExternal = Boolean(external_redirect_url);

  const href = merchant_id
    ? `/products/${product_id}?merchant_id=${encodeURIComponent(merchant_id)}`
    : `/products/${product_id}`;

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
        price,
        currency,
        imageUrl: image,
        merchant_id,
        quantity: 1,
      });
      toast.success(`✓ Added to cart! ${title}`);
    }
  };

  const handleViewDetails = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(href);
  };

  const handleBuyNow = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onBuy) {
      onBuy();
    }
  };

  const handleCardNavigate = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isNavigating) {
      e.preventDefault();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    setIsNavigating(true);
    if (typeof window === 'undefined') {
      router.push(href);
      return;
    }
    window.requestAnimationFrame(() => {
      router.push(href);
    });
  };

  return (
    <Link
      href={href}
      onClick={handleCardNavigate}
    >
      <GlassCard className="relative p-0 overflow-hidden group hover:shadow-glass-hover transition-all duration-300 hover:scale-[1.02]">
        <div className="relative aspect-[3/4] overflow-hidden bg-muted/30">
          <Image
            src={image}
            alt={title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            unoptimized
          />
        </div>

        <div className="p-3 space-y-2">
          <h3 className="font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors">
            {title}
          </h3>

          {merchant_name && (
            <p className="text-xs text-muted-foreground line-clamp-1">
              {merchant_name}
            </p>
          )}

          {description && (
            <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
          )}

          <div className="text-lg font-bold text-primary">${price.toFixed(2)}</div>

          <div className="flex gap-2">
            {isExternal ? (
              <Button
                variant="gradient"
                size="sm"
                onClick={handleViewDetails}
                className="flex-1"
              >
                View details
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddToCart}
                  className="flex-1"
                >
                  Add to Cart
                </Button>
                {onBuy && (
                  <Button
                    variant="gradient"
                    size="sm"
                    onClick={handleBuyNow}
                    className="flex-1"
                  >
                    Buy Now
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
        {isNavigating ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-[1px]">
            <span className="rounded-full bg-background/90 px-3 py-1 text-xs font-medium text-foreground shadow-sm">
              Loading product...
            </span>
          </div>
        ) : null}
      </GlassCard>
    </Link>
  );
}
