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

  it('does not describe unavailable or legacy unknown graph reads as an empty result', () => {
    expect(
      buildSimilarMainlineStatus({
        similar_status: 'unavailable',
        low_confidence_reason_codes: ['UNDERFILL_FOR_QUALITY'],
        underfill: 36,
      }),
    ).toEqual({
      title: 'Related products are unavailable',
      body: 'Related product information is unavailable right now. Please try again.',
    });
  });

  it('does not show empty copy when an underfilled response still has products', () => {
    expect(
      buildSimilarMainlineStatus(
        {
          similar_status: 'underfilled',
          low_confidence_reason_codes: ['UNDERFILL_MAINLINE_RECALL'],
          underfill: 4,
        },
        { itemCount: 2 },
      ),
    ).toBeNull();
  });
  it('distinguishes a successful empty graph read from schema-unavailable', () => {
    expect(buildSimilarMainlineStatus({ similar_status: 'empty', relationship_graph_read_status: 'empty', relationship_graph_read_reason: 'no_eligible_edges' })?.title).toBe('No related products found');
    expect(buildSimilarMainlineStatus({ similar_status: 'empty', relationship_graph_read_status: 'unavailable', relationship_graph_read_reason: 'schema_unavailable' })?.title).toBe('Related products are unavailable');
    expect(buildSimilarMainlineStatus({ similar_status: 'deferred', relationship_graph_read_status: 'not_attempted' })?.title).toBe('Recommendations are updating');
    expect(buildSimilarMainlineStatus({ relationship_graph_read_status: 'unavailable' }, { itemCount: 2 })).toBeNull();
  });

});
