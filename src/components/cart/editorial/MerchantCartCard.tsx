'use client';

import * as React from 'react';
import Image from 'next/image';
import { Mono, Num, Title, Headline } from '@/components/ui/editorial/Type';
import { Pill } from '@/components/ui/editorial/Chip';
import { Button } from '@/components/ui/editorial/Button';
import { QtyStepper } from '@/components/ui/editorial/Stepper';
import { normalizeDisplayImageUrl } from '@/lib/displayImage';
import type { CartItem } from '@/store/cartStore';

function formatPrice(amount: number, currency: string): string {
  const safeCurrency = (currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: safeCurrency,
    }).format(amount);
  } catch {
    return `${safeCurrency} ${amount.toFixed(2)}`;
  }
}
import type { MerchantGroup } from '@/lib/cartGrouping';
import { cn } from '@/lib/utils';

/**
 * Editorial merchant-grouped cart card.
 *
 *  - **Header strip** (paper bg, hairline bottom): italic-serif monogram
 *    circle + house name + location · ship estimate label + right-aligned
 *    item-count pill.
 *  - **Line items** stacked between hairline-2 dividers, each with a 4/5
 *    thumb, title + variant, qty stepper + remove link, and a right-aligned
 *    `price × qty` number.
 *  - **Footer strip** (paper bg, hairline top): subtotal + shipping rows,
 *    hairline, and a full-width primary `Checkout with {merchant}` button
 *    that justifies title and total apart. The first merchant on the page
 *    uses the terracotta `accent` variant — others stay ink.
 *
 *  Merchant metadata (location / ship / policy) only renders when the cart
 *  line actually carries it. The card never invents copy — falls back to
 *  hiding the row instead.
 */
export interface MerchantCartCardProps {
  group: MerchantGroup;
  /** True for the first merchant on the page — uses the accent CTA. */
  accent?: boolean;
  /** Compact mode (mobile / drawer) reduces padding and thumb size. */
  compact?: boolean;
  onUpdateQuantity: (item: CartItem, next: number) => void;
  onRemoveItem: (item: CartItem) => void;
  onCheckoutMerchant: (group: MerchantGroup) => void;
  /** Disables the merchant CTA (e.g. while a checkout call is in-flight). */
  checkoutDisabled?: boolean;
  className?: string;
}

function variantLabel(item: CartItem): string | null {
  if (!item.selected_options) return null;
  const parts = Object.values(item.selected_options).filter(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

function CartLineItem({
  item,
  compact,
  onUpdateQuantity,
  onRemoveItem,
}: {
  item: CartItem;
  compact: boolean;
  onUpdateQuantity: (item: CartItem, next: number) => void;
  onRemoveItem: (item: CartItem) => void;
}) {
  const lineTotal = (Number(item.price) || 0) * (Number(item.quantity) || 0);
  const variant = variantLabel(item);

  return (
    <div className="flex gap-3 border-t border-hairline-2 py-3 first:border-t-0">
      <div
        className={cn(
          'relative flex-shrink-0 overflow-hidden bg-paper-2',
          compact ? 'h-[75px] w-[60px]' : 'h-[95px] w-[76px]',
        )}
        style={{ aspectRatio: '4 / 5' }}
      >
        <Image
          src={normalizeDisplayImageUrl(item.imageUrl, '/placeholder.svg')}
          alt={item.title}
          fill
          sizes={compact ? '60px' : '76px'}
          className="object-cover"
          unoptimized
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div className="min-w-0">
          <Title
            as="p"
            className={cn('line-clamp-2', compact ? 'text-[13.5px]' : 'text-[14.5px]')}
          >
            {item.title}
          </Title>
          {variant ? (
            <p className="mt-0.5 line-clamp-1 font-editorial-sans text-[11px] text-ink-muted">
              {variant}
            </p>
          ) : null}
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <QtyStepper
            value={item.quantity}
            onChange={(next) => onUpdateQuantity(item, next)}
            min={1}
            size="sm"
          />
          <button
            type="button"
            onClick={() => onRemoveItem(item)}
            className="pv-label uppercase tracking-[0.1em] text-ink-muted hover:text-ink"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="flex flex-col items-end justify-between text-right">
        <Num
          value={formatPrice(lineTotal, item.currency || 'USD')}
          className={cn(compact ? 'text-[14px]' : 'text-[15px]')}
        />
        {item.quantity > 1 ? (
          <Mono className="text-[9px] text-ink-muted">
            {formatPrice(item.price, item.currency || 'USD')} × {item.quantity}
          </Mono>
        ) : null}
      </div>
    </div>
  );
}

export function MerchantCartCard({
  group,
  accent = false,
  compact = false,
  onUpdateQuantity,
  onRemoveItem,
  onCheckoutMerchant,
  checkoutDisabled = false,
  className,
}: MerchantCartCardProps) {
  const total = group.subtotal; // shipping omitted from total when null — see helpers
  const currency = group.currency || group.items[0]?.currency || 'USD';

  const initial = (group.merchantName || '?').charAt(0).toUpperCase();
  const subtitle = [group.merchantLocation, group.merchantShipEstimate]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' · ');

  return (
    <section
      className={cn(
        'border border-hairline bg-surface',
        className,
      )}
    >
      {/* Header strip — monogram + house name + meta + count pill */}
      <header
        className={cn(
          'flex items-start justify-between gap-3 border-b border-hairline-2 bg-paper',
          compact ? 'px-4 py-3.5' : 'px-5 py-4',
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full bg-paper-2"
          >
            <span className="pv-headline text-[14px] italic" style={{ lineHeight: 1 }}>
              {initial}
            </span>
          </span>
          <div className="min-w-0">
            <Headline
              as="h3"
              className={cn(
                'truncate leading-[1.1]',
                compact ? 'text-[15px]' : 'text-[16px]',
              )}
            >
              {group.merchantName}
            </Headline>
            {subtitle ? <Mono className="mt-0.5 block text-[9px]">{subtitle}</Mono> : null}
          </div>
        </div>
        <Pill variant="default" className="flex-shrink-0">
          {group.itemCount} item{group.itemCount === 1 ? '' : 's'}
        </Pill>
      </header>

      {/* Line items */}
      <div className={cn(compact ? 'px-4' : 'px-5')}>
        {group.items.map((item) => (
          <CartLineItem
            key={item.id}
            item={item}
            compact={compact}
            onUpdateQuantity={onUpdateQuantity}
            onRemoveItem={onRemoveItem}
          />
        ))}
      </div>

      {/* Per-merchant totals + CTA */}
      <footer
        className={cn(
          'border-t border-hairline bg-paper',
          compact ? 'px-4 py-3.5' : 'px-5 py-4',
        )}
      >
        <div className="flex items-baseline justify-between">
          <Mono>Subtotal</Mono>
          <Num value={formatPrice(group.subtotal, currency)} className="text-[14px]" />
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <Mono>Shipping</Mono>
          <span className="font-editorial-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted">
            at checkout
          </span>
        </div>
        <hr className="my-2.5 border-0 border-t border-hairline-2" />
        <Button
          variant={accent ? 'accent' : 'default'}
          size={compact ? 'md' : 'lg'}
          className="w-full justify-between px-4"
          onClick={() => onCheckoutMerchant(group)}
          disabled={checkoutDisabled}
        >
          <span>Checkout with {group.merchantName}</span>
          <Num value={formatPrice(total, currency)} className="text-[14px] text-paper" />
        </Button>
        {group.merchantReturnPolicy ? (
          <Mono className="mt-2 block text-center text-[9px]">
            {group.merchantReturnPolicy}
          </Mono>
        ) : null}
      </footer>
    </section>
  );
}
