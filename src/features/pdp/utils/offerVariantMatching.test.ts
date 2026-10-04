import { describe, expect, it } from 'vitest';

import type { Offer, Variant } from '@/features/pdp/types';
import { findMatchingOfferVariant, resolveReapPurchaseMoney } from '@/features/pdp/utils/offerVariantMatching';

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

describe('resolveReapPurchaseMoney', () => {
  const size50: Variant = {
    variant_id: 'V50',
    title: '50 mL',
    options: [{ name: 'Size', value: '50 mL' }],
    price: { current: { amount: 49, currency: 'USD' } },
  };
  const size100: Variant = {
    variant_id: 'V100',
    title: '100 mL',
    options: [{ name: 'Size', value: '100 mL' }],
    price: { current: { amount: 79, currency: 'USD' } },
  };
  const offerWith = (variants?: unknown[], amount = 49): Offer => ({
    offer_id: 'of_1',
    merchant_id: 'merch_1',
    price: { amount, currency: 'USD' },
    ...(variants ? { variants: variants as any } : {}),
  });

  it('ACCEPT multi-variant: offer variant matched by variant_id with its own 59.00', () => {
    const offer = offerWith([
      { variant_id: 'V50', price: { current: { amount: 49, currency: 'USD' } } },
      { variant_id: 'V100', price: { current: { amount: 59, currency: 'USD' } } },
    ]);
    expect(resolveReapPurchaseMoney(offer, size100, 2)).toEqual({ available: true, unitPriceAmount: 59, currency: 'USD' });
  });

  it('ACCEPT multi-variant: offer variant matched by option map (size=100 mL) with its own price', () => {
    const offer = offerWith([
      { variant_id: 'SHOP_50', options: { size: '50 ml' }, price: { current: { amount: 49, currency: 'USD' } } },
      { variant_id: 'SHOP_100', options: { size: '100 ml' }, price: { current: { amount: 61, currency: 'USD' } } },
    ]);
    expect(resolveReapPurchaseMoney(offer, size100, 2)).toEqual({ available: true, unitPriceAmount: 61, currency: 'USD' });
  });

  it('ACCEPT sole-variant: offer with no variants list uses the offer-level 28.00', () => {
    const sole: Variant = { variant_id: 'V1', title: 'Default', price: { current: { amount: 30, currency: 'USD' } } };
    expect(resolveReapPurchaseMoney(offerWith(undefined, 28), sole, 1)).toEqual({ available: true, unitPriceAmount: 28, currency: 'USD' });
  });

  it('ACCEPT sole-variant: offer listing exactly one unpriced variant uses the offer-level price', () => {
    const sole: Variant = { variant_id: 'V1', title: 'Default' };
    expect(resolveReapPurchaseMoney(offerWith([{ variant_id: 'V1' }], 28), sole, 1)).toEqual({ available: true, unitPriceAmount: 28, currency: 'USD' });
  });

  it('REFUSE multi-variant: matched variant has no price, never the offer-level 49.00', () => {
    const offer = offerWith([
      { variant_id: 'V50', price: { current: { amount: 49, currency: 'USD' } } },
      { variant_id: 'V100' },
    ]);
    expect(resolveReapPurchaseMoney(offer, size100, 2)).toEqual({ available: false, reason: 'matched_variant_unpriced' });
  });

  it('REFUSE multi-variant: no offer variant matches the selection', () => {
    expect(resolveReapPurchaseMoney(offerWith(undefined), size100, 2)).toEqual({ available: false, reason: 'no_matched_offer_variant' });
  });

  it('REFUSE: an offer variant matched only by title equality', () => {
    const offer = offerWith([{ variant_id: 'SHOP_X', title: '100 mL', price: { current: { amount: 79, currency: 'USD' } } }]);
    expect(resolveReapPurchaseMoney(offer, size100, 2)).toEqual({ available: false, reason: 'matched_by_title_only' });
    expect(resolveReapPurchaseMoney(offer, { ...size100, options: undefined }, 1)).toEqual({ available: false, reason: 'matched_by_title_only' });
  });

  it('REFUSE sole-variant: an offer-level price when the offer lists several variants', () => {
    const sole: Variant = { variant_id: 'V1', title: 'Default' };
    const offer = offerWith([{ variant_id: 'A', price: { current: { amount: 10, currency: 'USD' } } }, { variant_id: 'B' }]);
    expect(resolveReapPurchaseMoney(offer, sole, 1)).toEqual({ available: false, reason: 'offer_price_ambiguous' });
  });

  it('REFUSE: no selected offer, even with a seed price on the selected variant', () => {
    expect(resolveReapPurchaseMoney(null, size50, 1)).toEqual({ available: false, reason: 'no_selected_offer' });
  });

  it('REFUSE: current_own_offer_status unavailable on the selected or the matched variant', () => {
    const offer = offerWith([
      { variant_id: 'V50', price: { current: { amount: 49, currency: 'USD' } } },
      { variant_id: 'V100', current_own_offer_status: 'unavailable', price: { current: { amount: 79, currency: 'USD' } } },
    ]);
    expect(resolveReapPurchaseMoney(offer, size100, 2)).toEqual({ available: false, reason: 'current_money_unavailable' });
    expect(resolveReapPurchaseMoney(offer, { ...size50, current_own_offer_status: 'unavailable' }, 2))
      .toEqual({ available: false, reason: 'current_money_unavailable' });
  });

  it('REFUSE: a zero or missing price is not purchase money', () => {
    const sole: Variant = { variant_id: 'V1', title: 'Default' };
    expect(resolveReapPurchaseMoney(offerWith(undefined, 0), sole, 1)).toEqual({ available: false, reason: 'no_positive_offer_price' });
  });
});
