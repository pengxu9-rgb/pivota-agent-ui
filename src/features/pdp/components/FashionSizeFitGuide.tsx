'use client';

/**
 * FashionSizeFitGuide
 *
 * Bottom-sheet (mobile) / centred modal (desktop) that shows the weight-
 * based fit chart and the model line. Opens from a "Size + fit guide" link
 * underneath the size selector.
 *
 * Faithful to pdp-fashion-electronics/fashion-mobile.jsx → FashionSizeGuideDialog.
 */

import { useEffect } from 'react';
import { X, Scale } from 'lucide-react';
import { cn } from '@/lib/utils';

export type FashionFitChart = {
  columns: string[];                          // ['Weight', 'Bust'] etc — first column is the size label
  rows: { label: string; values: string[]; stock?: 'in' | 'low' | 'out' }[];
  note?: string | null;
  tip?: string | null;                        // "Between sizes? Size up. The push-up cup runs about half a cup smaller…"
};

export function FashionSizeFitGuide({
  open,
  onClose,
  chart,
  modelInfo,
  modelAvatar,
}: {
  open: boolean;
  onClose: () => void;
  chart: FashionFitChart;
  modelInfo?: string | null;
  modelAvatar?: string | null;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/55 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Size and fit guide"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-full max-w-[520px] overflow-hidden bg-card font-sans',
          'rounded-t-2xl sm:rounded-2xl',
          'max-h-[88vh] overflow-y-auto',
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-3">
          <div>
            <div className="font-serif text-[20px] font-medium tracking-tight text-foreground">
              Size + fit guide
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              Sized by weight range — refer to the chart below
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pb-6 pt-4">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="text-left">
                <th className="py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Size
                </th>
                {chart.columns.map((col) => (
                  <th key={col} className="py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chart.rows.map((row) => (
                <tr key={row.label} className="border-t border-border">
                  <td className="py-2.5 font-semibold text-foreground">{row.label}</td>
                  {row.values.map((v, i) => (
                    <td key={`${row.label}-${i}`} className="py-2.5 text-muted-foreground">{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {chart.tip ? (
            <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-primary/10 p-3">
              <Scale className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-[12px] leading-relaxed text-foreground">{chart.tip}</p>
            </div>
          ) : null}

          {chart.note ? (
            <p className="mt-3 text-[11px] text-muted-foreground">{chart.note}</p>
          ) : null}

          {modelInfo ? (
            <div className="mt-5">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Model
              </div>
              <div className="flex items-center gap-2.5">
                {modelAvatar ? (
                  <div
                    className="h-14 w-14 shrink-0 rounded-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${modelAvatar})` }}
                  />
                ) : null}
                <p className="text-[12.5px] leading-relaxed text-foreground">{modelInfo}</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
