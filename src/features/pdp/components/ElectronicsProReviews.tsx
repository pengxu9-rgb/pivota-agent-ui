'use client';

/**
 * ElectronicsProReviews
 *
 * Curated press reviews (Wirecutter, The Verge, RTings…) with a score
 * badge and external-link icon. Two layouts:
 *   - 'list' (default, mobile) — vertical list of horizontal cards
 *   - 'grid' (desktop) — 3-up cards with verdict text wrapping
 */

import { Award, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ProReview = {
  source: string;   // 'Wirecutter'
  verdict: string;  // 'Our pick — best laptop for most people'
  score: string;    // '9/10' | '92/100' | '4.5/5'
  url: string;
};

export function ElectronicsProReviews({
  reviews,
  layout = 'list',
  title = 'What pros said',
}: {
  reviews: ProReview[];
  layout?: 'list' | 'grid';
  title?: string;
}) {
  if (!reviews?.length) return null;
  if (layout === 'grid') {
    return (
      <section>
        <h3 className="mb-3 font-serif text-[22px] font-medium tracking-tight text-foreground">
          {title}
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((r) => (
            <a
              key={r.source}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-4 text-foreground hover:border-primary/40"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Monogram source={r.source} />
                  <div className="text-[12px] font-semibold text-muted-foreground">{r.source}</div>
                </div>
                <div className="rounded bg-muted px-2 py-0.5 font-mono text-[12px] font-bold text-foreground">
                  {r.score}
                </div>
              </div>
              <p className="flex-1 text-[13px] leading-snug text-foreground">{r.verdict}</p>
              <div className="inline-flex items-center gap-1 text-[11px] text-primary">
                Read review <ExternalLink className="h-3 w-3" />
              </div>
            </a>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="px-[18px] pt-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-serif text-[22px] font-medium tracking-tight text-foreground">
          {title}
        </h3>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Award className="h-3 w-3" /> {reviews.length} sources
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {reviews.map((r) => (
          <a
            key={r.source}
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 text-foreground hover:border-primary/40"
          >
            <Monogram source={r.source} />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold tracking-wide text-muted-foreground">{r.source}</div>
              <div className="mt-px line-clamp-2 text-[13px] leading-snug text-foreground">{r.verdict}</div>
            </div>
            <div className="shrink-0 rounded bg-muted px-2 py-0.5 font-mono text-[13px] font-bold text-foreground">
              {r.score}
            </div>
            <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
          </a>
        ))}
      </div>
    </section>
  );
}

function Monogram({ source }: { source: string }) {
  const ch = (source || '?').trim().charAt(0).toUpperCase();
  return (
    <div className={cn(
      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background',
      'font-serif text-[14px] font-semibold text-foreground',
    )}>
      {ch}
    </div>
  );
}
