'use client';

/**
 * Product header for the Beauty mobile PDP.
 * Faithful to redesign/pivota-pdp.jsx → ProductHeader:
 *   teal uppercase brand eyebrow, serif title (Cormorant Garamond), 13px
 *   muted subtitle, then a rating row — gold stars + rating + count + a
 *   right-aligned "See reviews →" link.
 *
 * Title size and section padding are tightened from the design spec so
 * more info sits above the fold on first paint (owner request).
 */

function Star() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export function BeautyProductHeader({
  brand,
  title,
  subtitle,
  rating,
  reviewCount,
  onSeeReviews,
}: {
  brand?: string | null;
  title: string;
  subtitle?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  onSeeReviews?: () => void;
}) {
  return (
    <div className="px-4 pt-2.5">
      {brand ? (
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
          {brand}
        </div>
      ) : null}
      <h1 className="mt-1 mb-0.5 font-serif text-[22px] font-medium leading-[1.15] tracking-[-0.01em] text-foreground">
        {title}
      </h1>
      {subtitle ? (
        <div className="text-[12.5px] leading-[1.4] text-muted-foreground">{subtitle}</div>
      ) : null}

      {typeof rating === 'number' && rating > 0 ? (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex gap-px text-[hsl(var(--gold))]">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} />
            ))}
          </div>
          <span className="text-[13px] font-semibold text-foreground">{rating.toFixed(1)}</span>
          {typeof reviewCount === 'number' && reviewCount > 0 ? (
            <span className="text-[13px] text-muted-foreground">({reviewCount.toLocaleString()})</span>
          ) : null}
          {onSeeReviews ? (
            <button
              type="button"
              onClick={onSeeReviews}
              className="ml-auto text-[13px] font-medium text-primary"
            >
              See reviews →
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
