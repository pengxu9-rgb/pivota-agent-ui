import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import OrderPage from './page';

const pushMock = vi.fn();
const getAccountOrderMock = vi.fn();
const publicOrderResumeMock = vi.fn();
const setMerchantIdMock = vi.fn();

let searchParamsValue = 'orderId=ORD_RESUME_1&email=buyer@example.com';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(searchParamsValue),
}));

vi.mock('next/image', () => ({
  default: (props: any) => <img {...props} alt={props.alt || ''} />,
}));

vi.mock('@/components/order/OrderFlow', () => ({
  default: (props: any) => (
    <div data-testid="order-flow">
      {props.resumeOrder?.orderId}:{props.items?.length || 0}:
      {props.resumeOrder?.quote?.pricing?.subtotal ?? 'na'}:
      {props.resumeOrder?.quote?.pricing?.discount_total ?? 'na'}:
      {props.resumeOrder?.quote?.pricing?.shipping_fee ?? 'na'}
    </div>
  ),
}));

vi.mock('@/lib/api', () => ({
  getAccountOrder: (...args: unknown[]) => getAccountOrderMock(...args),
  publicOrderResume: (...args: unknown[]) => publicOrderResumeMock(...args),
  setMerchantId: (...args: unknown[]) => setMerchantIdMock(...args),
}));

vi.mock('@/lib/checkoutToken', () => ({
  getCheckoutContextFromBrowser: () => ({ token: null, source: null }),
  normalizeCheckoutSource: (value: string | null | undefined) => value || null,
}));

describe('Order page resume fallback', () => {
  beforeEach(() => {
    searchParamsValue = 'orderId=ORD_RESUME_1&email=buyer@example.com';
    pushMock.mockReset();
    getAccountOrderMock.mockReset();
    publicOrderResumeMock.mockReset();
    setMerchantIdMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to public order resume when the private account order fetch is unavailable', async () => {
    getAccountOrderMock.mockRejectedValue({ status: 401, code: 'UNAUTHENTICATED' });
    publicOrderResumeMock.mockResolvedValue({
      order: {
        order_id: 'ORD_RESUME_1',
        merchant_id: 'merch_1',
        currency: 'USD',
        total_amount_minor: 953,
        shipping_address: {
          name: 'Buyer Example',
          city: 'San Francisco',
          country: 'US',
          postal_code: '94105',
        },
      },
      items: [
        {
          product_id: 'prod_1',
          variant_id: 'var_1',
          title: 'Resume Item',
          quantity: 1,
          unit_price_minor: 153,
          subtotal_minor: 153,
          merchant_id: 'merch_1',
        },
      ],
      payment: {
        current: {
          psp: 'stripe',
          payment_intent_id: 'pi_123',
          payment_action: { type: 'stripe_client_secret' },
        },
      },
      pricing_quote: {
        quote_id: 'q_resume_1',
        currency: 'USD',
        pricing: {
          subtotal: '1.53',
          discount_total: '0.16',
          shipping_fee: '8.00',
          tax: '0.00',
          total: '9.37',
        },
      },
      customer: {
        email: 'buyer@example.com',
      },
    });

    render(<OrderPage />);

    await waitFor(() => {
      expect(screen.getByTestId('order-flow')).toHaveTextContent('ORD_RESUME_1:1:1.53:0.16:8');
    });

    expect(getAccountOrderMock).toHaveBeenCalledWith('ORD_RESUME_1');
    expect(publicOrderResumeMock).toHaveBeenCalledWith('ORD_RESUME_1', 'buyer@example.com');
    expect(setMerchantIdMock).toHaveBeenCalledWith('merch_1');
  });
});
