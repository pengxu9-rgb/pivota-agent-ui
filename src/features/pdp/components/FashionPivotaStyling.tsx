'use client';

/**
 * FashionPivotaStyling
 *
 * "Pivota styling" — auto-paired outfit recommendations as a horizontal
 * carousel. Each pairing card has a 4:5 image + brand + name + price + Add
 * button.
 *
 * On desktop the parent renders a 3-up grid using the same data; the card
 * shape is identical so the same component can be embedded in a grid by
 * wrapping it in a `display: grid` container — the carousel scroll-snap
 * still works inside the grid cell.
 */

export type FashionPairing = {
  id?: string;
  name: string;
  brand: string;
  price: number;
  currency?: string;
  img: string;
  href?: string;
};

export function FashionPivotaStyling({
  pairings,
  onItemClick,
}: {
  pairings: FashionPairing[];
  onItemClick?: (item: FashionPairing) => void;
}) {
  if (!pairings?.length) return null;
  return (
    <section className="mt-6 px-[18px]">
      <div className="mb-2.5 flex items-baseline justify-between">
        <h3 className="text-[14px] font-semibold text-foreground">Pivota styling</h3>
        <span className="text-[11px] text-muted-foreground">Curated · auto-paired</span>
      </div>
      <div className="-mx-[18px] flex gap-2 overflow-x-auto px-[18px] pb-1 [scrollbar-width:none] [&amp;::-webkit-scrollbar]:hidden">
        {pairings.map((p, i) => (
          <button
            key={p.id || `${p.brand}-${p.name}-${i}`}
            type="button"
            onClick={() => onItemClick?.(p)}
            className="flex w-[140px] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-left"
          >
            <div
              className="aspect-[4/5] w-full bg-cover bg-center"
              style={{ backgroundImage: `url(${p.img})` }}
              aria-hidden
            />
            <div className="flex flex-1 flex-col gap-1 p-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {p.brand}
              </div>
              <div className="line-clamp-2 min-h-[2.5em] text-[12px] leading-snug text-foreground">
                {p.name}
              </div>
              <div className="mt-auto text-[13px] font-bold text-foreground">
                ${p.price}
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
