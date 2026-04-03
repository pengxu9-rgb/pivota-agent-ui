'use client';

import type { IngredientsInciData } from '@/features/pdp/types';
import { PdpSourceBadge } from '@/features/pdp/sections/PdpSourceBadge';

function normalizeStructuredItemLabel(item: unknown): string {
  if (typeof item === 'string') return item.trim();
  if (!item || typeof item !== 'object') return '';
  const typed = item as Record<string, unknown>;
  const primary =
    String(typed.name || typed.title || typed.inci_name || typed.value || '').trim();
  const suffix = [typed.concentration, typed.description, typed.detail, typed.benefit]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' - ');
  if (!primary) return suffix;
  if (!suffix) return primary;
  return `${primary} - ${suffix}`;
}

export function IngredientsInciSection({ data }: { data: IngredientsInciData }) {
  const items = Array.isArray(data.items)
    ? data.items.map((item) => normalizeStructuredItemLabel(item)).filter(Boolean)
    : [];
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
      <p className="mt-1 text-xs text-muted-foreground">
        Full ingredient list (INCI) when available.
      </p>
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
