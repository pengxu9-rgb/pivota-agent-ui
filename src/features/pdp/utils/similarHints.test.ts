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

  it('keeps underfill diagnostics out of user-visible similar copy', () => {
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
    ).toBeNull();
  });

  it('uses neutral deferred copy without exposing mainline or fallback internals', () => {
    expect(
      buildSimilarMainlineStatus({
        similar_status: 'deferred',
      }),
    ).toEqual({
      title: 'Recommendations are updating',
      body: 'Related products are still being prepared for this item.',
    });
  });
});
