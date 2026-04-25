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

  it('suppresses low-confidence mainline notes for populated recommendation sets', () => {
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

  it('explains deferred similar rails without pretending the set is empty', () => {
    expect(
      buildSimilarMainlineStatus({
        similar_status: 'deferred',
      }),
    ).toEqual({
      title: 'Mainline still resolving',
      body:
        'We are still pulling the strongest like-for-like matches for this item. This rail stays empty until mainline results are ready instead of being padded with fallback picks.',
    });
  });
});
