'use client';

/**
 * Price row for the Beauty mobile PDP.
 * Faithful to redesign/pivota-pdp.jsx → PriceRow:
 *   30px bold price, 15px strikethrough compare-at, and a coral "SAVE N%"
 *   badge. Coral matches the design reference (the JSX is the source of
 *   truth); it has no .lovable-pdp token so it's an inline value, not a
 *   new CSS variable.
 */
function fmt(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `$${amount}`;
  }
}

export function BeautyPriceRow({
  price,
  compareAt,
  discountPct,
  currency,
}: {
  price: number;
  compareAt?: number | null;
  discountPct?: number | null;
  currency: string;
}) {
  const hasCompare = typeof compareAt === 'number' && compareAt > price;
  return (
    <div className="flex items-baseline gap-2.5 px-[18px] pt-[18px]">
      <div className="text-[30px] font-bold tracking-[-0.02em] text-foreground">
        {fmt(price, currency)}
      </div>
      {hasCompare ? (
        <div className="text-[15px] text-[hsl(0_0%_60%)] line-through">
          <span className="sr-only">Compare at </span>
          {fmt(compareAt as number, currency)}
        </div>
      ) : null}
      {discountPct && discountPct > 0 ? (
        <div className="rounded-[4px] bg-[#FAECE7] px-[7px] py-[3px] text-[11px] font-bold tracking-[0.02em] text-[#D85A30]">
          SAVE {Math.round(discountPct)}%
        </div>
      ) : null}
    </div>
  );
}
