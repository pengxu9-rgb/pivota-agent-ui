'use client';

import Image from 'next/image';
import { Play } from 'lucide-react';
import type { MediaItem } from '@/features/pdp/types';
import { cn } from '@/lib/utils';

export function BeautyUgcGallery({
  items,
  title = 'Customer Photos',
  showEmpty = false,
  ctaLabel = 'Share yours +',
  ctaEnabled = true,
  onCtaClick,
  onOpenAll,
  onItemClick,
}: {
  items: MediaItem[];
  title?: string;
  showEmpty?: boolean;
  ctaLabel?: string;
  ctaEnabled?: boolean;
  onCtaClick?: () => void;
  onOpenAll?: () => void;
  onItemClick?: (index: number, item: MediaItem) => void;
}) {
  if (!items.length && !showEmpty) return null;

  return (
    <div className="mt-4 px-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">
          {title}
          {items.length ? ` (${items.length})` : ''}
        </h3>
        <div className="flex items-center gap-2">
          {items.length > 9 ? (
            <button
              type="button"
              onClick={onOpenAll}
              className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
            >
              View all
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCtaClick}
            aria-disabled={!ctaEnabled}
            className={cn(
              'text-xs font-medium text-primary transition-opacity',
              ctaEnabled ? 'hover:underline' : 'opacity-50 cursor-not-allowed',
            )}
          >
            {ctaLabel}
          </button>
        </div>
      </div>
      {items.length ? (
        <div className="grid grid-cols-3 gap-1 rounded-lg overflow-hidden">
          {items.slice(0, 9).map((item, idx) => (
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
              />
              {item.type === 'video' ? (
                <Play className="absolute top-2 right-2 h-4 w-4 text-white drop-shadow-lg" />
              ) : null}
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card px-3 py-3 text-xs text-muted-foreground">
          No customer photos yet.
        </div>
      )}
    </div>
  );
}
