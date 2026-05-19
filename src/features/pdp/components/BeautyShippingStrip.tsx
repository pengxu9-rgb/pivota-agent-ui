'use client';

/**
 * Shipping + returns strip for the Beauty mobile PDP.
 * Reference: reference/pdp.jsx → ShippingStrip.
 *
 * Two rows separated by a hairline:
 *  1. Truck icon + shipping headline + ETA sub-line
 *  2. 32px gradient Pivota mark + "Backed by Pivota." + returns copy
 *
 * The brand trust row always renders (it's a brand commitment, not a data
 * field). The returns copy is data-driven when returnWindowDays is supplied;
 * otherwise falls back to the brand standard "60-day" window.
 */

const TRUCK = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="15" height="13" />
    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
    <circle cx="5.5" cy="18.5" r="2.5" />
    <circle cx="18.5" cy="18.5" r="2.5" />
  </svg>
);

function shippingHeadline(
  etaRange?: [number, number] | null,
  methodLabel?: string | null,
  freeShipping?: boolean | null,
): string {
  if (methodLabel) return methodLabel;
  if (etaRange && etaRange.length === 2) {
    if (etaRange[1] <= 2) return freeShipping ? 'Free 2-day shipping' : '2-day shipping';
    if (etaRange[1] <= 5) return freeShipping ? 'Free standard shipping' : 'Standard shipping';
    return freeShipping
      ? `Free shipping in ${etaRange[0]}–${etaRange[1]} days`
      : `Ships in ${etaRange[0]}–${etaRange[1]} days`;
  }
  return freeShipping ? 'Free standard shipping' : 'Standard shipping';
}

function returnsCopy(windowDays?: number | null, freeReturns?: boolean | null): string {
  const days = windowDays ?? 60;
  const prefix = freeReturns !== false ? 'Free' : '';
  return `${prefix} ${days}-day returns via every seller — even on opened beauty.`.replace(/^ /, '');
}

export function BeautyShippingStrip({
  etaRange,
  methodLabel,
  freeShipping,
  returnWindowDays,
  freeReturns,
}: {
  etaRange?: [number, number] | null;
  methodLabel?: string | null;
  freeShipping?: boolean | null;
  returnWindowDays?: number | null;
  freeReturns?: boolean | null;
  sellerLabel?: string | null;
}) {
  const hasShipping = Boolean(methodLabel || (etaRange && etaRange.length === 2));

  return (
    <div className="mx-4 mt-2.5 flex flex-col gap-2.5 rounded-[10px] border border-border bg-white px-3.5 py-2.5">
      {hasShipping ? (
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-px flex-shrink-0 text-primary">
            {TRUCK}
          </span>
          <div className="flex-1">
            <div className="text-[13px] font-semibold text-foreground">
              {shippingHeadline(etaRange, methodLabel, freeShipping)}
            </div>
            {etaRange && etaRange.length === 2 ? (
              <div className="mt-px text-[12px] text-muted-foreground">
                Delivery in {etaRange[0]}–{etaRange[1]} days
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {hasShipping ? <div className="h-px bg-border" /> : null}

      {/* Brand trust row — gradient Pivota mark + "Backed by Pivota." + returns guarantee */}
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[22%] text-white"
          style={{
            background: 'var(--pv-gradient-primary, linear-gradient(135deg, #534AB7 0%, #7B6FD4 50%, #1D9E75 100%))',
          }}
        >
          <span
            className="text-[13px] font-semibold leading-none"
            style={{ fontFamily: 'var(--pv-font-brand, "Fredoka", system-ui, sans-serif)' }}
          >
            p<span style={{ marginLeft: 0.5 }}>.</span>
          </span>
        </span>
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-foreground">
            Backed by{' '}
            <span style={{ fontFamily: 'var(--pv-font-brand, "Fredoka", system-ui, sans-serif)', fontWeight: 600 }}>
              Pivota<span style={{ color: 'var(--pv-primary, #1D9E75)' }}>.</span>
            </span>
          </div>
          <div className="mt-px text-[12px] text-muted-foreground">
            {returnsCopy(returnWindowDays, freeReturns)}
          </div>
        </div>
      </div>
    </div>
  );
}
