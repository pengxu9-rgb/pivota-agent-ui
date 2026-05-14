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
    <div className="px-[18px] pt-[18px]">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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
                'flex-1 rounded-[10px] border-[1.5px] px-3 py-2.5 text-left',
                isSel ? 'border-foreground bg-white' : 'border-border bg-transparent',
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
