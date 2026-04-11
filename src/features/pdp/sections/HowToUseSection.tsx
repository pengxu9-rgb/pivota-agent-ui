'use client';

import type { HowToUseData } from '@/features/pdp/types';
import { PdpSourceBadge } from '@/features/pdp/sections/PdpSourceBadge';

export function HowToUseSection({ data }: { data: HowToUseData }) {
  const steps = Array.isArray(data.steps) ? data.steps.filter(Boolean) : [];
  if (!steps.length && !data.raw_text) return null;

  return (
    <div className="border-t border-muted/60 px-2.5 py-5 sm:px-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{data.title || 'How to use'}</h3>
        <PdpSourceBadge sourceOrigin={data.source_origin} />
      </div>
      {steps.length ? (
        <ol className="mt-3 space-y-2">
          {steps.map((step, index) => (
            <li key={`${step}-${index}`} className="flex gap-3 text-sm text-muted-foreground">
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
                {index + 1}
              </span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {!steps.length && data.raw_text ? (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
          {data.raw_text}
        </p>
      ) : null}
    </div>
  );
}
