'use client';

import { ExternalLink, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/features/pdp/utils/formatMoney';

/**
 * Sticky bottom buy bar for the Beauty mobile PDP.
 * Faithful to redesign/pivota-pdp.jsx → StickyBuyBar.
 *
 * Layout: [ qty stepper ] [ 44×44 bag icon ] [ "Buy now · $X" pill ]
 * - Compact vertical rhythm so the bar takes minimal first-screen height.
 * - Glass: rgba(255,255,255,0.95) + saturate(180%) blur(20px), 1px top hairline
 * - The "Buy now" total is unitPrice × qty + shipping (shipping counted once,
 *   not per unit). Per the handoff, the bar reuses the existing onAddToCart /
 *   onBuyNow handler contracts.
 */
export function BeautyMobileBuyBar({
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
    <div
      className="flex items-center gap-1.5 border-t border-border bg-white/95 px-3 pt-2 backdrop-blur-xl backdrop-saturate-[1.8]"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 22px)' }}
    >
      {/* Qty stepper */}
      <div className="flex flex-shrink-0 items-center overflow-hidden rounded-full border-[1.5px] border-border bg-white">
        <button
          type="button"
          onClick={() => onQtyChange(Math.max(1, quantity - 1))}
          disabled={disabled || quantity <= 1}
          aria-label="Decrease quantity"
          className="flex h-[34px] w-[34px] items-center justify-center text-foreground disabled:opacity-40"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <div aria-live="polite" className="min-w-[22px] text-center text-sm font-semibold text-foreground">
          {quantity}
        </div>
        <button
          type="button"
          onClick={() => onQtyChange(quantity + 1)}
          disabled={disabled}
          aria-label="Increase quantity"
          className="flex h-[34px] w-[34px] items-center justify-center text-foreground disabled:opacity-40"
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
          className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border-[1.5px] border-foreground bg-white text-foreground disabled:opacity-50"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
          <span
            aria-hidden="true"
            className="absolute bottom-1.5 right-1.5 flex h-[13px] w-[13px] items-center justify-center rounded-full bg-foreground text-[10px] font-bold leading-none text-white"
          >
            +
          </span>
        </button>
      ) : null}

      {/* Primary commit CTA */}
      {reapMode && reapCheckout ? (
        <>
          {/* Secondary: the store. Below 560px it is "Visit store" (icon only below 370px) with no price, so the primary's price always fits. */}
          <button
            type="button"
            onClick={onBuyNow}
            disabled={disabled}
            aria-label={`${externalCtaLabel} · ${formattedTotal}`}
            data-testid="buybar-store-secondary"
            className="flex h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-full border-[1.5px] border-foreground bg-white px-2 text-[13px] font-semibold text-foreground disabled:opacity-50"
          >
            <span className="min-w-0 truncate max-[369px]:sr-only min-[560px]:hidden">Visit store</span>
            <span className="hidden min-w-0 truncate min-[560px]:inline">{externalCtaLabel}</span>
            <span className="hidden shrink-0 min-[560px]:inline">· {formattedTotal}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </button>
          {/* Primary: Reap. Never shrinks or truncates; below 560px the price sits under the label. */}
          <button
            type="button"
            onClick={reapCheckout.onOpen}
            disabled={disabled}
            aria-label={`Buy with Reap · ${formattedTotal}`}
            data-testid="buybar-reap-primary"
            className="flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-semibold text-white shadow-md disabled:opacity-50 min-[560px]:px-4 min-[560px]:text-[14px]"
            style={{ background: 'var(--pv-gradient-primary, linear-gradient(135deg, #534AB7 0%, #7B6FD4 50%, #1D9E75 100%))' }}
          >
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex flex-col items-start leading-tight min-[560px]:flex-row min-[560px]:items-center min-[560px]:gap-1">
              <span>Buy with Reap</span>
              <span data-testid="buybar-reap-price">
                <span className="hidden min-[560px]:inline">· </span>
                {formattedTotal}
              </span>
            </span>
          </button>
        </>
      ) : (
      <button
        type="button"
        onClick={onBuyNow}
        disabled={disabled}
        aria-label={isExternalPurchase ? `${externalCtaLabel} · ${formattedTotal}` : undefined}
        className={cn(
          'flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full text-[14px] font-semibold text-white',
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
  );
}
