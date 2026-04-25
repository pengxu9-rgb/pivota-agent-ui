import type { RecommendationsData } from '@/features/pdp/types';

type SimilarMetadata = RecommendationsData['metadata'] | null | undefined;

export function buildSimilarMainlineStatus(metadata: SimilarMetadata): {
  title: string;
  body: string;
} | null {
  if (String(metadata?.similar_status || '').trim().toLowerCase() === 'deferred') {
    return {
      title: 'Mainline still resolving',
      body:
        'We are still pulling the strongest like-for-like matches for this item. This rail stays empty until mainline results are ready instead of being padded with fallback picks.',
    };
  }

  return null;
}
