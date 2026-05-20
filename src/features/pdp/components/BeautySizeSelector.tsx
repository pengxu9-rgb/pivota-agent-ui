'use client';

import { cn } from '@/lib/utils';

/**
 * Size selector for the Beauty mobile PDP.
 * Faithful to redesign/pivota-pdp.jsx → SizeSelector:
 *   "SIZE" eyebrow, then flex-1 option cards — selected = white fill +
 *   1.5px foreground border, unselected = transparent + 1.5px border.
 *   Each card: 13px semibold label + 11px muted "{sub} · {price}" line.
 */

export type BeautySize = { id: string; label: string; sub?: string | null; priceLabel?: string | null };

export function BeautySizeSelector({
  sizes,
  selectedId,
  onSelect,
}: {
  sizes: BeautySize[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  if (!sizes?.length) return null;
  const selected = sizes.find((s) => s.id === selectedId)?.id || sizes[0].id;

  return (
    <div className="px-4 pt-2.5">
      {/* Label font matches the product-line / variant selectors so every
          variant-axis selector reads consistently (owner-flagged). */}
      <div className="mb-1.5 text-xs font-semibold text-foreground">
        Size
      </div>
      <div className="flex gap-2">
        {sizes.map((sz) => {
          const isSel = sz.id === selected;
          return (
            <button
              key={sz.id}
              type="button"
              onClick={() => onSelect(sz.id)}
              aria-pressed={isSel}
              className={cn(
                // Industry-best selected state: hairline border + 1.5px
                // inset ring (handoff §3e). The ring lifts the card without
                // changing its bounding box — no layout shift on selection.
                'flex-1 rounded-[10px] border border-border bg-card px-3 py-2 text-left transition-shadow duration-150',
                isSel
                  ? 'font-semibold text-foreground shadow-[inset_0_0_0_1.5px_hsl(var(--foreground))]'
                  : 'hover:border-muted-foreground/40',
              )}
            >
              <div className="text-[13px] font-semibold text-foreground">{sz.label}</div>
              {sz.sub || sz.priceLabel ? (
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {[sz.sub, sz.priceLabel].filter(Boolean).join(' · ')}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
