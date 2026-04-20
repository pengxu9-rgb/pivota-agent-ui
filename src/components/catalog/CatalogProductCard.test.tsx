/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogProductCard } from './CatalogProductCard';
import type { ProductResponse } from '@/lib/api';

vi.mock('next/image', () => ({
  default: (
    props: React.ImgHTMLAttributes<HTMLImageElement> & {
      fill?: boolean;
      unoptimized?: boolean;
    },
  ) => {
    const { fill: _fill, unoptimized: _unoptimized, alt, ...rest } = props;
    return <img {...rest} alt={typeof alt === 'string' ? alt : ''} />;
  },
}));

vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _prefetch, ...rest }: any) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock('@/store/cartStore', () => ({
  useCartStore: (selector?: (state: any) => unknown) => {
    const state = {
      addItem: vi.fn(),
      open: vi.fn(),
    };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
  },
}));

function product(overrides: Partial<ProductResponse> = {}): ProductResponse {
  return {
    product_id: 'prod_1',
    merchant_id: 'merch_1',
    title: 'Barrier Serum',
    description: '',
    price: 100,
    currency: 'USD',
    image_url: '/placeholder.svg',
    category: 'Serum',
    in_stock: true,
    ...overrides,
  };
}

describe('CatalogProductCard savings display', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('marks seller-specific savings as variable on multi-offer cards', () => {
    render(
      <CatalogProductCard
        product={product({
          offers_count: 2,
          best_price_offer_id: 'offer_a',
          offers: [
            {
              offer_id: 'offer_a',
              merchant_id: 'merch_a',
              price: { amount: 100, currency: 'USD' },
              store_discount_evidence: {
                offers: [
                  {
                    store_discount_id: 'store_a',
                    discount_type: 'basic',
                    status: 'available',
                    display: { badge: '10% off at checkout' },
                  },
                ],
              },
            } as any,
            {
              offer_id: 'offer_b',
              merchant_id: 'merch_b',
              price: { amount: 105, currency: 'USD' },
              payment_offer_evidence: {
                offers: [
                  {
                    payment_offer_id: 'card_b',
                    eligibility: { status: 'potential' },
                    display: { badge: '3% card benefit' },
                  },
                ],
              },
            } as any,
          ],
        })}
      />,
    );

    expect(screen.getByText('From $100')).toBeInTheDocument();
    expect(screen.getByText('10% off at checkout')).toBeInTheDocument();
    expect(screen.getByText('Offers vary by seller')).toBeInTheDocument();
    expect(screen.queryByText('3% card benefit')).not.toBeInTheDocument();
  });
});
