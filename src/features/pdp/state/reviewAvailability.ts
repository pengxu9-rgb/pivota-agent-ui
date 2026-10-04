import type { ReviewsPreviewData } from '../types';

/** Availability is scoped: an unavailable exact-item read must not erase a
 * separately completed product-line read or turn unknown counts into zero. */
export function normalizeReviewAvailability(data: ReviewsPreviewData): ReviewsPreviewData {
  const state = String(data.availability_state || data.status || '').trim().toLowerCase();
  const denied = ['withheld', 'blocked', 'rejected'].includes(state);
  const unavailable = ['unavailable', 'error', 'failed', 'withheld', 'blocked', 'rejected',
    'loading', 'deferred', 'absent', 'not_fetched', 'missing', 'unknown'].includes(state);
  const validCount = typeof data.review_count === 'number' && Number.isFinite(data.review_count) && data.review_count >= 0;
  const known = validCount && (data.review_count! > 0 || ['empty', 'ready'].includes(state));
  const scoped = data.scoped_summaries ? Object.fromEntries(Object.entries(data.scoped_summaries).map(([key, summary]) => [key,
    denied ? { ...summary, rating: null, review_count: null, availability_state: 'unavailable', preview_items: [] }
      : normalizeReviewAvailability(summary),
  ])) : undefined;
  return {
    ...data,
    ...(unavailable || !known ? { rating: null, review_count: null,
      availability_state: state === 'error' || state === 'failed' ? 'error' : 'unavailable' } : {}),
    ...(denied ? { preview_items: [] } : {}),
    ...(scoped ? { scoped_summaries: scoped } : {}),
  };
}
