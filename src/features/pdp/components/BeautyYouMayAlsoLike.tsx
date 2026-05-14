'use client';

/**
 * "You May Also Like" recommendation grid for the Beauty mobile PDP.
 * Faithful to redesign/pivota-pdp-extras.jsx → YouMayAlsoLike:
 *   2-column card grid — each card: square image, 2-line title, then
 *   either a pill badge or a gold-star rating row, a 2-line highlight,
 *   and a footer with price + a pill "Buy" button.
 */

export type BeautySimilarItem = {
  id: string;
  title: string;
  image: string;
  priceLabel: string;
  badge?: string | null;
  rating?: number | null;
  reviews?: number | null;
  highlight?: string | null;
};

export function BeautyYouMayAlsoLike({
  items,
  onItemClick,
  onBuy,
}: {
  items: BeautySimilarItem[];
  onItemClick?: (item: BeautySimilarItem, index: number) => void;
  onBuy?: (item: BeautySimilarItem, index: number) => void;
}) {
  if (!items?.length) return null;

  return (
    <div className="mt-6 px-3.5 pb-1">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-foreground">You May Also Like</h3>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {items.map((p, idx) => (
          <div
            key={p.id}
            className="flex flex-col overflow-hidden rounded-xl border border-border bg-white"
          >
            <button
              type="button"
              onClick={() => onItemClick?.(p, idx)}
              className="relative aspect-square bg-[#F4F4F2]"
              aria-label={p.title}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.image} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
            <div className="flex flex-1 flex-col px-2.5 pt-2.5">
              <div className="line-clamp-2 min-h-[2.7em] text-[13px] font-medium leading-[1.35] text-foreground">
                {p.title}
              </div>
              {p.badge ? (
                <div className="mt-1.5">
                  <span className="inline-flex rounded-full bg-[#F4F4F2] px-2 py-[3px] text-[10px] font-bold tracking-[-0.01em] text-[rgba(44,44,42,0.85)]">
                    {p.badge}
                  </span>
                </div>
              ) : typeof p.rating === 'number' ? (
                <div className="mt-1.5 flex items-center gap-1">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="hsl(var(--gold))" aria-hidden="true">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  <span className="text-[11.5px] text-foreground">{p.rating.toFixed(1)}</span>
                  {typeof p.reviews === 'number' ? (
                    <span className="text-[11px] text-muted-foreground">({p.reviews})</span>
                  ) : null}
                </div>
              ) : null}
              {p.highlight ? (
                <p className="mt-1 line-clamp-2 text-[11px] leading-[1.4] text-muted-foreground">
                  {p.highlight}
                </p>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-2">
              <div className="text-[14px] font-bold text-foreground">{p.priceLabel}</div>
              <button
                type="button"
                onClick={() => onBuy?.(p, idx)}
                className="inline-flex h-[26px] items-center gap-1 rounded-full border border-border bg-white px-2.5 text-[11px] font-semibold text-foreground"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
                Buy
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
