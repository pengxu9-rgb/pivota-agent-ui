'use client';

import Image from 'next/image';
import type { Variant } from '@/features/pdp/types';
import { getDisplayVariantLabel, getDisplayableVariantOptions } from '@/features/pdp/utils/variantLabels';
import { shouldBypassNextImageOptimizer } from '@/features/pdp/utils/pdpImageUrls';
import { cn } from '@/lib/utils';

/**
 * Variant selector for the Beauty PDP — used for non-shade / non-size
 * variant axes (Format, Refill, …) that the dedicated BeautyShadeSelector /
 * BeautySizeSelector don't cover.
 *
 * The Claude Design handoff has no spec for a generic-axis selector, so this
 * is derived in the same Beauty visual language as BeautySizeSelector:
 * uppercase eyebrow + option cards, selected = white fill + 1.5px foreground
 * border. It replaces the generic production `VariantSelector` (teal pill +
 * ring) on the beauty tree so non-shade/size variants stop visually
 * diverging from the rest of the redesign.
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
    <div className="px-[18px] pt-2.5">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {axisLabel}
      </div>
      <div className="flex flex-wrap gap-2">
        {variants.map((variant) => {
          const isSel = variant.variant_id === selectedId;
          const thumb = variant.label_image_url || null;
          return (
            <button
              key={variant.variant_id}
              type="button"
              onClick={() => onChange(variant.variant_id)}
              aria-pressed={isSel}
              className={cn(
                'flex items-center gap-2 rounded-[10px] border-[1.5px] px-3 py-2 text-left',
                isSel ? 'border-foreground bg-white' : 'border-border bg-transparent',
              )}
            >
              {thumb ? (
                <span className="relative h-5 w-5 flex-shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border">
                  <Image
                    src={thumb}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="20px"
                    loading="lazy"
                    unoptimized={shouldBypassNextImageOptimizer(thumb)}
                  />
                </span>
              ) : variant.swatch?.hex ? (
                <span
                  className="h-5 w-5 flex-shrink-0 rounded-md ring-1 ring-border"
                  style={{ backgroundColor: variant.swatch.hex }}
                />
              ) : null}
              <span className="text-[13px] font-semibold text-foreground">
                {getDisplayVariantLabel(variant)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
