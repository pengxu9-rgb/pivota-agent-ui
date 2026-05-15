'use client';

/**
 * Shade swatch selector for the Beauty mobile PDP.
 * Faithful to redesign/pivota-pdp.jsx → ShadeSelector:
 *   "SHADE · {name}" eyebrow + "Find my shade →" link, then a horizontal
 *   scroll strip of 44px circular swatches — the selected one gets a
 *   double ring (2px background gap + 4px primary) and a check mark,
 *   with the shade number labelled below.
 */

export type BeautyShade = { id: string; name: string; hex: string };

function isLightHex(hex: string): boolean {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2) || '0', 16);
  return r > 160;
}

export function BeautyShadeSelector({
  shades,
  selectedId,
  onSelect,
  onFindShade,
}: {
  shades: BeautyShade[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onFindShade?: () => void;
}) {
  if (!shades?.length) return null;
  const selected = shades.find((s) => s.id === selectedId) || shades[0];

  return (
    <div className="pt-2.5">
      <div className="flex items-baseline justify-between px-[18px]">
        <div>
          {/* Label font matches the product-line / variant selectors
              (text-xs font-semibold) so every variant-axis selector reads
              consistently — owner flagged the shade/size eyebrow as off. */}
          <span className="text-xs font-semibold text-foreground">Shade ·{' '}</span>
          <span className="text-xs font-semibold text-foreground">{selected.name}</span>
        </div>
        {onFindShade ? (
          <button type="button" onClick={onFindShade} className="text-[12px] font-medium text-primary">
            Find my shade →
          </button>
        ) : null}
      </div>

      <div className="flex gap-3 overflow-x-auto px-[18px] pb-1.5 pt-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {shades.map((s) => {
          const isSel = s.id === selected.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              aria-pressed={isSel}
              aria-label={`Shade ${s.name}`}
              className="flex flex-shrink-0 flex-col items-center gap-1"
            >
              <span
                className="relative h-11 w-11 rounded-full transition-all duration-200"
                style={{
                  background: s.hex,
                  boxShadow: isSel
                    ? '0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--primary)), var(--shadow-sm)'
                    : '0 0 0 1px rgba(0,0,0,0.08), var(--shadow-sm)',
                }}
              >
                {isSel ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 flex items-center justify-center"
                    style={{ color: isLightHex(s.hex) ? '#000' : '#fff' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                ) : null}
              </span>
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
