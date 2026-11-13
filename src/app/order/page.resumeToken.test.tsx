import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import OrderPage from './page';
import { persistCheckoutContext, rememberCheckoutTokenOrder } from '@/lib/checkoutToken';

// The resume entry (/order?orderId=...) may only use a stored checkout token that is bound to that order:
// pivota-backend answers 403 on payments, confirm-payment and track for any other order (be#2760). This
// file runs the REAL checkoutToken module against real storage; only the network and OrderFlow are faked.

const getAccountOrderMock = vi.fn();
let searchParamsValue = 'orderId=ORD_1';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(searchParamsValue),
}));

vi.mock('next/image', () => ({
  default: (props: any) => <img {...props} alt={props.alt || ''} />,
}));

vi.mock('@/components/order/OrderFlow', () => ({
  default: (props: any) => (
    <div data-testid="order-flow">
      <span data-testid="checkout-token">{props.checkoutToken ?? 'none'}</span>
    </div>
  ),
}));

vi.mock('@/lib/api', () => ({
  getAccountOrder: (...args: unknown[]) => getAccountOrderMock(...args),
  publicOrderResume: vi.fn(),
  setMerchantId: vi.fn(),
}));

function mintToken(claims: Record<string, unknown>): string {
  const b64 = btoa(JSON.stringify(claims)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `v1.${b64}.${'s'.repeat(43)}`;
}

const ACCOUNT_ORDER = {
  order: {
    order_id: 'ORD_1',
    merchant_id: 'merch_1',
    currency: 'USD',
    total_amount_minor: 1000,
    shipping_address: { name: 'Buyer', city: 'SF', country: 'US', postal_code: '94105' },
  },
  items: [
    {
      product_id: 'prod_1',
      variant_id: 'var_1',
      title: 'Resume Item',
      quantity: 1,
      unit_price_minor: 1000,
      subtotal_minor: 1000,
      merchant_id: 'merch_1',
    },
  ],
  pricing_quote: {
    quote_id: 'q_1',
    currency: 'USD',
    pricing: { subtotal: 10, discount_total: 0, shipping_fee: 0, tax: 0, total: 10 },
  },
  payment: { current: { psp: 'stripe', payment_action: { type: 'stripe_client_secret' } } },
};

async function renderedToken(): Promise<string> {
  render(<OrderPage />);
  const el = await screen.findByTestId('checkout-token');
  return el.textContent || '';
}

describe('Order page resume entry and stored checkout tokens', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    searchParamsValue = 'orderId=ORD_1';
    getAccountOrderMock.mockReset();
    getAccountOrderMock.mockResolvedValue(ACCOUNT_ORDER);
  });

  afterEach(() => {
    cleanup();
  });

  it('drops a stored token that belongs to another checkout', async () => {
    const foreign = mintToken({ agent_id: 'agent_a', intent_id: 'ci_other' });
    persistCheckoutContext({ token: foreign, source: 'creator_agent' });

    expect(await renderedToken()).toBe('none');
    expect(window.sessionStorage.getItem('pivota_checkout_token')).toBeNull();
    expect(window.localStorage.getItem('pivota_checkout_token')).toBeNull();
  });

  it('keeps a stored token minted for this order', async () => {
    const bound = mintToken({ agent_id: 'agent_a', intent_id: 'ci_resume', order_id: 'ORD_1' });
    persistCheckoutContext({ token: bound, source: 'creator_agent' });

    expect(await renderedToken()).toBe(bound);
    expect(window.localStorage.getItem('pivota_checkout_token')).toBe(bound);
  });

  it('keeps a stored token this order was created under', async () => {
    const page = mintToken({ agent_id: 'agent_a', intent_id: 'ci_page' });
    persistCheckoutContext({ token: page, source: 'creator_agent' });
    rememberCheckoutTokenOrder(page, 'ORD_1');

    expect(await renderedToken()).toBe(page);
  });

  it('leaves the token alone when the page is not the resume entry (items win over orderId)', async () => {
    const foreign = mintToken({ agent_id: 'agent_a', intent_id: 'ci_other' });
    persistCheckoutContext({ token: foreign, source: 'creator_agent' });
    const items = [{ product_id: 'prod_1', merchant_id: 'merch_1', title: 'Item', quantity: 1, unit_price: 10 }];
    searchParamsValue = `orderId=ORD_1&items=${encodeURIComponent(JSON.stringify(items))}`;

    expect(await renderedToken()).toBe(foreign);
    expect(window.localStorage.getItem('pivota_checkout_token')).toBe(foreign);
  });
});
