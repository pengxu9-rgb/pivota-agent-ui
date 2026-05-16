'use client';

/**
 * FashionMaterialCare
 *
 * Three-row block — Material / Origin / Care — that lives between the
 * shipping strip and the recent-purchases section. Icons reuse lucide:
 * `Shirt` (material), `Globe` (origin), `Leaf` (care).
 */

import { Shirt, Globe, Leaf } from 'lucide-react';

export function FashionMaterialCare({
  material,
  origin,
  care,
}: {
  material?: string | null;
  origin?: string | null;
  care?: string | null;
}) {
  const rows: { Icon: typeof Shirt; label: string; value: string }[] = [];
  if (material) rows.push({ Icon: Shirt, label: 'Material', value: material });
  if (origin)   rows.push({ Icon: Globe, label: 'Origin',   value: origin });
  if (care)     rows.push({ Icon: Leaf,  label: 'Care',     value: care });
  if (!rows.length) return null;

  return (
    <section className="px-[18px] pt-5">
      <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Material &amp; care
      </div>
      <div className="flex flex-col gap-2.5">
        {rows.map(({ Icon, label, value }) => (
          <div key={label} className="flex items-start gap-2.5">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.8} />
            <div className="flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                {label}
              </div>
              <div className="mt-0.5 text-[13px] leading-snug text-foreground">{value}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
