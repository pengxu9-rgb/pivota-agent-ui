'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';
import { ArrowUpRight, LoaderCircle, ShoppingBag, Star } from 'lucide-react';
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

function buildRecommendationGridKey(item: RecommendationsData['items'][number]): string {
  return `${item.merchant_id || ''}:${item.product_id}`;
}

function isVariantCountBadge(value: string | null | undefined): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return /^\d+\s+(options|sizes|shades)$/.test(normalized);
}

export function RecommendationsGrid({
  data,
  visibleCount,
  statusNoteTitle,
  statusNote,
  onItemClick,
  onQuickAction,
  quickActionState,
}: {
  data: RecommendationsData;
  visibleCount?: number;
  statusNoteTitle?: string | null;
  statusNote?: string | null;
  onItemClick?: (item: RecommendationsData['items'][number], index: number) => void;
  onQuickAction?: (item: RecommendationsData['items'][number], index: number) => void;
  quickActionState?: Record<string, { label: 'Buy' | 'Open'; loading?: boolean }>;
}) {
  const router = useRouter();
  if (!data.items.length) return null;
  const resolvedVisibleCount = Number.isFinite(visibleCount as number)
    ? Math.max(0, Math.floor(visibleCount as number))
    : data.items.length;
  const visibleItems = data.items.slice(0, resolvedVisibleCount);
  return (
    <div className="py-6">
      <div className="mb-3 flex items-center justify-between px-3.5 sm:px-4">
        <h3 className="text-sm font-semibold">You May Also Like</h3>
      </div>
      <div className="grid grid-cols-2 gap-3 px-3.5 sm:px-4 lg:grid-cols-4">
        {visibleItems.map((p, idx) => {
          const card = resolveProductCardPresentation(p as any, {
            allowDescriptionAlongsideSubtitle: false,
            suppressGenericReasonBadges: true,
          });
          const itemKey = buildRecommendationGridKey(p);
          const actionState = quickActionState?.[itemKey];
          const badge = isVariantCountBadge(card.badge) ? null : card.badge;
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
            <div
              key={itemKey}
              className="overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md"
            >
              <Link
                href={baseHref}
                prefetch={false}
                className="block"
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
                <div className="p-3 pb-2">
                  <div className="min-h-[2.5rem] text-sm font-medium line-clamp-2">{p.title}</div>
                  {badge ? (
                    <div className="mt-2">
                      <span className="inline-flex rounded-full bg-muted px-2 py-1 text-[10px] font-semibold tracking-[-0.01em] text-foreground/80">
                        {badge}
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
                </div>
              </Link>
              <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-1">
                <div className="min-w-0 flex-1 text-sm font-bold">
                  {p.price ? formatPrice(p.price.amount, p.price.currency) : '\u00A0'}
                </div>
                {onQuickAction ? (
                  <button
                    type="button"
                    aria-label={`${actionState?.label || 'Buy'} ${p.title}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onQuickAction(p, idx);
                    }}
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2.5 text-[11px] font-semibold text-foreground transition-colors hover:border-foreground/20 hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={Boolean(actionState?.loading)}
                  >
                    {actionState?.loading ? (
                      <LoaderCircle className="h-3 w-3 animate-spin" />
                    ) : actionState?.label === 'Open' ? (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    ) : (
                      <ShoppingBag className="h-3.5 w-3.5" />
                    )}
                    <span>{actionState?.label || 'Buy'}</span>
                  </button>
                ) : null}
              </div>
            </div>
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
