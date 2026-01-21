'use client';

import { Star, ChevronRight } from 'lucide-react';
import type { ReviewsPreviewData } from '@/features/pdp/types';
import { cn } from '@/lib/utils';

function StarRating({ value }: { value: number }) {
  const rounded = Math.round(value);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            'h-3 w-3',
            i < rounded ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground',
          )}
        />
      ))}
    </div>
  );
}

export function BeautyReviewsSection({
  data,
  onWriteReview,
  onSeeAll,
  brandName,
  showEmpty = false,
}: {
  data: ReviewsPreviewData;
  onWriteReview?: () => void;
  onSeeAll?: () => void;
  brandName?: string;
  showEmpty?: boolean;
}) {
  const hasSummary = data.review_count > 0 && data.rating > 0;
  const ratingValue = data.scale ? (data.rating / data.scale) * 5 : 0;
  const distribution = data.star_distribution?.map((item) => {
    const percent =
      item.percent ??
      (item.count && data.review_count ? item.count / data.review_count : 0);
    return { ...item, percent };
  });

  return (
    <div className="py-6">
      <div className="mx-4 rounded-2xl bg-card border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Reviews ({data.review_count})</h3>
          {onWriteReview ? (
            <button onClick={onWriteReview} className="text-xs font-medium text-primary">
              {data.entry_points?.write_review?.label || 'Write a review'}
            </button>
          ) : null}
        </div>

        {hasSummary ? (
          <div className="flex gap-6">
            <div className="text-center">
              <div className="text-4xl font-bold">{ratingValue.toFixed(1)}</div>
              <div className="flex gap-0.5 mt-1 justify-center">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{data.review_count} ratings</p>
            </div>

            {distribution?.length ? (
              <div className="flex-1 space-y-1.5">
                {distribution.slice(0, 5).map((dist) => (
                  <div key={dist.stars} className="flex items-center gap-2 text-xs">
                    <span className="w-3 text-muted-foreground">{dist.stars}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-yellow-400 rounded-full"
                        style={{ width: `${Math.round((dist.percent || 0) * 100)}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-muted-foreground">
                      {Math.round((dist.percent || 0) * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No reviews yet. Be the first to share your thoughts.</p>
        )}

        {data.dimension_ratings?.length ? (
          <div className="flex justify-between mt-4 pt-4 border-t border-border">
            {data.dimension_ratings.slice(0, 3).map((dim) => (
              <div key={dim.label} className="text-center">
                <span className="text-xs text-muted-foreground">{dim.label}</span>
                <div className="text-sm font-semibold mt-0.5">{dim.score}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {data.filter_chips?.length || showEmpty ? (
        <div className="overflow-x-auto mt-4">
          <div className="flex gap-2 px-4">
            {data.filter_chips?.map((chip) => (
              <button
                key={chip.label}
                className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs whitespace-nowrap hover:border-primary/50"
              >
                {chip.label}
                {chip.count != null ? (
                  <span className="text-muted-foreground">{chip.count}</span>
                ) : null}
              </button>
            ))}
            {!data.filter_chips?.length ? (
              <span className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                No filters yet
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {data.preview_items?.length ? (
        <div className="mt-4 space-y-4 px-4">
          {data.preview_items.slice(0, 3).map((review) => (
            <div key={review.review_id} className="flex gap-3 pb-4 border-b border-border last:border-0">
              <div className="flex-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium">{review.author_label || 'Verified buyer'}</span>
                </div>
                <div className="mt-1">
                  <StarRating value={(review.rating / data.scale) * 5} />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{review.text_snippet}</p>
              </div>
              {review.media?.length ? (
                <div className="relative h-16 w-16 rounded-lg overflow-hidden flex-shrink-0">
                  <img src={review.media[0].url} alt="" className="h-full w-full object-cover" />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {onSeeAll ? (
        <button
          onClick={onSeeAll}
          className="w-full mt-2 py-3 text-sm text-muted-foreground flex items-center justify-center gap-1 hover:text-foreground"
        >
          {data.entry_points?.open_reviews?.label || 'View all reviews'} <ChevronRight className="h-4 w-4" />
        </button>
      ) : null}

      {data.questions?.length || showEmpty ? (
        <div className="mt-4 px-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Questions</h3>
            <button className="text-xs font-medium text-primary">Ask a question</button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {data.questions?.map((disc, idx) => (
              <div key={`${disc.question}-${idx}`} className="min-w-[220px] rounded-xl bg-card border border-border p-3">
                <p className="text-sm font-medium">{disc.question}</p>
                {disc.answer ? (
                  <p className="mt-2 text-xs text-muted-foreground">&quot;{disc.answer}&quot;</p>
                ) : null}
                {disc.replies != null ? (
                  <p className="mt-2 text-xs text-muted-foreground">{disc.replies} replies</p>
                ) : null}
              </div>
            ))}
            {!data.questions?.length ? (
              <div className="min-w-[220px] rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                No questions yet.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {(data.brand_card?.name || brandName) ? (
        <div className="mt-6 mx-4 flex items-center gap-3 rounded-xl bg-card border border-border p-4">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold tracking-tight">
            {(data.brand_card?.name || brandName || '').slice(0, 12).toUpperCase()}
          </div>
          <div className="flex-1">
            <p className="font-semibold">{data.brand_card?.name || brandName}</p>
            {data.brand_card?.subtitle ? (
              <p className="text-xs text-muted-foreground">{data.brand_card.subtitle}</p>
            ) : null}
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : null}
    </div>
  );
}
