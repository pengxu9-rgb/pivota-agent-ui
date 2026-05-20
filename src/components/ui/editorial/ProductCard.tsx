'use client';

import * as React from 'react';
import Image from 'next/image';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Num, Title } from './Type';
import { Pill } from './Chip';

/**
 * Editorial product card.
 *  - Image area uses the requested aspect ratio (4/5 default, configurable).
 *  - Brand label sits in `pv-label`, title in `pv-title`, price as a `Num`.
 *  - Save heart toggles a parent-controlled `saved` state.
 *  - Optional `badge` renders as a top-left status `Pill`.
 *
 * The card itself is anchorless — wrap in `<Link>` at the call site so
 * the entire card is clickable while preserving the inline save action.
 */

export interface ProductCardProps {
  image: string;
  imageAlt?: string;
  brand?: string | null;
  title: string;
  priceLabel?: string;
  badge?: { label: string; variant?: 'default' | 'sage' | 'accent' } | null;
  saved?: boolean;
  onSave?: (next: boolean) => void;
  aspect?: '4/5' | '1/1' | '3/4';
  className?: string;
  /** Typeface for title + price. Default `'serif'` (editorial). Chat-surface
   *  callers pass `'sans'` so recommendation tiles match the Geist-only chat. */
  font?: 'serif' | 'sans';
}

const aspectClass: Record<NonNullable<ProductCardProps['aspect']>, string> = {
  '4/5': 'aspect-[4/5]',
  '1/1': 'aspect-square',
  '3/4': 'aspect-[3/4]',
};

export function ProductCard({
  image,
  imageAlt = '',
  brand,
  title,
  priceLabel,
  badge,
  saved = false,
  onSave,
  aspect = '4/5',
  className,
  font = 'serif',
}: ProductCardProps) {
  const handleSave = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onSave?.(!saved);
  };

  return (
    <div className={cn('group flex flex-col', className)}>
      <div className={cn('relative w-full overflow-hidden bg-paper-2', aspectClass[aspect])}>
        <Image
          src={image}
          alt={imageAlt || title}
          fill
          className="object-cover transition-transform duration-300 lg:group-hover:scale-[1.03]"
          sizes="(min-width: 1024px) 25vw, 50vw"
        />
        {badge ? (
          <Pill variant={badge.variant ?? 'accent'} className="absolute left-2 top-2">
            {badge.label}
          </Pill>
        ) : null}
        {onSave ? (
          <button
            type="button"
            onClick={handleSave}
            aria-label={saved ? 'Remove from saved' : 'Save to your list'}
            aria-pressed={saved}
            className={cn(
              'absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full',
              'border border-hairline bg-surface/85 backdrop-blur-sm text-ink transition-colors',
              'hover:bg-surface',
            )}
          >
            <Heart
              size={15}
              strokeWidth={1.5}
              className={cn(saved && 'fill-terracotta text-terracotta')}
            />
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-3">
          {font === 'sans' ? (
            <p className="font-editorial-sans text-[14px] font-medium leading-[1.3] tracking-[-0.005em] text-ink">
              {brand ? <span className="text-ink-muted">{brand} · </span> : null}{title}
            </p>
          ) : (
            <Title as="p" className="line-clamp-2 text-[14px] leading-[1.25]">
              {brand ? <span className="text-ink-muted">{brand} · </span> : null}{title}
            </Title>
          )}
          {priceLabel ? (
            font === 'sans' ? (
              <span className="flex-shrink-0 font-editorial-sans text-[15px] font-medium tracking-[-0.01em] tabular-nums text-ink">
                {priceLabel}
              </span>
            ) : (
              <Num value={priceLabel} className="flex-shrink-0 text-[15px]" />
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
