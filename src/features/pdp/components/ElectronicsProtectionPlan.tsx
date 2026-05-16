'use client';

/**
 * ElectronicsProtectionPlan
 *
 * "Add protection" section — list of cards (No coverage / AppleCare+ /
 * AppleCare+ Theft & Loss / SquareTrade plans). Each card has a radio dot,
 * label, optional "Most popular" badge, sub-copy, and price ("Free" or
 * "+$N").
 */

import { cn } from '@/lib/utils';

export type ProtectionPlan = {
  id: string;
  label: string;
  price: number;     // 0 for "No coverage"
  sub: string;       // "3 years · accident protection · $99 screen repair"
  popular?: boolean;
};

export function ElectronicsProtectionPlan({
  plans,
  selectedId,
  onSelect,
  title = 'Add protection',
  optionalLabel = 'Optional · cancel anytime',
}: {
  plans: ProtectionPlan[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  title?: string;
  optionalLabel?: string;
}) {
  return (
    <section className="px-[18px] pt-5">
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </span>
        <span className="text-[11px] text-muted-foreground">{optionalLabel}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {plans.map((p) => {
          const isSel = p.id === selectedId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              aria-pressed={isSel}
              className={cn(
                'flex items-start gap-3 rounded-xl border-[1.5px] px-3.5 py-3 text-left transition-colors',
                isSel ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/40',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2',
                  isSel ? 'border-primary' : 'border-muted-foreground/40',
                )}
                aria-hidden
              >
                {isSel ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
              </span>
              <div className="flex-1">
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <span className="text-[14px] font-semibold text-foreground">{p.label}</span>
                  {p.popular ? (
                    <span className="rounded bg-[hsl(var(--accent,38_60%_90%))] px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em] text-[hsl(var(--accent-foreground,38_60%_30%))]">
                      Most popular
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{p.sub}</div>
              </div>
              <div className="shrink-0 text-[13px] font-semibold text-foreground">
                {p.price === 0 ? 'Free' : `+$${p.price.toLocaleString()}`}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
