import { describe, expect, it } from 'vitest';

import type { Offer, Variant } from '@/features/pdp/types';
import { findMatchingOfferVariant } from '@/features/pdp/utils/offerVariantMatching';

describe('findMatchingOfferVariant', () => {
  it('matches seller variants by normalized option values', () => {
    const offer: Offer = {
      offer_id: 'offer_internal',
      merchant_id: 'merch_internal',
      price: { amount: 28, currency: 'EUR' },
      variants: [
        {
          variant_id: 'SHOP_STD',
          title: 'Standard - 45 mL',
          options: { size: 'Standard - 45 mL' },
          price: { current: { amount: 28, currency: 'EUR' } },
        } as any,
        {
          variant_id: 'SHOP_JUMBO',
          title: 'Jumbo - 100 mL',
          options: { size: 'Jumbo - 100 mL' },
          price: { current: { amount: 40, currency: 'EUR' } },
        } as any,
      ],
    };
    const selectedVariant: Variant = {
      variant_id: 'EXT_JUMBO',
      title: 'Jumbo - 100 mL',
      options: [{ name: 'size', value: 'Jumbo - 100 mL' }],
      price: { current: { amount: 50, currency: 'EUR' } },
    };

    expect(findMatchingOfferVariant(offer, selectedVariant)).toEqual(
      expect.objectContaining({
        variant_id: 'SHOP_JUMBO',
        title: 'Jumbo - 100 mL',
        price: {
          current: { amount: 40, currency: 'EUR' },
        },
      }),
    );
  });

  it('falls back to exact title matching when seller variants have no options', () => {
    const offer: Offer = {
      offer_id: 'offer_external',
      merchant_id: 'external_seed',
      price: { amount: 28, currency: 'EUR' },
      variants: [
        {
          variant_id: 'EXT_STD',
          title: 'Standard - 45 mL',
          price: { current: { amount: 28, currency: 'EUR' } },
        } as any,
      ],
    };
    const selectedVariant: Variant = {
      variant_id: 'OTHER_STD',
      title: 'Standard - 45 mL',
      price: { current: { amount: 28, currency: 'EUR' } },
    };

    expect(findMatchingOfferVariant(offer, selectedVariant)?.variant_id).toBe('EXT_STD');
  });
});
