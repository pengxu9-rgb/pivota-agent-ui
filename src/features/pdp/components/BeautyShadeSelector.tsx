'use client';

import { cn } from '@/lib/utils';

/**
 * Shade swatch selector for the Beauty mobile PDP.
 * Faithful to redesign/pivota-pdp.jsx → ShadeSelector:
 *   "SHADE · {name}" eyebrow + "Find my shade →" link, then a horizontal
 *   scroll strip of 44px circular swatches when a trusted visual exists.
 *   Without a trusted swatch/hex, render a compact text chip instead of a
 *   fake gray color.
 */

export type BeautyShade = { id: string; name: string; hex?: string; imageUrl?: string };

function normalizeHex(hex: string | undefined): string | undefined {
  const h = String(hex || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) {
    return `#${h
      .split('')
      .map((part) => `${part}${part}`)
      .join('')}`.toLowerCase();
  }
  if (/^[0-9a-f]{6}$/i.test(h)) return `#${h}`.toLowerCase();
  return undefined;
}

function isLightHex(hex: string | undefined): boolean {
  const h = String(normalizeHex(hex) || '#cccccc').replace('#', '');
  const r = parseInt(h.slice(0, 2) || '0', 16);
  return r > 160;
}

function shadeChipLabel(name: string): string {
  const cleaned = String(name || '').trim();
  if (!cleaned) return 'Shade';
  const firstToken = cleaned.split(/\s+/)[0] || cleaned;
  return firstToken.length <= 5 ? firstToken : firstToken.slice(0, 5);
}

export function BeautyShadeSelector({
  shades,
  selectedId,
  onSelect,
  onFindShade,
  axisLabel = 'Shade',
  findActionLabel = 'Find my shade →',
}: {
  shades: BeautyShade[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onFindShade?: () => void;
  /** Eyebrow label for the variant axis. Defaults to "Shade" (beauty); pass "Color" for fashion. */
  axisLabel?: string;
  findActionLabel?: string;
}) {
  if (!shades?.length) return null;
  const selected = shades.find((s) => s.id === selectedId) || shades[0];

  return (
    <div className="pt-2.5">
      <div className="flex items-baseline justify-between px-4">
        <div>
          {/* Label font matches the product-line / variant selectors
              (text-xs font-semibold) so every variant-axis selector reads
              consistently — owner flagged the shade/size eyebrow as off. */}
          <span className="text-xs font-semibold text-foreground">{axisLabel} ·{' '}</span>
          <span className="text-xs font-semibold text-foreground">{selected.name}</span>
        </div>
        {onFindShade ? (
          <button type="button" onClick={onFindShade} className="text-[12px] font-medium text-primary">
            {findActionLabel}
          </button>
        ) : null}
      </div>

      <div className="flex gap-3 overflow-x-auto px-4 pb-1.5 pt-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {shades.map((s) => {
          const isSel = s.id === selected.id;
          const visualHex = normalizeHex(s.hex);
          const hasVisual = Boolean(s.imageUrl || visualHex);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              aria-pressed={isSel}
              aria-label={`${axisLabel} ${s.name}`}
              className="flex flex-shrink-0 flex-col items-center gap-1"
            >
              {hasVisual ? (
                <span
                  className="relative h-11 w-11 rounded-full transition-all duration-200"
                  style={{
                    backgroundColor: visualHex,
                    backgroundImage: s.imageUrl ? `url("${s.imageUrl}")` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    boxShadow: isSel
                      ? '0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--primary)), var(--shadow-sm)'
                      : '0 0 0 1px rgba(0,0,0,0.08), var(--shadow-sm)',
                  }}
                >
                  {isSel ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 flex items-center justify-center"
                      style={{
                        color: s.imageUrl ? '#fff' : isLightHex(visualHex) ? '#000' : '#fff',
                        filter: s.imageUrl ? 'drop-shadow(0 1px 1px rgba(0,0,0,0.65))' : undefined,
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                  ) : null}
                </span>
              ) : (
                <span
                  className={cn(
                    'flex h-11 min-w-11 max-w-[68px] items-center justify-center rounded-full border px-2 text-[10px] font-semibold transition-all duration-200',
                    isSel
                      ? 'border-primary bg-primary/5 text-foreground shadow-[0_0_0_2px_hsl(var(--background)),0_0_0_4px_hsl(var(--primary)),var(--shadow-sm)]'
                      : 'border-border bg-white text-muted-foreground shadow-sm',
                  )}
                >
                  <span className="max-w-[48px] truncate">{shadeChipLabel(s.name)}</span>
                </span>
              )}
              <span
                className={
                  isSel
                    ? 'text-[10px] font-medium text-foreground'
                    : 'text-[10px] font-medium text-[hsl(0_0%_60%)]'
                }
              >
                {s.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
