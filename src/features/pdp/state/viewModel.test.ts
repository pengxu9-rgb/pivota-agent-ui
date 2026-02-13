import { describe, expect, it } from 'vitest';
import { buildPdpViewModel } from './viewModel';

describe('buildPdpViewModel', () => {
  it('maps loading states to LOADING with fixed module keys', () => {
    const viewModel = buildPdpViewModel({
      offers: [],
      reviews: null,
      recommendations: null,
      ugcCount: 0,
      offersLoadState: 'loading',
      reviewsLoadState: 'loading',
      similarLoadState: 'loading',
      sourceLocks: { reviews: false, similar: false, ugc: false },
    });

    expect(viewModel.moduleStates.offers).toBe('LOADING');
    expect(viewModel.moduleStates.reviews_preview).toBe('LOADING');
    expect(viewModel.moduleStates.similar).toBe('LOADING');
    expect(viewModel.moduleStates.ugc_preview).toBe('LOADING');
  });

  it('distinguishes EMPTY from ABSENT when backfill completes without data', () => {
    const viewModel = buildPdpViewModel({
      offers: [],
      reviews: { scale: 5, rating: 0, review_count: 0, preview_items: [] },
      recommendations: { strategy: 'related_products', items: [] },
      ugcCount: 0,
      offersLoadState: 'ready',
      reviewsLoadState: 'ready',
      similarLoadState: 'ready',
      sourceLocks: { reviews: true, similar: true, ugc: false },
    });

    expect(viewModel.moduleStates.offers).toBe('EMPTY');
    expect(viewModel.moduleStates.reviews_preview).toBe('EMPTY');
    expect(viewModel.moduleStates.similar).toBe('EMPTY');
    expect(viewModel.moduleStates.ugc_preview).toBe('EMPTY');
  });

  it('marks READY when content exists', () => {
    const viewModel = buildPdpViewModel({
      offers: [
        {
          offer_id: 'of:1',
          merchant_id: 'm1',
          price: { amount: 10, currency: 'USD' },
        },
      ],
      reviews: {
        scale: 5,
        rating: 4.6,
        review_count: 12,
        preview_items: [],
      },
      recommendations: {
        strategy: 'related_products',
        items: [{ product_id: 'p2', title: 'Another item' }],
      },
      ugcCount: 3,
      offersLoadState: 'ready',
      reviewsLoadState: 'ready',
      similarLoadState: 'ready',
      sourceLocks: { reviews: true, similar: true, ugc: true },
    });

    expect(viewModel.moduleStates.offers).toBe('READY');
    expect(viewModel.moduleStates.reviews_preview).toBe('READY');
    expect(viewModel.moduleStates.similar).toBe('READY');
    expect(viewModel.moduleStates.ugc_preview).toBe('READY');
  });
});
