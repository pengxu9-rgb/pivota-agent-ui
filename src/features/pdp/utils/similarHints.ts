import type { RecommendationsData } from '@/features/pdp/types';

type SimilarMetadata = RecommendationsData['metadata'] | null | undefined;

export function buildSimilarMainlineStatus(_metadata: SimilarMetadata): {
  title: string;
  body: string;
} | null {
  return null;
}
