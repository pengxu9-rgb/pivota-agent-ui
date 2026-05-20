'use client';

import type { Variant } from '@/features/pdp/types';
import { getDisplayVariantLabel, getDisplayableVariantOptions } from '@/features/pdp/utils/variantLabels';
import { cn } from '@/lib/utils';

/**
 * Variant selector for the Beauty PDP — non-shade / non-size variant axes
 * (Format, Refill, …) that the dedicated BeautyShadeSelector /
 * BeautySizeSelector don't cover.
 *
 * It renders in the same slot as the cross-SKU product-line selector and
 * **mirrors its markup exactly** (sentence-case `text-xs` label, scrollable
 * `bg-card` option chips, neutral `border-muted-foreground/50` selected
 * state) so every variant-axis selector uses the same highlight regardless
 * of category — no per-category accent. It
 * carries no gutter padding of its own — the variant-selector wrapper in
 * BeautyPDP{Mobile,Desktop} already provides `px-4` (16 px gutter).
 */

function deriveAxisLabel(variants: Variant[]): string {
  const names = new Set<string>();
  for (const variant of variants) {
    for (const option of getDisplayableVariantOptions(variant.options)) {
      const name = String(option.name || '').trim();
      if (name) names.add(name);
    }
  }
  if (names.size === 1) {
    const [only] = [...names];
    return only.charAt(0).toUpperCase() + only.slice(1);
  }
  return 'Options';
}

export function BeautyVariantSelector({
  variants,
  selectedVariantId,
  onChange,
}: {
  variants: Variant[];
  selectedVariantId: string;
  onChange: (variantId: string) => void;
}) {
  if (!variants?.length) return null;
  const selectedId =
    variants.find((variant) => variant.variant_id === selectedVariantId)?.variant_id ||
    variants[0].variant_id;
  const axisLabel = deriveAxisLabel(variants);

  return (
    <div className="mt-2">
      <div className="text-xs font-semibold">{axisLabel}</div>
      <div className="mt-1.5 overflow-x-auto">
        <div className="flex flex-nowrap gap-1.5 pb-1">
          {variants.map((variant) => {
            const isSel = variant.variant_id === selectedId;
            const swatchHex = variant.swatch?.hex || null;
            const swatchImg = variant.label_image_url || null;
            const hasSwatch = Boolean(swatchHex || swatchImg);
            return (
              <button
                key={variant.variant_id}
                type="button"
                aria-pressed={isSel}
                onClick={() => onChange(variant.variant_id)}
                className={cn(
                  'flex min-h-8 flex-shrink-0 items-center gap-1.5 rounded-md border bg-card text-xs text-foreground transition-colors',
                  hasSwatch ? 'px-2 py-1.5' : 'px-3 py-1',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                  isSel
                    ? 'border-muted-foreground/50 text-foreground font-semibold'
                    : 'border-border hover:bg-muted/30 hover:border-muted-foreground/40',
                )}
              >
                {hasSwatch ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'h-4 w-4 flex-shrink-0 overflow-hidden rounded-full border bg-muted',
                      isSel ? 'border-muted-foreground/50' : 'border-border',
                    )}
                    style={{
                      backgroundColor: swatchHex || undefined,
                      backgroundImage: swatchImg ? `url("${swatchImg}")` : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  />
                ) : null}
                <span>{getDisplayVariantLabel(variant)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
