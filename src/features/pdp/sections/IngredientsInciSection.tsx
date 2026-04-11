'use client';

import { useState } from 'react';
import type { IngredientsInciData } from '@/features/pdp/types';
import { PdpSourceBadge } from '@/features/pdp/sections/PdpSourceBadge';
import { cn } from '@/lib/utils';

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
  const [expanded, setExpanded] = useState(false);
  const items = Array.isArray(data.items)
    ? data.items.map((item) => normalizeStructuredItemLabel(item)).filter(Boolean)
    : [];
  const ingredientText = String(data.raw_text || '').trim() || items.join(', ');
  if (!ingredientText) return null;

  return (
    <div className="border-t border-muted/60 px-2.5 py-5 sm:px-3">
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
      <div className="mt-3 rounded-2xl border border-border bg-card/70 px-3 py-3">
        <p
          className={cn(
            'text-sm leading-relaxed text-muted-foreground',
            expanded ? 'whitespace-pre-line' : 'line-clamp-3',
          )}
        >
          {ingredientText}
        </p>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-3 text-xs font-medium text-primary hover:underline"
        >
          {expanded ? 'Hide full INCI' : 'Show full INCI'}
        </button>
      </div>
    </div>
  );
}
