'use client';

import Link from 'next/link';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Star, X } from 'lucide-react';
import type { RecommendationsData } from '@/features/pdp/types';
import { optimizeRecommendationImageUrl } from '@/features/pdp/sections/RecommendationsGrid';

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
  isLoadingMore = false,
  canLoadMore = false,
  onLoadMore,
  onItemClick,
}: {
  open: boolean;
  onClose: () => void;
  items: RecommendationsData['items'];
  isLoadingMore?: boolean;
  canLoadMore?: boolean;
  onLoadMore?: () => void;
  onItemClick?: (item: RecommendationsData['items'][number], index: number) => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="fixed inset-0 z-[2147483647] bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[2147483647] h-[80vh] rounded-t-2xl bg-card border border-border shadow-2xl overflow-hidden flex flex-col"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold">All recommendations ({items.length})</h3>
              <button
                onClick={onClose}
                className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-secondary transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 [-webkit-overflow-scrolling:touch]">
              {items.length ? (
                <div className="grid grid-cols-2 gap-3">
                  {items.map((p, idx) => (
                    <Link
                      key={`${p.merchant_id || 'unknown'}:${p.product_id}:${idx}`}
                      href={`/products/${encodeURIComponent(p.product_id)}${p.merchant_id ? `?merchant_id=${encodeURIComponent(p.merchant_id)}` : ''}`}
                      prefetch={false}
                      className="rounded-xl bg-card border border-border overflow-hidden hover:shadow-md transition-shadow"
                      onClick={() => onItemClick?.(p, idx)}
                    >
                      <div className="relative aspect-square bg-muted">
                        {p.image_url ? (
                          <Image
                            src={optimizeRecommendationImageUrl(p.image_url)}
                            alt={p.title}
                            fill
                            className="object-cover"
                            sizes="(max-width: 640px) 45vw, 220px"
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
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-background/60 px-4 py-6 text-sm text-muted-foreground">
                  No similar products yet.
                </div>
              )}
            </div>

            {onLoadMore && (canLoadMore || isLoadingMore) ? (
              <div className="border-t border-border px-4 py-3">
                <button
                  type="button"
                  onClick={onLoadMore}
                  disabled={isLoadingMore}
                  className="w-full rounded-xl border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1"
                >
                  {isLoadingMore ? 'Loading more…' : 'Load more recommendations'}
                  {!isLoadingMore ? <ChevronRight className="h-4 w-4" /> : null}
                </button>
              </div>
            ) : null}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
