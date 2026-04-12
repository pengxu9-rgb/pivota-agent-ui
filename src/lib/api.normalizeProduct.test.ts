import { describe, expect, it } from 'vitest';

import { normalizeProduct } from './api';

describe('normalizeProduct', () => {
  it('strips HTML tags from descriptions before product cards consume them', () => {
    const normalized = normalizeProduct({
      product_id: 'ext_1',
      merchant_id: 'external_seed',
      title: 'External serum',
      price: { amount: 28, currency: 'USD' },
      image_url: 'https://example.com/serum.png',
      description:
        '<p>Barrier support <strong>serum</strong></p><ul><li>Niacinamide</li><li>Panthenol</li></ul>',
    } as any);

    expect(normalized.description).not.toContain('<p>');
    expect(normalized.description).not.toContain('<strong>');
    expect(normalized.description).toContain('Barrier support serum');
    expect(normalized.description).toContain('Niacinamide');
    expect(normalized.description).toContain('Panthenol');
  });

  it('preserves normalized search-card fields for shared card rendering', () => {
    const normalized = normalizeProduct({
      product_id: 'ext_2',
      merchant_id: 'external_seed',
      title: 'Legacy title',
      price: { amount: 35, currency: 'USD' },
      image_url: 'https://example.com/stick.png',
      description: 'Legacy overview',
      search_card: {
        title_candidate: 'Olehenriksen Vitamin C Eye Stick',
        compact_candidate: 'Color-correcting eye stick',
        highlight_candidate: 'Creator-noted brightening pick',
        proof_badge_candidate: 'Seen in 4 editor picks',
      },
      shopping_card: {
        title: 'Olehenriksen Vitamin C Eye Stick',
        subtitle: 'Color-correcting eye stick',
        highlight: 'Creator-noted brightening pick',
        external_highlight_signals: [
          {
            signal_id: 'sig_1',
            source_type: 'verified_reviews',
            claim_text: 'Reviewers mention the brightening effect.',
            surface_text: 'Reviewers cite brightening',
            surfaceable: true,
            surface_targets: ['shopping_card_highlight'],
          },
        ],
      },
      market_signal_badges: [
        {
          badge_type: 'editorial_signal',
          badge_label: 'Seen in 4 editor picks',
        },
      ],
    } as any);

    expect(normalized.card_title).toBe('Olehenriksen Vitamin C Eye Stick');
    expect(normalized.card_subtitle).toBe('Color-correcting eye stick');
    expect(normalized.card_highlight).toBe('Creator-noted brightening pick');
    expect(normalized.card_badge).toBe('Seen in 4 editor picks');
    expect(normalized.search_card?.highlight_candidate).toBe('Creator-noted brightening pick');
    expect(normalized.shopping_card?.highlight).toBe('Creator-noted brightening pick');
    expect(normalized.shopping_card?.external_highlight_signals).toEqual([
      expect.objectContaining({
        signal_id: 'sig_1',
        surface_text: 'Reviewers cite brightening',
      }),
    ]);
    expect(normalized.external_highlight_signals).toEqual([
      expect.objectContaining({
        signal_id: 'sig_1',
        surface_text: 'Reviewers cite brightening',
      }),
    ]);
    expect(normalized.market_signal_badges).toEqual([
      {
        badge_type: 'editorial_signal',
        badge_label: 'Seen in 4 editor picks',
      },
    ]);
  });
});
