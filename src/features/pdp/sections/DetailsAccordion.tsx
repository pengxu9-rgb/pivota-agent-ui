import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ProductDetailsData } from '@/features/pdp/types';
import { cn } from '@/lib/utils';

export function DetailsAccordion({ data }: { data: ProductDetailsData }) {
  const [open, setOpen] = useState<Set<number>>(() => new Set());

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {data.sections.map((s, idx) => {
        const isOpen = open.has(idx);
        return (
          <div key={`${s.heading}-${idx}`} className="border-b border-border last:border-b-0">
            <button
              onClick={() =>
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (next.has(idx)) next.delete(idx);
                  else next.add(idx);
                  return next;
                })
              }
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/20"
            >
              <span className="text-sm font-semibold">{s.heading}</span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform',
                  isOpen ? 'rotate-180' : '',
                )}
              />
            </button>
            {isOpen ? (
              <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {s.content}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
