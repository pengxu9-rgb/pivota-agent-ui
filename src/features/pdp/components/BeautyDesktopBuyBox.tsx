'use client';

import { ExternalLink, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/features/pdp/utils/formatMoney';

/**
 * Inline buy box for the Beauty desktop PDP.
 *
 * The Claude Design handoff is mobile-only, so the desktop layout is
 * derived: this reuses the exact control visual language of
 * `BeautyMobileBuyBar` (rounded qty stepper, 48×48 bag icon, near-black
 * "Buy now · $X" pill) but renders inline inside the right-hand buy
 * column instead of as a sticky glass bar — desktop has no bottom-bar
 * affordance. Same `onAddToCart` / `onBuyNow` handler contract.
 */
export function BeautyDesktopBuyBox({
  unitPrice,
  shippingCost = 0,
  currency,
  quantity,
  onQtyChange,
  onAddToCart,
  onBuyNow,
  disabled = false,
  buyNowLabel = 'Buy now',
  isExternalPurchase = false,
  externalRetailerLabel,
  reapCheckout = null,
}: {
  unitPrice: number;
  shippingCost?: number;
  currency: string;
  quantity: number;
  onQtyChange: (next: number) => void;
  onAddToCart: () => void;
  onBuyNow: () => void;
  disabled?: boolean;
  buyNowLabel?: string;
  isExternalPurchase?: boolean;
  externalRetailerLabel?: string | null;
  /**
   * Reap checkout demo (links-out PDPs only). When set, "Buy with Reap" becomes the primary CTA, to the
   * RIGHT of a secondary "View at <store>". When null (the default: flags off, or a merchant outside the
   * demo) this component renders exactly what it rendered before the demo existed.
   */
  reapCheckout?: { onOpen: () => void } | null;
}) {
  const itemsSubtotal = Math.max(0, unitPrice) * Math.max(1, quantity);
  const total = itemsSubtotal + Math.max(0, shippingCost || 0);
  const formattedTotal = formatMoney(total, currency);
  const retailerLabel = String(externalRetailerLabel || '').trim();
  const externalCtaLabel = `View at ${retailerLabel || 'retailer'}`;
  const reapMode = isExternalPurchase && Boolean(reapCheckout);

  return (
    <div className="mt-5 px-[18px]">
      {/* Reap mode wraps: the stepper stays on the left, then [store | Buy with Reap] on a full-width row. */}
      <div className={reapMode ? 'flex flex-wrap items-center gap-2.5' : 'flex items-center gap-2.5'}>
        {/* Qty stepper */}
        <div className="flex flex-shrink-0 items-center overflow-hidden rounded-full border-[1.5px] border-border bg-white">
          <button
            type="button"
            onClick={() => onQtyChange(Math.max(1, quantity - 1))}
            disabled={disabled || quantity <= 1}
            aria-label="Decrease quantity"
            className="flex h-[42px] w-[42px] items-center justify-center text-foreground disabled:opacity-40"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <div aria-live="polite" className="min-w-[24px] text-center text-sm font-semibold text-foreground">
            {quantity}
          </div>
          <button
            type="button"
            onClick={() => onQtyChange(quantity + 1)}
            disabled={disabled}
            aria-label="Increase quantity"
            className="flex h-[42px] w-[42px] items-center justify-center text-foreground disabled:opacity-40"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        {!isExternalPurchase ? (
          <button
            type="button"
            onClick={onAddToCart}
            disabled={disabled}
            aria-label="Add to bag"
            className="relative flex h-[50px] w-[50px] flex-shrink-0 items-center justify-center rounded-full border-[1.5px] border-foreground bg-white text-foreground disabled:opacity-50"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            <span
              aria-hidden="true"
              className="absolute bottom-1.5 right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-foreground text-[11px] font-bold leading-none text-white"
            >
              +
            </span>
          </button>
        ) : null}

        {/* Primary commit CTA */}
        {reapMode && reapCheckout ? (
          <div className="flex basis-full items-center gap-2.5">
            <button
              type="button"
              onClick={onBuyNow}
              disabled={disabled}
              aria-label={`${externalCtaLabel} · ${formattedTotal}`}
              data-testid="buybar-store-secondary"
              className="flex h-[50px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border-[1.5px] border-foreground bg-white px-3 text-[14px] font-semibold text-foreground hover:bg-secondary disabled:opacity-50"
            >
              <span className="min-w-0 truncate">{externalCtaLabel}</span>
              <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={reapCheckout.onOpen}
              disabled={disabled}
              aria-label={`Buy with Reap · ${formattedTotal}`}
              data-testid="buybar-reap-primary"
              className="flex h-[50px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-5 text-[15px] font-semibold text-white shadow-md disabled:opacity-50"
              style={{ background: 'var(--pv-gradient-primary, linear-gradient(135deg, #534AB7 0%, #7B6FD4 50%, #1D9E75 100%))' }}
            >
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Buy with Reap</span>
              <span data-testid="buybar-reap-price">· {formattedTotal}</span>
            </button>
          </div>
        ) : (
        <button
          type="button"
          onClick={onBuyNow}
          disabled={disabled}
          aria-label={isExternalPurchase ? `${externalCtaLabel} · ${formattedTotal}` : undefined}
          className={cn(
            'flex h-[50px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full text-[15px] font-semibold text-white',
            isExternalPurchase
              ? 'border border-foreground bg-foreground shadow-sm hover:bg-foreground/90'
              : 'shadow-md',
            'disabled:opacity-50',
          )}
          style={isExternalPurchase ? undefined : { background: 'var(--pv-gradient-primary, linear-gradient(135deg, #534AB7 0%, #7B6FD4 50%, #1D9E75 100%))' }}
        >
          {isExternalPurchase ? (
            <>
              <span className="min-w-0 truncate">{externalCtaLabel}</span>
              <span className="shrink-0">· {formattedTotal}</span>
              <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
            </>
          ) : (
            `${buyNowLabel} · ${formattedTotal}`
          )}
        </button>
        )}
      </div>
      {disabled ? (
        <div className="mt-2 text-[12px] text-muted-foreground">
          Currently unavailable for the selected option.
        </div>
      ) : null}
    </div>
  );
}
