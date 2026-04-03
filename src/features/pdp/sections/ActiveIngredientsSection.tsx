'use client';

import type { ActiveIngredientsData } from '@/features/pdp/types';
import { PdpSourceBadge } from '@/features/pdp/sections/PdpSourceBadge';

export function ActiveIngredientsSection({ data }: { data: ActiveIngredientsData }) {
  const items = Array.isArray(data.items) ? data.items.filter(Boolean) : [];
  if (!items.length && !data.raw_text) return null;

  return (
    <div className="px-3 py-5 border-t border-muted/60">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{data.title || 'Active ingredients'}</h3>
        <PdpSourceBadge
          sourceOrigin={data.source_origin}
          sourceQualityStatus={data.source_quality_status}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Highlighted actives or hero ingredients, not the full formula.
      </p>
      {items.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item, index) => (
            <span
              key={`${item}-${index}`}
              className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-foreground"
            >
              {item}
            </span>
          ))}
        </div>
      ) : null}
      {data.raw_text ? (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
          {data.raw_text}
        </p>
      ) : null}
    </div>
  );
}
