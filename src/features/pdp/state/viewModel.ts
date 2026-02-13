import type { Offer, RecommendationsData, ReviewsPreviewData } from '../types';

export type PdpModuleState = 'ABSENT' | 'LOADING' | 'READY' | 'EMPTY' | 'ERROR';
export type PdpModuleKey =
  | 'offers'
  | 'reviews_preview'
  | 'ugc_preview'
  | 'similar';

export interface PdpHeightSpec {
  offers: number;
  reviews_preview: number;
  ugc_preview: number;
  similar: number;
}

export const PDP_HEIGHT_SPEC: PdpHeightSpec = {
  offers: 88,
  reviews_preview: 232,
  ugc_preview: 228,
  similar: 320,
};

export interface PdpSourceLocks {
  reviews: boolean;
  similar: boolean;
  ugc: boolean;
}

export interface PdpViewModel {
  moduleStates: Record<PdpModuleKey, PdpModuleState>;
  sourceLocks: PdpSourceLocks;
  heightSpec: PdpHeightSpec;
}

interface BuildPdpViewModelInput {
  offers: Offer[];
  reviews: ReviewsPreviewData | null;
  recommendations: RecommendationsData | null;
  ugcCount: number;
  offersLoadState?: 'loading' | 'ready' | 'error';
  reviewsLoadState?: 'loading' | 'ready' | 'error';
  similarLoadState?: 'loading' | 'ready' | 'error';
  sourceLocks: PdpSourceLocks;
}

function hasReviewContent(reviews: ReviewsPreviewData | null): boolean {
  if (!reviews) return false;
  const rating = Number(reviews.rating || 0);
  const reviewCount = Number(reviews.review_count || 0);
  const previewCount = Array.isArray(reviews.preview_items)
    ? reviews.preview_items.length
    : 0;
  const distributionCount = Array.isArray(reviews.star_distribution)
    ? reviews.star_distribution.length
    : 0;
  return (
    rating > 0 ||
    reviewCount > 0 ||
    previewCount > 0 ||
    distributionCount > 0
  );
}

function hasSimilarContent(recommendations: RecommendationsData | null): boolean {
  return Boolean(
    recommendations &&
      Array.isArray(recommendations.items) &&
      recommendations.items.length > 0,
  );
}

function resolveState(args: {
  loadState?: 'loading' | 'ready' | 'error';
  hasData: boolean;
}): PdpModuleState {
  if (args.loadState === 'loading') return 'LOADING';
  if (args.loadState === 'error') return 'ERROR';
  if (args.hasData) return 'READY';
  if (args.loadState === 'ready') return 'EMPTY';
  return 'ABSENT';
}

export function buildPdpViewModel(input: BuildPdpViewModelInput): PdpViewModel {
  const hasOffers = Array.isArray(input.offers) && input.offers.length > 0;
  const hasReviews = hasReviewContent(input.reviews);
  const hasSimilar = hasSimilarContent(input.recommendations);
  const hasUgc = Number(input.ugcCount || 0) > 0;

  const moduleStates: Record<PdpModuleKey, PdpModuleState> = {
    offers: resolveState({
      loadState: input.offersLoadState,
      hasData: hasOffers,
    }),
    reviews_preview: resolveState({
      loadState: input.reviewsLoadState,
      hasData: hasReviews,
    }),
    similar: resolveState({
      loadState: input.similarLoadState,
      hasData: hasSimilar,
    }),
    ugc_preview: resolveState({
      loadState:
        !hasUgc && input.reviewsLoadState === 'loading' ? 'loading' : 'ready',
      hasData: hasUgc,
    }),
  };

  return {
    moduleStates,
    sourceLocks: input.sourceLocks,
    heightSpec: PDP_HEIGHT_SPEC,
  };
}

