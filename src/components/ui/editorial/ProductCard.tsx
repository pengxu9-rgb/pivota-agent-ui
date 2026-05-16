'use client';

import * as React from 'react';
import Image from 'next/image';
import { Heart, ShoppingBag, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Mono, Num, Title } from './Type';
import { Pill } from './Chip';

/**
 * Editorial product card.
 *  - Image area uses the requested aspect ratio (4/5 default, configurable).
 *  - Brand label sits in `pv-label`, title in `pv-title`, price as a `Num`.
 *  - Save heart toggles a parent-controlled `saved` state.
 *  - Optional `badge` renders as a top-left status `Pill`.
 *  - Optional `summaryBadges` render below the title/price row as the
 *    editorial answer to the legacy savings-badge strip — sage / paper-2 /
 *    terracotta-bg tinted micro chips that surface real discount /
 *    cart-unlock / payment-benefit signals without breaking the calm
 *    typography.
 *  - Optional `highlight` is a one-line italic-serif descriptor that sits
 *    between brand and title (review-derived editorial copy etc.).
 *  - `compareAtLabel` renders as a strikethrough next to the price.
 *  - `discountLabel` renders as a terracotta accent tag near the price.
 *  - Optional `onAddToCart` / `onBuyNow` render small quick-action icon
 *    buttons on the bottom-right of the image. Always visible on mobile
 *    (no hover state); fade in on hover at `lg:` so the card stays calm
 *    until the cursor lands on it. Buy Now uses the terracotta accent;
 *    Add to Cart is ink-on-paper. Both stopPropagation so they don't
 *    trigger the outer card link.
 *
 * The card itself is anchorless — wrap in `<Link>` at the call site so
 * the entire card is clickable while preserving the inline save action.
 */

export type ProductSummaryBadgeTone =
  | 'applied'
  | 'store'
  | 'unlock'
  | 'shipping'
  | 'payment'
  | 'default';

export interface ProductSummaryBadge {
  label: string;
  tone?: ProductSummaryBadgeTone;
}

export interface ProductCardProps {
  image: string;
  imageAlt?: string;
  brand?: string | null;
  /** Category label that sits alongside the brand (e.g. "Clay Mask"). */
  category?: string | null;
  title: string;
  priceLabel?: string;
  compareAtLabel?: string | null;
  discountLabel?: string | null;
  badge?: { label: string; variant?: 'default' | 'sage' | 'accent' } | null;
  highlight?: string | null;
  summaryBadges?: ProductSummaryBadge[] | null;
  saved?: boolean;
  onSave?: (next: boolean) => void;
  /** When set, renders an ink Add-to-Bag icon button. */
  onAddToCart?: () => void;
  /** When set, renders a terracotta Buy Now icon button. */
  onBuyNow?: () => void;
  aspect?: '4/5' | '1/1' | '3/4';
  className?: string;
}

const aspectClass: Record<NonNullable<ProductCardProps['aspect']>, string> = {
  '4/5': 'aspect-[4/5]',
  '1/1': 'aspect-square',
  '3/4': 'aspect-[3/4]',
};

const summaryToneClass: Record<ProductSummaryBadgeTone, string> = {
  applied: 'bg-sage-bg text-sage',
  store: 'bg-terracotta-bg text-terracotta-ink',
  unlock: 'bg-paper-2 text-ink',
  shipping: 'bg-sage-bg text-sage',
  payment: 'bg-terracotta-bg text-terracotta-ink',
  default: 'bg-paper-2 text-ink-2',
};

export function ProductCard({
  image,
  imageAlt = '',
  brand,
  category,
  title,
  priceLabel,
  compareAtLabel,
  discountLabel,
  badge,
  highlight,
  summaryBadges,
  saved = false,
  onSave,
  onAddToCart,
  onBuyNow,
  aspect = '4/5',
  className,
}: ProductCardProps) {
  const handleSave = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onSave?.(!saved);
  };

  const handleAddToCart = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onAddToCart?.();
  };

  const handleBuyNow = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onBuyNow?.();
  };

  const trimmedHighlight = String(highlight || '').trim();
  const trimmedCompareAt = String(compareAtLabel || '').trim();
  const trimmedDiscount = String(discountLabel || '').trim();
  const summary = (summaryBadges || []).filter((b) => b && String(b.label || '').trim());

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
        {onAddToCart || onBuyNow ? (
          <div
            className={cn(
              'absolute bottom-2 right-2 flex items-center gap-1.5',
              // Always visible — keeps the affordance reachable without a
              // hover/focus discovery step. Editorial calm is preserved by
              // the small footprint (32px), paper backdrop, and minimal icon
              // weight rather than by hiding the controls.
              'opacity-100',
            )}
          >
            {onAddToCart ? (
              <button
                type="button"
                onClick={handleAddToCart}
                aria-label={`Add ${title} to bag`}
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-full',
                  'border border-hairline bg-surface/90 backdrop-blur-sm text-ink transition-colors',
                  'hover:bg-surface',
                )}
              >
                <ShoppingBag size={14} strokeWidth={1.5} />
              </button>
            ) : null}
            {onBuyNow ? (
              <button
                type="button"
                onClick={handleBuyNow}
                aria-label={`Buy ${title} now`}
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-full',
                  'bg-terracotta text-paper transition-colors',
                  'hover:bg-terracotta-ink',
                )}
              >
                <Zap size={14} strokeWidth={1.75} />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        {brand || category ? (
          <Mono className="text-ink-muted">
            {brand}
            {brand && category ? <span className="mx-1 text-subtle">·</span> : null}
            {category}
          </Mono>
        ) : null}
        {trimmedHighlight ? (
          <p className="font-editorial-serif italic text-[12.5px] leading-[1.35] text-ink-muted line-clamp-2">
            {trimmedHighlight}
          </p>
        ) : null}
        <div className="flex items-start justify-between gap-3">
          <Title as="p" className="line-clamp-2 text-[14px] leading-[1.25]">
            {title}
          </Title>
          <div className="flex flex-shrink-0 items-baseline gap-1.5">
            {priceLabel ? <Num value={priceLabel} className="text-[15px]" /> : null}
            {trimmedCompareAt ? (
              <span className="font-editorial-sans text-[11px] text-ink-muted line-through">
                {trimmedCompareAt}
              </span>
            ) : null}
          </div>
        </div>
        {(trimmedDiscount || summary.length > 0) ? (
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {trimmedDiscount ? (
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-1.5 py-0.5',
                  'font-editorial-mono text-[9px] font-bold uppercase tracking-[0.08em]',
                  'bg-terracotta text-paper',
                )}
              >
                {trimmedDiscount}
              </span>
            ) : null}
            {summary.map((b, i) => (
              <span
                key={`${b.label}-${i}`}
                className={cn(
                  'inline-flex items-center rounded-full px-1.5 py-0.5',
                  'font-editorial-mono text-[9px] font-medium uppercase tracking-[0.08em]',
                  summaryToneClass[b.tone || 'default'],
                )}
              >
                {b.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
