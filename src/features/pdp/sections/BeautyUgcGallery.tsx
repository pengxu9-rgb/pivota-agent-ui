'use client';

/**
 * BeautyUgcGallery
 *
 * Customer-photos rail used in the structured-module beauty PDP. Two
 * behaviour changes vs the original:
 *
 *  1) Renders even when `items` is empty (drop the `showEmpty` short-circuit
 *     for the empty case) — so shoppers on a freshly-launched product can
 *     still add the first photo.
 *
 *  2) The first tile is always the "+ Add your photo" upload affordance,
 *     in front of any existing items. Clicking it fires `onCtaClick`, the
 *     same handler the old "Share yours +" text link used. No new prop.
 */

import Image from 'next/image';
import { Play, Plus } from 'lucide-react';
import type { MediaItem } from '@/features/pdp/types';
import { shouldBypassNextImageOptimizer } from '@/features/pdp/utils/pdpImageUrls';
import { cn } from '@/lib/utils';

export function BeautyUgcGallery({
  items,
  title = 'Customer Photos',
  ctaLabel = 'Add your photo',
  ctaEnabled = true,
  onCtaClick,
  onOpenAll,
  onItemClick,
}: {
  items: MediaItem[];
  title?: string;
  /** Label for the inline "+ Add your photo" upload tile. */
  ctaLabel?: string;
  ctaEnabled?: boolean;
  onCtaClick?: () => void;
  onOpenAll?: () => void;
  onItemClick?: (index: number, item: MediaItem) => void;
}) {
  // Section now renders unconditionally — even with zero items the "+ Add"
  // tile is shown so shoppers can contribute.
  const tiles = items?.slice(0, 8) ?? [];

  return (
    <div className="mt-2 px-2.5 sm:px-3 lg:mt-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">
          {title}
          {tiles.length ? ` (${items.length})` : ''}
        </h3>
        {items.length > 8 ? (
          <button
            type="button"
            onClick={onOpenAll}
            className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            View all
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-lg overflow-hidden">
        {/* Always-on "+ Add your photo" upload tile. */}
        <button
          type="button"
          onClick={onCtaClick}
          aria-disabled={!ctaEnabled}
          aria-label={ctaLabel}
          className={cn(
            'relative flex aspect-square flex-col items-center justify-center gap-1.5 rounded-md border-[1.5px] border-dashed border-primary bg-primary/10 p-2 text-primary transition-opacity',
            ctaEnabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
          )}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-primary bg-white text-primary">
            <Plus className="h-4 w-4" strokeWidth={2.5} />
          </span>
          <span className="text-center text-[11px] font-semibold leading-tight text-primary">
            {ctaLabel}
          </span>
        </button>
        {tiles.map((item, idx) => (
          <button
            type="button"
            key={`${item.url}-${idx}`}
            className="relative aspect-square text-left"
            onClick={() => onItemClick?.(idx, item)}
            aria-label={`Open customer media ${idx + 1}`}
          >
            <Image
              src={item.url}
              alt=""
              fill
              className="object-cover"
              sizes="(max-width: 768px) 33vw, 220px"
              loading="lazy"
              unoptimized={shouldBypassNextImageOptimizer(item.url)}
            />
            {item.type === 'video' ? (
              <Play className="absolute top-2 right-2 h-4 w-4 text-white drop-shadow-lg" />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
