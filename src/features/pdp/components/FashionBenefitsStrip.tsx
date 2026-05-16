'use client';

/**
 * FashionBenefitsStrip
 *
 * 4-up icon + label row in a brand-tint card. Labels come from
 * fashion_meta.benefits[]; each label is 1-2 words. The strip is purely
 * decorative — values come from the catalog payload, never fabricated.
 *
 * Icons are picked from a small allow-list keyed off the label text:
 *   Push-up · Plus M-XXXL · OEKO-TEX · 30-day return · Free shipping
 *
 * Falls back to a generic shirt icon for anything unrecognised.
 */

import { Shirt, Ruler, Leaf, Repeat, Truck } from 'lucide-react';

function iconFor(label: string): typeof Shirt {
  const l = label.toLowerCase();
  if (l.includes('ruler') || l.includes('size') || l.includes('plus') || l.includes('xs') || l.includes('xl')) return Ruler;
  if (l.includes('oeko')   || l.includes('eco')   || l.includes('sustain'))  return Leaf;
  if (l.includes('return') || l.includes('exchange'))                         return Repeat;
  if (l.includes('ship'))                                                      return Truck;
  return Shirt;
}

export function FashionBenefitsStrip({ benefits }: { benefits: string[] }) {
  if (!benefits?.length) return null;
  return (
    <section className="px-[18px] pt-4">
      <div className="flex gap-0 rounded-xl bg-primary/10 p-1">
        {benefits.slice(0, 4).map((label) => {
          const Icon = iconFor(label);
          return (
            <div
              key={label}
              className="flex flex-1 flex-col items-center gap-1 p-2.5 text-[hsl(var(--accent-ink,168_60%_22%))] text-primary"
            >
              <Icon className="h-4 w-4" strokeWidth={1.8} />
              <div className="text-center text-[10px] font-semibold leading-tight tracking-wide text-primary">
                {label}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
