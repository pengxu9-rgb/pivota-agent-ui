import React from 'react'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import OrderFlow from './OrderFlow'

const pushMock = vi.fn()
const backMock = vi.fn()
const setSessionMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, back: backMock }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ExpressCheckoutElement: () => <div data-testid="express-checkout-element" />,
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: () => null,
  useElements: () => null,
}))

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: () => Promise.resolve(null),
}))

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
  useAuthStore: () => ({ user: null, setSession: setSessionMock }),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), message: vi.fn(), success: vi.fn() },
}))

describe('OrderFlow checkout prefill — pk not blocked by buyer-vault lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches /api/checkout/prefill (carrying stripe_config) even when /api/buyer/me hangs', async () => {
    // Regression guard: the render-critical Stripe publishable key is carried by
    // /api/checkout/prefill. It must be fetched CONCURRENTLY with the Buyer-Vault
    // lookup (/api/buyer/me), not serialized behind it — otherwise a slow buyer/me
    // (observed 2–6.6s in prod) delays the deferred card-form mount (>20s).
    // Here /api/buyer/me never resolves; the old serial code would never reach the
    // prefill fetch, so this test fails on the regression and passes on the fix.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/buyer/me')) {
          return new Promise<Response>(() => {}) // hangs forever
        }
        if (url.includes('/api/checkout/prefill')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              stripe_config: { publishable_key: 'pk_test_parallel', stripe_account: null },
              prefill: null,
            }),
          } as Response)
        }
        return Promise.resolve({ ok: false, json: async () => ({}) } as Response)
      })

    render(
      <OrderFlow
        checkoutToken="tok_parallel_123"
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
      const calledPrefill = fetchSpy.mock.calls.some((c) =>
        String(c[0]).includes('/api/checkout/prefill'),
      )
      expect(calledPrefill).toBe(true)
    })
    // And the buyer-vault lookup was also dispatched (concurrently).
    expect(
      fetchSpy.mock.calls.some((c) => String(c[0]).includes('/api/buyer/me')),
    ).toBe(true)
  })
})
