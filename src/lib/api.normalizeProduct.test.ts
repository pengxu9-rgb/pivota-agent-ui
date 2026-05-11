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

  it('keeps direct external image URLs instead of forcing them through the local image proxy', () => {
    const normalized = normalizeProduct({
      product_id: 'ext_3',
      merchant_id: 'external_seed',
      title: 'Dr.Jart cream',
      price: { amount: 20, currency: 'USD' },
      image_url: 'https://www.drjart.com/media/export/cms/products/1000x1000/dj_sku_H7T901_1000x1000_0.jpg',
      description: 'Barrier cream',
    } as any);

    expect(normalized.image_url).toBe(
      'https://www.drjart.com/media/export/cms/products/1000x1000/dj_sku_H7T901_1000x1000_0.jpg',
    );
  });

  it('prefers migrated sig product ids while preserving the source external id', () => {
    const normalized = normalizeProduct({
      product_id: 'ext_853c9104752ad8d2f857f754',
      pivota_signature_id: 'sig_fenty_lipstick_001',
      merchant_id: 'external_seed',
      title: 'Fenty lipstick',
      price: { amount: 28, currency: 'USD' },
      image_url: 'https://example.com/lipstick.png',
      source_product_id: 'ext_853c9104752ad8d2f857f754',
      description: 'Longwear lipstick',
    } as any);

    expect(normalized.product_id).toBe('sig_fenty_lipstick_001');
    expect(normalized.pivota_signature_id).toBe('sig_fenty_lipstick_001');
    expect(normalized.source_product_id).toBe('ext_853c9104752ad8d2f857f754');
    expect(normalized.platform_product_id).toBe('ext_853c9104752ad8d2f857f754');
  });

  it('does not treat identity group ids as public PDP signatures', () => {
    const normalized = normalizeProduct({
      product_id: 'ext_3f08175bbe2382f68e78aee6',
      sellable_item_group_id: 'sig_internal_group_not_public',
      product_group_id: 'sig_internal_product_group',
      merchant_id: 'external_seed',
      title: 'Fenty toner serum',
      price: { amount: 34, currency: 'USD' },
      image_url: 'https://example.com/toner.png',
      description: 'Pore-refining toner serum',
    } as any);

    expect(normalized.product_id).toBe('ext_3f08175bbe2382f68e78aee6');
    expect(normalized.pivota_signature_id).toBeUndefined();
    expect(normalized.sellable_item_group_id).toBe('sig_internal_group_not_public');
    expect(normalized.product_group_id).toBe('sig_internal_product_group');
  });

  it('preserves deterministic recommendation reasons for chat cards', () => {
    const normalized = normalizeProduct({
      product_id: 'sig_acne_pick',
      merchant_id: 'external_seed',
      title: 'Azelaic Acid 10 Ampoule',
      price: { amount: 22, currency: 'USD' },
      image_url: 'https://example.com/azelaic.png',
      description: 'Azelaic acid ampoule',
      recommendation_reason: 'Recommended because it has azelaic-acid support for blemish-prone skin.',
    } as any);

    expect(normalized.recommendation_reason).toBe(
      'Recommended because it has azelaic-acid support for blemish-prone skin.',
    );
    expect(normalized.match_reason).toBe(normalized.recommendation_reason);
  });

  it('extracts sig ids from Pivota canonical URLs when similar cards still carry ext ids', () => {
    const normalized = normalizeProduct({
      product_id: 'ext_853c9104752ad8d2f857f754',
      merchant_id: 'external_seed',
      title: 'Fenty lipstick',
      price: { amount: 28, currency: 'USD' },
      image_url: 'https://example.com/lipstick.png',
      pivota_canonical_url: 'https://agent.pivota.cc/products/sig_fenty_lipstick_001',
      description: 'Longwear lipstick',
    } as any);

    expect(normalized.product_id).toBe('sig_fenty_lipstick_001');
  });

  it('unwraps legacy local image-proxy URLs back to their upstream target', () => {
    const normalized = normalizeProduct({
      product_id: 'ext_4',
      merchant_id: 'external_seed',
      title: 'Legacy proxied image',
      price: { amount: 20, currency: 'USD' },
      image_url:
        '/api/image-proxy?url=https%3A%2F%2Fwww.drjart.com%2Fmedia%2Fexport%2Fcms%2Fproducts%2F1000x1000%2Fdj_sku_H7T901_1000x1000_0.jpg',
      description: 'Barrier cream',
    } as any);

    expect(normalized.image_url).toBe(
      'https://www.drjart.com/media/export/cms/products/1000x1000/dj_sku_H7T901_1000x1000_0.jpg',
    );
  });
});
