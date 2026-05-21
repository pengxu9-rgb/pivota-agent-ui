'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';
import type { BundleCompositionData, BundleCompositionItem } from '@/features/pdp/types';
import {
  optimizePdpImageUrl,
  shouldBypassNextImageOptimizer,
} from '@/features/pdp/utils/pdpImageUrls';
import { buildProductHrefForProduct } from '@/lib/productHref';
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

function bundleItemKey(item: BundleCompositionItem): string {
  return `${item.merchant_id || ''}:${item.product_id}`;
}

export function BundleCompositionGrid({
  data,
  onItemClick,
  heading = "What's in the set",
}: {
  data: BundleCompositionData;
  onItemClick?: (item: BundleCompositionItem, index: number) => void;
  heading?: string;
}) {
  const router = useRouter();
  const items = Array.isArray(data?.items) ? data.items : [];
  if (!items.length) return null;
  return (
    <div className="py-6">
      <div className="mb-3 flex items-center justify-between px-3.5 sm:px-4">
        <h3 className="text-sm font-semibold">{heading}</h3>
        <span className="text-[11px] text-muted-foreground">
          {items.length} item{items.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 px-3.5 sm:px-4 lg:grid-cols-4">
        {items.map((item, idx) => {
          const itemKey = bundleItemKey(item);
          const brandLabel = item.brand?.name;
          const sizeLabel = item.size_label || null;
          const roleLabel = item.component_role || null;
          const hrefSource = {
            product_id: item.product_id,
            merchant_id: item.merchant_id,
            canonical_url: item.canonical_url,
          };
          const baseHref = buildProductHrefForProduct(hrefSource as any);
          const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
            onItemClick?.(item, idx);
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
                  {item.image_url ? (
                    <Image
                      src={optimizePdpImageUrl(item.image_url, 480)}
                      alt={item.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 250px"
                      loading={idx < 2 ? 'eager' : 'lazy'}
                      fetchPriority={idx < 2 ? 'high' : 'auto'}
                      quality={idx < 2 ? 72 : 65}
                      unoptimized={shouldBypassNextImageOptimizer(item.image_url)}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                      No image
                    </div>
                  )}
                </div>
                <div className="p-3 pb-2">
                  {brandLabel ? (
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/85 line-clamp-1">
                      {brandLabel}
                    </div>
                  ) : null}
                  <div className="mt-1 min-h-[2.5rem] text-sm font-medium line-clamp-2">
                    {item.title}
                  </div>
                  {sizeLabel || roleLabel ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {sizeLabel ? (
                        <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tracking-[-0.01em] text-foreground/80">
                          {sizeLabel}
                        </span>
                      ) : null}
                      {roleLabel ? (
                        <span className="inline-flex rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium tracking-[-0.01em] text-muted-foreground">
                          {roleLabel}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </Link>
              {item.price ? (
                <div className="px-3 pb-3 pt-1 text-sm font-bold">
                  {formatPrice(item.price.amount, item.price.currency)}
                </div>
              ) : (
                <div className="px-3 pb-3 pt-1 text-sm text-muted-foreground/60">&nbsp;</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BundleCompositionSkeleton() {
  return (
    <div className="py-6">
      <div className="mb-3 flex items-center justify-between px-3.5 sm:px-4">
        <div className="h-4 w-32 rounded bg-muted/30 animate-pulse" />
        <div className="h-3 w-12 rounded bg-muted/20 animate-pulse" />
      </div>
      <div className="grid grid-cols-2 gap-3 px-3.5 sm:px-4 lg:grid-cols-4">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div
            key={idx}
            className="rounded-xl bg-card border border-border overflow-hidden"
          >
            <div className="aspect-square bg-muted/25 animate-pulse" />
            <div className="p-3 space-y-2">
              <div className="h-2.5 w-1/3 rounded bg-muted/25 animate-pulse" />
              <div className="h-3 w-full rounded bg-muted/25 animate-pulse" />
              <div className="h-3 w-3/4 rounded bg-muted/20 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
