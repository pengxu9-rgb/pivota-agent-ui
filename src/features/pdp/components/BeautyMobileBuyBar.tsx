'use client';

import { cn } from '@/lib/utils';

export function BeautyMobileBuyBar({
  unitPrice,
  currency,
  quantity,
  onQtyChange,
  onAddToCart,
  onBuyNow,
  disabled = false,
  buyNowLabel = 'Buy now',
}: {
  unitPrice: number;
  currency: string;
  quantity: number;
  onQtyChange: (next: number) => void;
  onAddToCart: () => void;
  onBuyNow: () => void;
  disabled?: boolean;
  buyNowLabel?: string;
}) {
  const total = Math.max(0, unitPrice) * Math.max(1, quantity);
  let formattedTotal: string;
  try {
    formattedTotal = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(total);
  } catch {
    formattedTotal = `$${total.toFixed(2)}`;
  }

  const decrement = () => {
    if (quantity > 1) onQtyChange(quantity - 1);
  };
  const increment = () => onQtyChange(quantity + 1);

  return (
    <div
      className="flex items-center gap-2 border-t border-border bg-white/95 px-3.5 pt-2.5 backdrop-blur-md backdrop-saturate-150"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
    >
      <div className="flex flex-shrink-0 items-center overflow-hidden rounded-full border-[1.5px] border-border bg-white">
        <button
          type="button"
          onClick={decrement}
          disabled={disabled || quantity <= 1}
          aria-label="Decrease quantity"
          className="flex h-[38px] w-[38px] items-center justify-center text-foreground disabled:opacity-40"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <div
          aria-live="polite"
          className="min-w-[22px] text-center text-sm font-semibold text-foreground"
        >
          {quantity}
        </div>
        <button
          type="button"
          onClick={increment}
          disabled={disabled}
          aria-label="Increase quantity"
          className="flex h-[38px] w-[38px] items-center justify-center text-foreground disabled:opacity-40"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <button
        type="button"
        onClick={onAddToCart}
        disabled={disabled}
        aria-label="Add to bag"
        className={cn(
          'relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border-[1.5px] border-foreground bg-white text-foreground',
          'disabled:opacity-50',
        )}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
        <span
          aria-hidden="true"
          className="absolute bottom-1.5 right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold leading-none text-background"
        >
          +
        </span>
      </button>

      <button
        type="button"
        onClick={onBuyNow}
        disabled={disabled}
        className={cn(
          'flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full bg-foreground text-[15px] font-semibold text-background shadow-md',
          'disabled:opacity-50',
        )}
      >
        {buyNowLabel} · {formattedTotal}
      </button>
    </div>
  );
}
