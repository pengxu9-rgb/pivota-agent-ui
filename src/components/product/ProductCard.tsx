'use client';

import { Star } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCartStore } from '@/store/cartStore';
import { toast } from 'sonner';

interface ProductCardProps {
  product_id: string;
  merchant_id?: string;
  title: string;
  price: number;
  image: string;
  description?: string;
  onBuy?: () => void;
  onAddToCart?: () => void;
}

export default function ProductCard({
  product_id,
  merchant_id,
  title,
  price,
  image,
  description,
  onBuy,
  onAddToCart,
}: ProductCardProps) {
  const { addItem } = useCartStore();

  const href = merchant_id
    ? `/products/${product_id}?merchant_id=${merchant_id}`
    : `/products/${product_id}`;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (onAddToCart) {
      onAddToCart();
    } else {
      addItem({
        id: product_id,
        title,
        price,
        imageUrl: image,
        merchant_id,
        quantity: 1,
      });
      toast.success(`✓ Added to cart! ${title}`);
    }
  };

  const handleBuyNow = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onBuy) {
      onBuy();
    }
  };

  return (
    <Link href={href}>
      <GlassCard className="p-0 overflow-hidden group hover:shadow-glass-hover transition-all duration-300 hover:scale-[1.02]">
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
          
          {description && (
            <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
          )}
          
          <div className="text-lg font-bold text-primary">${price.toFixed(2)}</div>
          
          <div className="flex gap-2">
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
          </div>
        </div>
      </GlassCard>
    </Link>
  );
}
