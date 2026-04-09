import { describe, expect, it } from 'vitest';
import { isLikelyBeautyExternalSeedProduct, resolveVisiblePdpTab } from './PdpContainer';

describe('isLikelyBeautyExternalSeedProduct', () => {
  it('treats eye-color quad external-seed products as beauty-like even in generic mode', () => {
    expect(
      isLikelyBeautyExternalSeedProduct(
        {
          product_id: 'ext_1',
          merchant_id: 'external_seed',
          title: 'Runway Eye Color Quad Crème',
          subtitle: '',
          brand: { name: 'Tom Ford Beauty' },
          category_path: ['external'],
          default_variant_id: 'v1',
          variants: [],
        } as any,
        'generic',
      ),
    ).toBe(true);
  });

  it('does not mark obvious non-beauty products as beauty-like', () => {
    expect(
      isLikelyBeautyExternalSeedProduct(
        {
          product_id: 'ext_2',
          merchant_id: 'external_seed',
          title: 'Reflective Dog Leash',
          subtitle: '',
          brand: { name: 'Trail Pets' },
          category_path: ['pets', 'accessories'],
          tags: ['dog', 'leash'],
          default_variant_id: 'v1',
          variants: [],
        } as any,
        'generic',
      ),
    ).toBe(false);
  });
});

describe('resolveVisiblePdpTab', () => {
  it('switches to insights once the insights section enters the primary reading band', () => {
    expect(
      resolveVisiblePdpTab(
        [
          { id: 'product', top: -24 },
          { id: 'insights', top: 128 },
          { id: 'details', top: 620 },
        ],
        160,
      ),
    ).toBe('insights');
  });

  it('keeps product active when insights is still well below the reading band', () => {
    expect(
      resolveVisiblePdpTab(
        [
          { id: 'product', top: -24 },
          { id: 'insights', top: 260 },
          { id: 'details', top: 620 },
        ],
        160,
      ),
    ).toBe('product');
  });
});
