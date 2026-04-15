import { describe, expect, it } from 'vitest';
import type { Variant } from '@/features/pdp/types';
import {
  collectColorOptions,
  collectSizeOptions,
  extractAttributeOptions,
  findVariantByOptions,
  getOptionValue,
  getStaticSizeOption,
} from './variantOptions';

const variants: Variant[] = [
  {
    variant_id: 'v1',
    title: '35 Rose Topaz / 8.0 g',
    options: [{ name: 'Color / Size', value: '35 Rose Topaz / 8.0 g' }],
  },
  {
    variant_id: 'v2',
    title: '42 Golden Hour / 8.0 g',
    options: [{ name: 'Color / Size', value: '42 Golden Hour / 8.0 g' }],
  },
];

describe('variantOptions combined color/size handling', () => {
  it('parses color and size from combined option values', () => {
    expect(getOptionValue(variants[0], ['color', 'colour', 'shade', 'tone'])).toBe('35 Rose Topaz');
    expect(getOptionValue(variants[0], ['size', 'fit'])).toBe('8.0 g');
    expect(collectColorOptions(variants)).toEqual(['35 Rose Topaz', '42 Golden Hour']);
    expect(collectSizeOptions(variants)).toEqual(['8.0 g']);
    expect(getStaticSizeOption(variants)).toBe('8.0 g');
  });

  it('matches variants by parsed color without duplicating combined options as attributes', () => {
    expect(
      findVariantByOptions({
        variants,
        color: '42 Golden Hour',
        size: '8.0 g',
      })?.variant_id,
    ).toBe('v2');
    expect(extractAttributeOptions(variants[0])).toEqual([]);
  });

  it('drops placeholder single-variant title options from attribute chips', () => {
    expect(
      extractAttributeOptions({
        variant_id: 'default',
        title: 'Default Title',
        options: [{ name: 'Title', value: 'Default Title' }],
      }),
    ).toEqual([]);
  });

  it('drops generic option metadata such as Option: Refill from attribute chips', () => {
    expect(
      extractAttributeOptions({
        variant_id: 'refill',
        title: 'Refill',
        options: [{ name: 'Option', value: 'Refill' }],
      }),
    ).toEqual([]);
  });

  it('keeps real multi-value refill axes when they are not generic option metadata', () => {
    const refillVariants: Variant[] = [
      {
        variant_id: 'full',
        title: 'Full size',
        options: [{ name: 'Refill', value: 'Full size' }],
      },
      {
        variant_id: 'refill',
        title: 'Refill',
        options: [{ name: 'Refill', value: 'Refill' }],
      },
    ];

    expect(extractAttributeOptions(refillVariants[0], { variants: refillVariants })).toEqual([
      { name: 'Refill', value: 'Full size' },
    ]);
  });
});
