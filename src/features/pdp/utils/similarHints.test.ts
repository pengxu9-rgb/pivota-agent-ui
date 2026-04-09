import { describe, expect, it } from 'vitest';
import { buildSimilarMainlineStatus } from './similarHints';

describe('buildSimilarMainlineStatus', () => {
  it('returns null for confident recommendation sets', () => {
    expect(
      buildSimilarMainlineStatus({
        low_confidence: false,
        similar_confidence: 'high',
      }),
    ).toBeNull();
  });

  it('explains underfill and nearby-category broadening without implying fallback success', () => {
    expect(
      buildSimilarMainlineStatus({
        low_confidence: true,
        similar_confidence: 'low',
        low_confidence_reason_codes: ['UNDERFILL_FOR_QUALITY'],
        underfill: 2,
        selection_mix: {
          same_brand_other_category: 1,
          other_brand_same_category: 3,
        },
      }),
    ).toEqual({
      title: 'Mainline only',
      body:
        'Showing the strongest mainline matches available right now. Exact like-for-like matches were limited, so this set widens to nearby categories and leaves 2 recommendation slots unfilled instead of using fallback padding.',
    });
  });

  it('explains when the rail falls back to recent browsing instead of generic padding', () => {
    expect(
      buildSimilarMainlineStatus({
        low_confidence: true,
        similar_confidence: 'low',
        low_confidence_reason_codes: ['RECENT_VIEWS_FALLBACK_USED'],
        underfill: 1,
      }),
    ).toEqual({
      title: 'Based on recent browsing',
      body:
        'Exact like-for-like matches were limited for this product, so this section falls back to products related to your recent browsing instead of generic padding. 1 recommendation slot remains unfilled rather than widening further.',
    });
  });
});
