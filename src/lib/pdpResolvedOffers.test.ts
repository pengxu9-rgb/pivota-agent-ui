import { describe, expect, it } from 'vitest';

import {
  buildRawDetailWithResolvedOffers,
  getCanonicalRefFromResolvedOffers,
  mapResolvedOffersToSellerCandidates,
} from './pdpResolvedOffers';

describe('buildRawDetailWithResolvedOffers', () => {
  it('hydrates resolved offers into legacy raw detail', () => {
    const raw = buildRawDetailWithResolvedOffers(
      { title: 'Base' },
      {
        product_group_id: 'pg_123',
        offers: [
          {
            offer_id: 'offer_1',
            product_id: 'prod_1',
            merchant_id: 'merch_1',
            merchant_name: 'Seller A',
            price: { amount: 20, currency: 'EUR' },
          },
        ],
        default_offer_id: 'offer_1',
        best_price_offer_id: 'offer_1',
      },
    );

    expect(raw).toMatchObject({
      title: 'Base',
      product_group_id: 'pg_123',
      offers_count: 1,
      default_offer_id: 'offer_1',
      best_price_offer_id: 'offer_1',
    });
    expect(Array.isArray((raw as any).offers)).toBe(true);
    expect((raw as any).offers[0]).toMatchObject({
      offer_id: 'offer_1',
      merchant_id: 'merch_1',
      product_id: 'prod_1',
    });
  });
});

describe('getCanonicalRefFromResolvedOffers', () => {
  it('prefers canonical_product_ref when present', () => {
    expect(
      getCanonicalRefFromResolvedOffers({
        canonical_product_ref: {
          merchant_id: 'merch_canonical',
          product_id: 'prod_canonical',
        },
        offers: [
          {
            offer_id: 'offer_1',
            merchant_id: 'merch_offer',
            product_id: 'prod_offer',
          },
        ],
      }),
    ).toEqual({
      merchant_id: 'merch_canonical',
      product_id: 'prod_canonical',
    });
  });

  it('falls back to the first offer with product_id', () => {
    expect(
      getCanonicalRefFromResolvedOffers({
        offers: [
          {
            offer_id: 'offer_1',
            merchant_id: 'merch_offer',
            product_id: 'prod_offer',
          },
        ],
      }),
    ).toEqual({
      merchant_id: 'merch_offer',
      product_id: 'prod_offer',
    });
  });
});

describe('mapResolvedOffersToSellerCandidates', () => {
  it('dedupes seller candidates by merchant id', () => {
    const candidates = mapResolvedOffersToSellerCandidates({
      offers: [
        {
          offer_id: 'offer_1',
          merchant_id: 'merch_1',
          product_id: 'prod_1',
          merchant_name: 'Seller A',
          price: { amount: 20, currency: 'EUR' },
          inventory: { in_stock: true },
        },
        {
          offer_id: 'offer_2',
          merchant_id: 'merch_1',
          product_id: 'prod_2',
          merchant_name: 'Seller A',
          price: { amount: 22, currency: 'EUR' },
          inventory: { in_stock: false },
        },
      ],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      merchant_id: 'merch_1',
      merchant_name: 'Seller A',
      price: 20,
      currency: 'EUR',
      in_stock: true,
    });
  });
});
