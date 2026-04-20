import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WaysToSave } from './WaysToSave';
import type { Offer, Product } from '@/features/pdp/types';

function product(overrides: Partial<Product> = {}): Product {
  return {
    product_id: '10064558096681',
    merchant_id: 'merch_efbc46b4619cfbdf',
    title: 'KraveBeauty Great Barrier Relief',
    default_variant_id: 'v1',
    variants: [],
    price: { current: { amount: 28, currency: 'USD' } },
    store_discount_evidence: {
      offers: [
        {
          store_discount_id: 'store_a',
          discount_type: 'basic',
          status: 'available',
          display: { badge: 'Pivota store code' },
        },
      ],
    },
    ...overrides,
  };
}

describe('WaysToSave', () => {
  it('does not use product-level savings as fallback for an external seed offer', () => {
    render(
      <WaysToSave
        product={product()}
        selectedOffer={
          {
            offer_id: 'external',
            merchant_id: 'external_seed',
            product_id: 'ext_670fd3f47ecd319d143f8c65',
            merchant_name: 'KraveBeauty',
            price: { amount: 28, currency: 'USD' },
          } as Offer
        }
      />,
    );

    expect(screen.queryByText('Pivota store code')).not.toBeInTheDocument();
  });

  it('renders offer-scoped savings for the selected seller', () => {
    render(
      <WaysToSave
        product={product({ store_discount_evidence: undefined })}
        selectedOffer={
          {
            offer_id: 'internal',
            merchant_id: 'merch_efbc46b4619cfbdf',
            product_id: '10064558096681',
            price: { amount: 28, currency: 'USD' },
            store_discount_evidence: {
              offers: [
                {
                  store_discount_id: 'store_a',
                  discount_type: 'basic',
                  status: 'available',
                  display: { badge: 'Selected seller code' },
                },
              ],
            },
          } as Offer
        }
      />,
    );

    expect(screen.getByText('Selected seller code')).toBeInTheDocument();
  });
});
