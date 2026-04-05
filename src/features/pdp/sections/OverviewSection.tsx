'use client';

import type { OverviewContent } from '@/features/pdp/utils/overviewContent';

export function OverviewSection({
  content,
  heading = 'Overview',
}: {
  content: OverviewContent | null;
  heading?: string;
}) {
  if (!content) return null;

  const hasSummary = Boolean(content.summary);
  const hasHighlights = content.highlights.length > 0;
  const hasFacts = content.facts.length > 0;
  const hasBody = content.body.length > 0;

  if (!hasSummary && !hasHighlights && !hasFacts && !hasBody) return null;

  return (
    <section className="rounded-2xl border border-border bg-card/70 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{heading}</h3>
        {content.eyebrow ? (
          <span className="rounded-full border border-border/70 bg-background/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {content.eyebrow}
          </span>
        ) : null}
      </div>

      {hasSummary ? (
        <p className="mt-3 text-sm leading-6 text-foreground/90">
          {content.summary}
        </p>
      ) : null}

      {hasHighlights ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {content.highlights.map((item, idx) => (
            <div
              key={`${item}-${idx}`}
              className="rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-sm leading-5 text-muted-foreground"
            >
              {item}
            </div>
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
    </section>
  );
}
