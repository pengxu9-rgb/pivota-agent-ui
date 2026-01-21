import Link from 'next/link';
import Image from 'next/image';
import { Star, ChevronRight } from 'lucide-react';
import type { RecommendationsData } from '@/features/pdp/types';

function formatPrice(amount: number, currency: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  const c = currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export function RecommendationsGrid({ data }: { data: RecommendationsData }) {
  if (!data.items.length) return null;
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold">You may also like</h3>
        <button className="text-[11px] text-muted-foreground flex items-center gap-1 hover:text-foreground">
          View all <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {data.items.slice(0, 6).map((p) => (
          <Link
            key={p.product_id}
            href={`/products/${encodeURIComponent(p.product_id)}${p.merchant_id ? `?merchant_id=${encodeURIComponent(p.merchant_id)}` : ''}`}
            className="rounded-2xl bg-card border border-border overflow-hidden hover:shadow-glass-hover transition-shadow"
          >
            <div className="relative aspect-square bg-black/5">
              {p.image_url ? (
                <Image src={p.image_url} alt={p.title} fill className="object-cover" unoptimized />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                  No image
                </div>
              )}
            </div>
            <div className="p-2.5">
              <div className="text-xs font-medium line-clamp-2 min-h-[2.25rem]">{p.title}</div>
              {p.rating ? (
                <div className="flex items-center gap-1 mt-1.5 text-[11px]">
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  <span>{p.rating.toFixed(1)}</span>
                  {p.review_count ? (
                    <span className="text-muted-foreground">({p.review_count})</span>
                  ) : null}
                </div>
              ) : null}
              {p.price ? (
                <div className="mt-1.5 text-xs font-semibold">
                  {formatPrice(p.price.amount, p.price.currency)}
                </div>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
      <button className="w-full mt-3 py-2 text-xs text-muted-foreground hover:text-foreground">
        Load more recommendations
      </button>
    </div>
  );
}
