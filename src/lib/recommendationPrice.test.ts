import { describe, expect, it } from 'vitest';

import {
  filterDisplayableRecommendationProducts,
  formatRecommendationPriceLabel,
  getPositiveFinitePrice,
} from './recommendationPrice';

describe('recommendation price display', () => {
  it('formats only positive finite prices', () => {
    expect(formatRecommendationPriceLabel(28, 'USD')).toBe('$28');
    expect(formatRecommendationPriceLabel(28.5, 'EUR')).toBe('EUR 28.50');
    expect(formatRecommendationPriceLabel('19.99', 'USD')).toBe('$19.99');
  });

  it('treats zero, negative, missing, and non-finite prices as missing', () => {
    expect(getPositiveFinitePrice(0)).toBeNull();
    expect(getPositiveFinitePrice(-1)).toBeNull();
    expect(getPositiveFinitePrice(null)).toBeNull();
    expect(getPositiveFinitePrice(undefined)).toBeNull();
    expect(getPositiveFinitePrice(Number.NaN)).toBeNull();
    expect(formatRecommendationPriceLabel(0, 'USD')).toBe('');
    expect(formatRecommendationPriceLabel(null, 'USD')).toBe('');
  });

  it('filters missing-price recommendation products before render', () => {
    const products = [
      { product_id: 'positive', price: 12 },
      { product_id: 'zero', price: 0 },
      { product_id: 'missing', price: null },
      { product_id: 'non_finite', price: Number.POSITIVE_INFINITY },
    ];

    expect(filterDisplayableRecommendationProducts(products)).toEqual([
      { product_id: 'positive', price: 12 },
    ]);
  });
});
