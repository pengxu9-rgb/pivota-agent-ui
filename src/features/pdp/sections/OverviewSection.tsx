'use client';

import Image from 'next/image';
import type { OverviewContent } from '@/features/pdp/utils/overviewContent';
import { shouldUseUnoptimizedPdpImage } from '@/features/pdp/utils/pdpImageUrls';

type OverviewImage = {
  url: string;
  alt?: string;
};

function splitSentences(value: string): string[] {
  return String(value || '')
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 12);
}

export function OverviewSection({
  content,
  heading = 'Overview',
  image,
}: {
  content: OverviewContent | null;
  heading?: string;
  image?: OverviewImage | null;
}) {
  if (!content) return null;

  const summarySentences = splitSentences(content.summary);
  const shouldSegmentSummary =
    summarySentences.length > 1 &&
    content.highlights.length === 0 &&
    content.facts.length === 0 &&
    content.body.length === 0;
  const displaySummary = shouldSegmentSummary ? summarySentences[0] : content.summary;
  const summarySegments = shouldSegmentSummary ? summarySentences.slice(1, 5) : [];
  const hasSummary = Boolean(displaySummary);
  const hasHighlights = content.highlights.length > 0;
  const hasFacts = content.facts.length > 0;
  const hasBody = content.body.length > 0;
  const hasSummarySegments = summarySegments.length > 0;

  if (!hasSummary && !hasSummarySegments && !hasHighlights && !hasFacts && !hasBody) return null;

  return (
    <section className="border-t border-border/70 py-5">
      <div className={image?.url ? 'grid gap-4 sm:grid-cols-[minmax(0,1fr)_168px] sm:items-start' : ''}>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{heading}</h3>
            {content.eyebrow ? (
              <span className="rounded border border-border/70 bg-background/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {content.eyebrow}
              </span>
            ) : null}
          </div>

          {hasSummary ? (
            <p className="mt-3 text-sm leading-6 text-foreground/90">
              {displaySummary}
            </p>
          ) : null}

          {hasSummarySegments ? (
            <div className="mt-4 divide-y divide-border/60 border-y border-border/60">
              {summarySegments.map((item, idx) => (
                <p key={`${item}-${idx}`} className="py-2.5 text-sm leading-5 text-muted-foreground">
                  {item}
                </p>
              ))}
            </div>
          ) : null}

          {hasHighlights ? (
            <div className="mt-4 divide-y divide-border/60 border-y border-border/60">
              {content.highlights.map((item, idx) => (
                <p key={`${item}-${idx}`} className="py-2.5 text-sm leading-5 text-muted-foreground">
                  {item}
                </p>
              ))}
            </div>
          ) : null}

          {hasFacts ? (
            <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-border/60 pt-4 sm:grid-cols-2">
              {content.facts.map((item, idx) => (
                <div key={`${item.label}-${idx}`} className="space-y-1">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {item.label}
                  </dt>
                  <dd className="text-sm leading-5 text-foreground/90">{item.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {hasBody ? (
            <div className="mt-4 space-y-2 border-t border-border/60 pt-4">
              {content.body.map((paragraph, idx) => (
                <p key={`${paragraph}-${idx}`} className="text-sm leading-6 text-muted-foreground">
                  {paragraph}
                </p>
              ))}
            </div>
          ) : null}
        </div>

        {image?.url ? (
          <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-muted">
            <Image
              src={image.url}
              alt={image.alt || ''}
              fill
              className="object-cover pointer-events-none"
              sizes="(max-width: 640px) 100vw, 168px"
              loading="lazy"
              unoptimized={shouldUseUnoptimizedPdpImage(image.url)}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
