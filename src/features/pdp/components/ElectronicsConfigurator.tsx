'use client';

/**
 * ElectronicsConfigurator
 *
 * One configurator group (Memory / Storage / CPU tier / etc) — a vertical
 * list of radio-style cards. Each card shows option label + `+$delta`
 * (or "Included" when delta === 0). Selecting fires `onSelect` with the
 * option id; the container owns selection state and computes the total.
 */

import { cn } from '@/lib/utils';

export type ConfiguratorOption = {
  id: string;
  label: string;
  delta: number;     // $ delta vs base price
  disabled?: boolean;
};

export type ConfiguratorGroup = {
  id: string;        // 'memory' | 'storage' | …
  label: string;     // 'Memory'
  options: ConfiguratorOption[];
  help_url?: string | null;
  help_label?: string | null;  // defaults to "How much do I need? →"
};

export function ElectronicsConfigurator({
  group,
  selectedId,
  onSelect,
}: {
  group: ConfiguratorGroup;
  selectedId: string | null | undefined;
  onSelect: (optionId: string) => void;
}) {
  return (
    <section className="px-[18px] pt-4">
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {group.label}
        </span>
        {group.help_url ? (
          <a href={group.help_url} className="text-[11px] font-medium text-primary hover:underline">
            {group.help_label || 'How much do I need? →'}
          </a>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        {group.options.map((opt) => {
          const isSel = opt.id === selectedId;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => !opt.disabled && onSelect(opt.id)}
              aria-pressed={isSel}
              disabled={opt.disabled}
              className={cn(
                'flex items-center gap-3 rounded-xl border-[1.5px] px-3.5 py-3 text-left transition-colors',
                isSel
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card hover:border-primary/40',
                opt.disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              <span
                className={cn(
                  'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2',
                  isSel ? 'border-primary' : 'border-muted-foreground/40',
                )}
                aria-hidden
              >
                {isSel ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
              </span>
              <span className="flex-1 text-[14px] font-semibold text-foreground">{opt.label}</span>
              <span
                className={cn(
                  'shrink-0 text-[13px] font-semibold',
                  opt.delta === 0 ? 'text-muted-foreground' : 'text-foreground',
                )}
              >
                {opt.delta === 0 ? 'Included' : `+$${opt.delta.toLocaleString()}`}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
