'use client';

/**
 * Reviews accordion content for the Beauty mobile PDP.
 * Faithful to redesign/pivota-pdp.jsx → ReviewsPreview:
 *   a big serif rating number + gold stars + "N verified reviews" header,
 *   then review cards (name + per-review stars + title + body), then a
 *   bordered "See all N reviews" button.
 */

export type BeautyReviewItem = {
  name: string;
  rating: number;
  title?: string | null;
  body?: string | null;
};

function Star({ filled = true }: { filled?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ opacity: filled ? 1 : 0.2 }}
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export function BeautyReviewsPreview({
  rating,
  reviewCount,
  reviews,
  onSeeAll,
}: {
  rating: number;
  reviewCount: number;
  reviews: BeautyReviewItem[];
  onSeeAll?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 border-b border-border pb-3 pt-2">
        <div className="font-serif text-[40px] font-semibold leading-none text-foreground">
          {rating.toFixed(1)}
        </div>
        <div className="flex-1">
          <div className="mb-1 flex gap-px text-[hsl(var(--gold))]">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} />
            ))}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {reviewCount.toLocaleString()} verified reviews
          </div>
        </div>
      </div>

      {reviews.map((rv, i) => (
        <div key={`${rv.name}-${i}`} className={i ? 'border-t border-border pt-3' : ''}>
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-foreground">{rv.name}</span>
            <div className="flex gap-px text-[hsl(var(--gold))]">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} filled={n <= rv.rating} />
              ))}
            </div>
          </div>
          {rv.title ? (
            <div className="mt-1 text-[13px] font-semibold text-foreground">{rv.title}</div>
          ) : null}
          {rv.body ? (
            <div className="mt-0.5 text-[13px] leading-[1.45] text-muted-foreground">{rv.body}</div>
          ) : null}
        </div>
      ))}

      {onSeeAll ? (
        <button
          type="button"
          onClick={onSeeAll}
          className="mt-1 rounded-lg border-[1.5px] border-border bg-transparent px-3.5 py-2.5 text-[13px] font-semibold text-foreground"
        >
          See all {reviewCount.toLocaleString()} reviews
        </button>
      ) : null}
    </div>
  );
}
