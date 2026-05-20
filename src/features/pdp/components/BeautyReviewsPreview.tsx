'use client';

/**
 * Reviews accordion content for the Beauty mobile PDP.
 *
 * Always renders — the parent should mount this component regardless of
 * `reviews.length`. When the list is empty we render the compact
 * empty-state body (single tile with a copy + "Write a review" CTA) so the
 * shopper has a clear, low-friction path to post the first review without
 * the section disappearing from the page.
 *
 * Faithful to redesign/pivota-pdp.jsx → ReviewsPreview when reviews exist:
 * big serif rating number + gold stars + "N verified reviews" header,
 * then review cards, then a bordered "See all N reviews" button.
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

function Sparkle() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6L12 2z" />
    </svg>
  );
}

export function BeautyReviewsPreview({
  rating,
  reviewCount,
  reviews,
  emptyCopy = 'No reviews yet. Be the first to share your shade + skin notes — your review appears here once verified.',
  onWriteReview,
  onSeeAll,
}: {
  rating: number;
  reviewCount: number;
  reviews: BeautyReviewItem[];
  /** Copy shown in the empty-state body when reviews list is empty. */
  emptyCopy?: string;
  /** Click handler for the "Write a review" CTA in both populated and empty states. */
  onWriteReview?: () => void;
  onSeeAll?: () => void;
}) {
  // ── Empty state ──────────────────────────────────────────────────────────
  // Section header is rendered by the parent (BeautyAccordion title="Reviews").
  // Brand-Kit v2 (handoff §3f): the empty-state CTA is the same filled-dark
  // "Write a review" button as the populated-state primary action.
  if (!reviews?.length) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-3.5 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkle />
        </div>
        <p className="flex-1 text-[13px] leading-relaxed text-foreground">{emptyCopy}</p>
        {onWriteReview ? (
          <button
            type="button"
            onClick={onWriteReview}
            className="shrink-0 whitespace-nowrap rounded-lg border border-foreground bg-foreground px-3.5 py-2 text-[12px] font-semibold text-background"
          >
            Write a review
          </button>
        ) : null}
      </div>
    );
  }

  // ── Populated state — read first, act second (handoff §3f) ──────────────
  // Action CTAs ("See all reviews" outline + "Write a review" filled dark)
  // sit BELOW the reviews list, not in the section header. Users read the
  // social proof first, then choose to contribute.
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

      {onSeeAll || onWriteReview ? (
        <div className="mt-1 flex gap-2">
          {onSeeAll ? (
            <button
              type="button"
              onClick={onSeeAll}
              className="flex-1 rounded-lg border border-border bg-transparent px-3 py-2.5 text-[13px] font-semibold text-foreground"
            >
              See all {reviewCount.toLocaleString()} reviews
            </button>
          ) : null}
          {onWriteReview ? (
            <button
              type="button"
              onClick={onWriteReview}
              className="flex-1 rounded-lg border border-foreground bg-foreground px-3 py-2.5 text-[13px] font-semibold text-background"
            >
              Write a review
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
