'use client';

import * as React from 'react';
import Image from 'next/image';
import { Heart, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatProductCardTitle } from '@/lib/productCardTitle';
import { Mono, Num, Title } from './Type';
import { Pill } from './Chip';
import { Button } from './Button';

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
  /**
   * Top-left status pill(s). Pass a single `{label, variant}` for the
   * common case, or an array (max ~2 rendered) to surface multiple
   * promos (e.g. a discount + a shipping perk). Stacked vertically with
   * 4px gap when more than one.
   */
  badge?:
    | { label: string; variant?: 'default' | 'sage' | 'accent' | 'promo' }
    | Array<{ label: string; variant?: 'default' | 'sage' | 'accent' | 'promo' }>
    | null;
  saved?: boolean;
  onSave?: (next: boolean) => void;
  /**
   * Optional quick-action affordance. When provided, renders a full-width
   * "Add to cart" button below the price line (browse-style surfaces). The
   * earlier floating Plus-icon overlay on the image is gone — direct buttons
   * read clearer on small editorial cards.
   */
  onQuickAction?: (event: React.MouseEvent) => void;
  /** Button copy for the quick action (default: "Add to cart"). */
  quickActionLabel?: string;
  /**
   * Optional review stats rendered inline with the brand label. Pass nothing
   * to hide the slot entirely. Display: `★ 4.7 · 128` (rating + count).
   */
  reviewStats?: { rating?: number | null; count?: number | null } | null;
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

function getRenderablePriceLabel(priceLabel?: string | null): string | null {
  const label = String(priceLabel || '').trim();
  if (!label) return null;
  const amount = Number(label.replace(/,/g, '').replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return label;
}

export function ProductCard({
  image,
  imageAlt = '',
  brand,
  title,
  priceLabel,
  badge,
  saved = false,
  onSave,
  onQuickAction,
  quickActionLabel,
  reviewStats,
  aspect = '4/5',
  className,
  font = 'serif',
}: ProductCardProps) {
  const displayPriceLabel = getRenderablePriceLabel(priceLabel);
  if (!displayPriceLabel) return null;

  const handleSave = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onSave?.(!saved);
  };

  const handleQuickAction = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onQuickAction?.(event);
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
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
            {(Array.isArray(badge) ? badge : [badge]).slice(0, 3).map((b, i) => (
              <Pill key={`${b.label}-${i}`} variant={b.variant ?? 'accent'}>
                {b.label}
              </Pill>
            ))}
          </div>
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

      {(() => {
        // Brand label shows in the Mono row (uppercase via .pv-label CSS).
        // Title row drops the inline brand prefix (would duplicate the label)
        // and uses the shared helper to strip any leading brand from the title
        // text itself so we don't get "Fenty Beauty · fenty beauty matte ...".
        const formatted = formatProductCardTitle(brand, title);
        return (
          <div className="mt-3 flex flex-col gap-1.5">
            {formatted.brandPrefix || reviewStats ? (
              <div className="flex items-center justify-between gap-2">
                {formatted.brandPrefix ? <Mono className="text-ink-muted">{formatted.brandPrefix}</Mono> : <span />}
                {reviewStats && (reviewStats.rating != null || reviewStats.count != null) ? (
                  <span className="inline-flex items-center gap-1 font-editorial-mono text-[10px] text-ink-muted tabular-nums">
                    <Star size={10} strokeWidth={1.5} className="fill-ink-muted text-ink-muted" />
                    {reviewStats.rating != null ? Number(reviewStats.rating).toFixed(1) : '—'}
                    {reviewStats.count != null ? <span>· {reviewStats.count}</span> : null}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="flex items-start justify-between gap-3">
              {font === 'sans' ? (
                <p className="font-editorial-sans text-[14px] font-medium leading-[1.3] tracking-[-0.005em] text-ink">
                  {formatted.title}
                </p>
              ) : (
                <Title as="p" className="line-clamp-2 text-[14px] leading-[1.25]">
                  {formatted.title}
                </Title>
              )}
              {displayPriceLabel ? (
                font === 'sans' ? (
                  <span className="flex-shrink-0 font-editorial-sans text-[15px] font-medium tracking-[-0.01em] tabular-nums text-ink">
                    {displayPriceLabel}
                  </span>
                ) : (
                  <Num value={displayPriceLabel} className="flex-shrink-0 text-[15px]" />
                )
              ) : null}
            </div>
            {onQuickAction ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleQuickAction}
                className="mt-2 w-full"
                aria-label={quickActionLabel || `Add ${title} to cart`}
              >
                {quickActionLabel || 'Add to cart'}
              </Button>
            ) : null}
          </div>
        );
      })()}
    </div>
  );
}
