'use client';

import type { SizeGuide } from '@/features/pdp/types';

export function GenericSizeGuide({ sizeGuide }: { sizeGuide?: SizeGuide }) {
  if (!sizeGuide || !sizeGuide.columns.length || !sizeGuide.rows.length) {
    return (
      <div className="p-3">
        <h2 className="text-xs font-semibold mb-2">Size Guide</h2>
        <div className="rounded-lg border border-dashed border-border bg-card px-3 py-3 text-xs text-muted-foreground">
          No size guide provided for this product.
        </div>
      </div>
    );
  }

  return (
    <div className="p-3">
      <h2 className="text-xs font-semibold mb-2">Size Guide</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border border-border rounded-lg overflow-hidden">
          <thead className="bg-muted">
            <tr>
              <th className="px-2 py-1.5 text-left">Size</th>
              {sizeGuide.columns.map((col) => (
                <th key={col} className="px-2 py-1.5 text-center">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sizeGuide.rows.map((row) => (
              <tr key={row.label}>
                <td className="px-2 py-1.5 font-medium">{row.label}</td>
                {sizeGuide.columns.map((col, idx) => (
                  <td key={`${row.label}-${col}`} className="px-2 py-1.5 text-center">
                    {row.values[idx] || '--'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        {sizeGuide.note || '* All measurements in inches'}
      </p>

      {sizeGuide.model_info ? (
        <div className="mt-3 p-3 bg-muted/50 rounded-lg">
          <p className="text-[11px] text-muted-foreground">{sizeGuide.model_info}</p>
        </div>
      ) : null}
    </div>
  );
}
