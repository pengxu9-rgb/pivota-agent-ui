import type { RecommendationsData } from '@/features/pdp/types';

type SimilarMetadata = RecommendationsData['metadata'] | null | undefined;

export function buildSimilarMainlineStatus(metadata: SimilarMetadata): {
  title: string;
  body: string;
} | null {
  if (!metadata?.low_confidence) return null;

  const underfill = Number.isFinite(Number(metadata.underfill))
    ? Math.max(0, Math.trunc(Number(metadata.underfill)))
    : 0;
  const selectionMix = metadata.selection_mix || {};
  const broadenedToNearbyCategories =
    Number(selectionMix.same_brand_other_category || 0) > 0 ||
    Number(selectionMix.other_brand_same_category || 0) > 0 ||
    Number(selectionMix.other_brand_same_vertical || 0) > 0 ||
    Number(selectionMix.semantic_peer || 0) > 0;
  const reasonCodes = new Set(
    (metadata.low_confidence_reason_codes || []).map((item) =>
      String(item || '').trim().toUpperCase(),
    ),
  );

  let body = 'Showing the strongest mainline matches available right now.';

  if (broadenedToNearbyCategories && underfill > 0) {
    body += ` Exact like-for-like matches were limited, so this set widens to nearby categories and leaves ${underfill} recommendation slot${underfill === 1 ? '' : 's'} unfilled instead of using fallback padding.`;
  } else if (underfill > 0) {
    body += ` ${underfill} recommendation slot${underfill === 1 ? ' is' : 's are'} intentionally left unfilled instead of using fallback padding.`;
  } else if (broadenedToNearbyCategories) {
    body += ' Exact like-for-like matches were limited, so this set widens to nearby categories instead of using fallback padding.';
  } else if (reasonCodes.has('UNDERFILL_FOR_QUALITY')) {
    body += ' Exact like-for-like matches were limited, and this section stays on the mainline instead of being padded with fallback results.';
  } else {
    body += ' This section stays on the mainline instead of being padded with fallback results.';
  }

  return {
    title: 'Mainline only',
    body,
  };
}
