'use client';

/**
 * ElectronicsInTheBox
 *
 * "What's in the box" list — bullets with check-mark dots. Each item is a
 * single line of plain text from the payload (electronics_meta.in_box[]).
 */

import { Check } from 'lucide-react';

export function ElectronicsInTheBox({
  items,
  title = "What's in the box",
}: {
  items: string[];
  title?: string;
}) {
  if (!items?.length) return null;
  return (
    <section className="px-[18px] pt-6">
      <h3 className="mb-3 text-[14px] font-semibold text-foreground">{title}</h3>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {items.map((item, i) => (
          <div
            key={`${item}-${i}`}
            className={`flex items-center gap-3 px-3.5 py-3 ${i ? 'border-t border-border' : ''}`}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            <span className="text-[13px] leading-snug text-foreground">{item}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
