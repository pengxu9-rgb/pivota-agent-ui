import type { RecommendationsData } from '@/features/pdp/types';

type SimilarMetadata = RecommendationsData['metadata'] | null | undefined;

export function buildSimilarMainlineStatus(metadata: SimilarMetadata): {
  title: string;
  body: string;
} | null {
  if (String(metadata?.similar_status || '').trim().toLowerCase() === 'deferred') {
    return {
      title: 'Recommendations are updating',
      body: 'Related products are still being prepared for this item.',
    };
  }

  return null;
}
