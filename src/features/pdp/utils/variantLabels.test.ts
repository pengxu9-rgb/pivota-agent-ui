import { describe, expect, it } from 'vitest';
import {
  getDisplayVariantLabel,
  getVariantOptionSummary,
  hasDisplayableVariantOptions,
} from './variantLabels';

describe('variant label helpers', () => {
  it('suppresses UPC-style Offer options from display labels', () => {
    const variant = {
      title: '769915233636',
      options: [{ name: 'Offer', value: '769915233636' }],
    };

    expect(hasDisplayableVariantOptions(variant)).toBe(false);
    expect(getVariantOptionSummary(variant.options)).toBe('');
    expect(getDisplayVariantLabel(variant, 'Default')).toBe('Default');
  });

  it('keeps real generic variant options selectable', () => {
    const variant = {
      title: 'Extreme Cream',
      options: [{ name: 'Option', value: 'Refill' }],
    };

    expect(hasDisplayableVariantOptions(variant)).toBe(true);
    expect(getVariantOptionSummary(variant.options)).toBe('Refill');
    expect(getDisplayVariantLabel(variant, 'Default')).toBe('Extreme Cream');
  });
});
