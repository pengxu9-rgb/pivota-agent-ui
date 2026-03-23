'use client';

import type { IngredientsInciData } from '@/features/pdp/types';
import { PdpSourceBadge } from '@/features/pdp/sections/PdpSourceBadge';

export function IngredientsInciSection({ data }: { data: IngredientsInciData }) {
  const items = Array.isArray(data.items) ? data.items.filter(Boolean) : [];
  if (!items.length && !data.raw_text) return null;

  return (
    <div className="px-3 py-5 border-t border-muted/60">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{data.title || 'Ingredients'}</h3>
        <PdpSourceBadge
          sourceOrigin={data.source_origin}
          sourceQualityStatus={data.source_quality_status}
        />
      </div>
      {data.raw_text ? (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
          {data.raw_text}
        </p>
      ) : null}
      {!data.raw_text && items.length ? (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{items.join(', ')}</p>
      ) : null}
    </div>
  );
}
