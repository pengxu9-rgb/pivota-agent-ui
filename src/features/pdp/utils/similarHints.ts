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

  if (itemCount > 0) return null;
  const graphStatus = metadata?.relationship_graph_read_status || 'unknown';
  if (graphStatus === 'empty' || graphStatus === 'unavailable' || graphStatus === 'not_attempted' ||
    ['empty', 'unavailable', 'underfilled'].includes(similarStatus)) {
    const checkedEmpty = graphStatus === 'empty' || (graphStatus === 'ready' && similarStatus === 'empty');
    return checkedEmpty ? {
      title: 'No related products found',
      body: 'No matching related products were found for this item.',
    } : {
      title: 'Related products are unavailable',
      body: 'Related product information is unavailable right now. Please try again.',
    };
  }

  return null;
}
