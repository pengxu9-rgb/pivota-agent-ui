import React from 'react'
import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { loadStripeMock } = vi.hoisted(() => ({
  loadStripeMock: vi.fn((..._args: unknown[]) => Promise.resolve(null)),
}))

import OrderFlow, { clearStripePromiseCacheForTests } from './OrderFlow'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ExpressCheckoutElement: () => <div data-testid="express-checkout-element" />,
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: () => null,
  useElements: () => null,
}))

vi.mock('@stripe/stripe-js', () => ({ loadStripe: loadStripeMock }))

vi.mock('@/lib/api', () => ({
  createOrder: vi.fn(),
  processPayment: vi.fn(),
  getMerchantId: vi.fn(() => 'merchant_checkout'),
  accountsLogin: vi.fn(),
  accountsLoginWithPassword: vi.fn(),
  accountsVerify: vi.fn(),
  previewQuote: vi.fn(),
  confirmOrderPayment: vi.fn(),
  recordPaymentOfferEvidence: vi.fn(),
}))

vi.mock('@/store/cartStore', () => ({
  useCartStore: (selector: (state: { clearCart: () => void }) => unknown) =>
    selector({ clearCart: vi.fn() }),
}))

vi.mock('@/store/authStore', () => ({
  useAuthStore: () => ({ user: null, setSession: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), message: vi.fn(), success: vi.fn() },
}))

describe('OrderFlow — prewarm Stripe.js on prefill pk arrival', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearStripePromiseCacheForTests()
    // prefill returns the merchant pk; everything else (buyer/me, etc.) 401s.
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/checkout/prefill')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            stripe_config: { publishable_key: 'pk_test_prefill_warm', stripe_account: null },
            prefill: null,
          }),
        } as Response)
      }
      return Promise.resolve({ ok: false, json: async () => ({}) } as Response)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('warms Stripe.js as soon as prefill resolves the pk — while still on the shipping step (not at continue-click)', async () => {
    // Regression guard for the serialization fix: the ~3.5s loadStripe(js.stripe.com) fetch must start
    // when the publishable key arrives during shipping (prefill), so it overlaps address entry — NOT
    // deferred until the payment step renders. We never advance past shipping here; loadStripe must
    // still be called with the prefill key.
    render(
      <OrderFlow
        checkoutToken="tok_warm_123"
        items={[
          {
            product_id: 'prod_123',
            variant_id: 'var_123',
            merchant_id: 'merchant_checkout',
            title: 'Creator serum',
            quantity: 1,
            unit_price: 24,
            currency: 'USD',
          },
        ]}
      />,
    )

    await waitFor(() => {
      expect(loadStripeMock).toHaveBeenCalled()
    })
    expect(String(loadStripeMock.mock.calls[0][0])).toBe('pk_test_prefill_warm')
  })
})
