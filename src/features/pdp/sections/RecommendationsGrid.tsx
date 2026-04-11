'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';
import { Star, ChevronRight } from 'lucide-react';
import type { RecommendationsData } from '@/features/pdp/types';
import { optimizePdpImageUrl } from '@/features/pdp/utils/pdpImageUrls';
import { buildProductHref } from '@/lib/productHref';
import { resolveProductCardPresentation } from '@/lib/productCardPresentation';
import { appendCurrentPathAsReturn } from '@/lib/returnUrl';

function formatPrice(amount: number, currency: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  const c = currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}


export function optimizeRecommendationImageUrl(rawUrl: string, width = 480): string {
  return optimizePdpImageUrl(rawUrl, width);
}

export function RecommendationsGrid({
  data,
  visibleCount,
  canLoadMore = false,
  isLoadingMore = false,
  statusNoteTitle,
  statusNote,
  onLoadMore,
  onItemClick,
  onOpenAll,
}: {
  data: RecommendationsData;
  visibleCount?: number;
  canLoadMore?: boolean;
  isLoadingMore?: boolean;
  statusNoteTitle?: string | null;
  statusNote?: string | null;
  onLoadMore?: () => void;
  onItemClick?: (item: RecommendationsData['items'][number], index: number) => void;
  onOpenAll?: () => void;
}) {
  const router = useRouter();
  if (!data.items.length) return null;
  const resolvedVisibleCount = Number.isFinite(visibleCount as number)
    ? Math.max(0, Math.floor(visibleCount as number))
    : data.items.length;
  const visibleItems = data.items.slice(0, resolvedVisibleCount);
  const showLoadMore = Boolean(onLoadMore) && (canLoadMore || isLoadingMore);
  return (
    <div className="py-6">
      <div className="mb-3 flex items-center justify-between px-3.5 sm:px-4">
        <h3 className="text-sm font-semibold">You May Also Like</h3>
        {onOpenAll ? (
          <button
            type="button"
            onClick={onOpenAll}
            className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground"
          >
            View all similar <ChevronRight className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3 px-3.5 sm:px-4 lg:grid-cols-4">
        {visibleItems.map((p, idx) => {
          const card = resolveProductCardPresentation(p as any, {
            allowDescriptionAlongsideSubtitle: true,
            suppressGenericReasonBadges: true,
          });
          const subtitle = card.subtitle;
          const highlight = card.highlight;
          const baseHref = buildProductHref(p.product_id, p.merchant_id);
          const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
            onItemClick?.(p, idx);
            if (event.defaultPrevented) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            event.preventDefault();
            router.push(appendCurrentPathAsReturn(baseHref));
          };
          return (
            <Link
              key={`${p.merchant_id || 'unknown'}:${p.product_id}:${idx}`}
              href={baseHref}
              prefetch={false}
              className="rounded-xl bg-card border border-border overflow-hidden hover:shadow-md transition-shadow"
              onClick={handleClick}
            >
              <div className="relative aspect-square bg-muted">
                {p.image_url ? (
                  <Image
                    src={optimizeRecommendationImageUrl(p.image_url)}
                    alt={p.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 250px"
                    loading={idx < 2 ? 'eager' : 'lazy'}
                    fetchPriority={idx < 2 ? 'high' : 'auto'}
                    quality={idx < 2 ? 72 : 65}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                    No image
                  </div>
                )}
              </div>
              <div className="p-3">
                <div className="text-sm font-medium line-clamp-2 min-h-[2.5rem]">{p.title}</div>
                {card.badge ? (
                  <div className="mt-2">
                    <span className="inline-flex rounded-full bg-muted px-2 py-1 text-[10px] font-semibold tracking-[-0.01em] text-foreground/80">
                      {card.badge}
                    </span>
                  </div>
                ) : p.rating ? (
                  <div className="mt-2 flex items-center gap-1">
                    <Star className="h-3 w-3 fill-gold text-gold" />
                    <span className="text-xs">{p.rating.toFixed(1)}</span>
                    {p.review_count ? (
                      <span className="text-xs text-muted-foreground">({p.review_count})</span>
                    ) : null}
                  </div>
                ) : null}
                {subtitle ? (
                  <p className="mt-2 line-clamp-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/85">
                    {subtitle}
                  </p>
                ) : null}
                {highlight ? (
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                    {highlight}
                  </p>
                ) : null}
                {p.price ? (
                  <div className="mt-2.5 text-sm font-bold">
                    {formatPrice(p.price.amount, p.price.currency)}
                  </div>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
      {statusNote ? (
        <div className="mt-3 px-3.5 sm:px-4">
          <div className="rounded-xl border border-border bg-background/70 px-3 py-3">
            {statusNoteTitle ? (
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/80">
                {statusNoteTitle}
              </div>
            ) : null}
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              {statusNote}
            </div>
          </div>
        </div>
      ) : null}
      {showLoadMore ? (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isLoadingMore}
          className="w-full mt-4 py-3 text-sm text-muted-foreground hover:text-foreground disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isLoadingMore ? 'Loading more…' : 'Load more similar products'}
        </button>
      ) : null}
    </div>
  );
}

export function RecommendationsSkeleton() {
  return (
    <div className="py-6">
      <div className="mb-3 flex items-center justify-between px-3.5 sm:px-4">
        <div className="h-4 w-32 rounded bg-muted/30 animate-pulse" />
        <div className="h-3 w-12 rounded bg-muted/20 animate-pulse" />
      </div>
      <div className="grid grid-cols-2 gap-3 px-3.5 sm:px-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div
            key={idx}
            className="rounded-xl bg-card border border-border overflow-hidden"
          >
            <div className="aspect-square bg-muted/25 animate-pulse" />
            <div className="p-3 space-y-2">
              <div className="h-3 w-full rounded bg-muted/25 animate-pulse" />
              <div className="h-3 w-3/4 rounded bg-muted/20 animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-muted/20 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
