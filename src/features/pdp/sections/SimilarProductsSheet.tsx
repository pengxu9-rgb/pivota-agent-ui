'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';
import { ChevronRight, Star } from 'lucide-react';
import type { RecommendationsData } from '@/features/pdp/types';
import { optimizeRecommendationImageUrl } from '@/features/pdp/sections/RecommendationsGrid';
import { buildProductHref } from '@/lib/productHref';
import { appendCurrentPathAsReturn } from '@/lib/returnUrl';
import { ResponsiveSheet } from '@/features/pdp/components/ResponsiveSheet';

function formatPrice(amount: number, currency: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  const c = currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export function SimilarProductsSheet({
  open,
  onClose,
  items,
  statusNoteTitle,
  statusNote,
  isLoadingMore = false,
  canLoadMore = false,
  onLoadMore,
  onItemClick,
}: {
  open: boolean;
  onClose: () => void;
  items: RecommendationsData['items'];
  statusNoteTitle?: string | null;
  statusNote?: string | null;
  isLoadingMore?: boolean;
  canLoadMore?: boolean;
  onLoadMore?: () => void;
  onItemClick?: (item: RecommendationsData['items'][number], index: number) => void;
}) {
  const router = useRouter();
  const loadMoreFooter = onLoadMore && (canLoadMore || isLoadingMore) ? (
    <div className="border-t border-border px-4 py-3">
      <button
        type="button"
        onClick={onLoadMore}
        disabled={isLoadingMore}
        className="w-full rounded-xl border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1"
      >
        {isLoadingMore ? 'Loading more…' : 'Load more similar products'}
        {!isLoadingMore ? <ChevronRight className="h-4 w-4" /> : null}
      </button>
    </div>
  ) : null;

  return (
    <ResponsiveSheet
      open={open}
      onClose={onClose}
      title={`All similar products (${items.length})`}
      mobileHeight="h-[80vh]"
      footer={loadMoreFooter}
    >
      <div className="px-4 py-4">
        {statusNote ? (
          <div className="mb-4 rounded-xl border border-border bg-background/70 px-3 py-3">
            {statusNoteTitle ? (
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/80">
                {statusNoteTitle}
              </div>
            ) : null}
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              {statusNote}
            </div>
          </div>
        ) : null}
        {items.length ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((p, idx) => {
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
                        sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 180px"
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
                    {p.rating ? (
                      <div className="flex items-center gap-1 mt-2">
                        <Star className="h-3 w-3 fill-gold text-gold" />
                        <span className="text-xs">{p.rating.toFixed(1)}</span>
                        {p.review_count ? (
                          <span className="text-xs text-muted-foreground">({p.review_count})</span>
                        ) : null}
                      </div>
                    ) : null}
                    {p.price ? (
                      <div className="mt-2 text-sm font-bold">
                        {formatPrice(p.price.amount, p.price.currency)}
                      </div>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-background/60 px-4 py-6 text-sm text-muted-foreground">
            No similar products yet.
          </div>
        )}
      </div>
    </ResponsiveSheet>
  );
}
