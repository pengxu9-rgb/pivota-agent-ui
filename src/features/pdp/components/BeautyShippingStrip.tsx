'use client';

/**
 * Shipping + returns strip for the Beauty mobile PDP.
 * Faithful to redesign/pivota-pdp.jsx → ShippingStrip:
 *   white card, 1px border, rounded-[10px], two icon rows (truck / return)
 *   split by a 1px hairline, teal icons, 13px semibold headline + 12px muted sub.
 *
 * Copy is driven by real payload data, not the design's mock strings:
 * "Free" prefixes only render when the free-shipping / free-returns signal is
 * explicitly true; the returns line is scoped to the selected seller (not
 * "every seller") since `returns` is per-offer.
 */

const TRUCK = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="15" height="13" />
    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
    <circle cx="5.5" cy="18.5" r="2.5" />
    <circle cx="18.5" cy="18.5" r="2.5" />
  </svg>
);

const RETURN = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
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
  if (!windowDays) return 'Returns per seller policy';
  return freeReturns ? `Free ${windowDays}-day returns` : `${windowDays}-day returns`;
}

export function BeautyShippingStrip({
  etaRange,
  methodLabel,
  freeShipping,
  returnWindowDays,
  freeReturns,
  sellerLabel,
}: {
  etaRange?: [number, number] | null;
  methodLabel?: string | null;
  freeShipping?: boolean | null;
  returnWindowDays?: number | null;
  freeReturns?: boolean | null;
  sellerLabel?: string | null;
}) {
  const hasShipping = Boolean(methodLabel || (etaRange && etaRange.length === 2));
  const hasReturns = Boolean(returnWindowDays);
  if (!hasShipping && !hasReturns) return null;

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
              <div className="mt-px text-xs text-muted-foreground">
                Delivery in {etaRange[0]}–{etaRange[1]} days
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {hasShipping && hasReturns ? <div className="h-px bg-border" /> : null}

      {hasReturns ? (
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-px flex-shrink-0 text-primary">
            {RETURN}
          </span>
          <div className="flex-1">
            <div className="text-[13px] font-semibold text-foreground">
              {returnsCopy(returnWindowDays, freeReturns)}
            </div>
            <div className="mt-px text-xs text-muted-foreground">
              {sellerLabel ? `Applies to your selected seller (${sellerLabel})` : 'Applies to your selected seller'}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
