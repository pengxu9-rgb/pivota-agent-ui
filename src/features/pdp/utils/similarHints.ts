import type { RecommendationsData } from '@/features/pdp/types';

type SimilarMetadata = RecommendationsData['metadata'] | null | undefined;

export function buildSimilarMainlineStatus(
  metadata: SimilarMetadata,
  options: { itemCount?: number } = {},
): {
  title: string;
  body: string;
} | null {
  const similarStatus = String(metadata?.similar_status || '').trim().toLowerCase();
  const itemCount = Math.max(0, Number(options.itemCount || 0) || 0);
  if (similarStatus === 'deferred') {
    return {
      title: 'Recommendations are updating',
      body: 'Related products are still being prepared for this item.',
    };
  }

  if (similarStatus === 'empty' || similarStatus === 'unavailable' || similarStatus === 'underfilled') {
    if (itemCount > 0) return null;
    return {
      title: 'No related products yet',
      body: 'Related products are not available for this item right now.',
    };
  }

  return null;
}
