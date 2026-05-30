import React from 'react'
import { render, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { loadStripeMock, previousStripePublishableKey } = vi.hoisted(() => {
  const previousStripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_mount_prewarm'
  return {
    loadStripeMock: vi.fn(() => Promise.resolve(null)),
    previousStripePublishableKey,
  }
})

import OrderFlow from './OrderFlow'

const pushMock = vi.fn()
const backMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    back: backMock,
  }),
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
  loadStripe: loadStripeMock,
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
  useAuthStore: () => ({
    user: null,
    setSession: vi.fn(),
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    message: vi.fn(),
    success: vi.fn(),
  },
}))

afterAll(() => {
  if (previousStripePublishableKey === undefined) {
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  } else {
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = previousStripePublishableKey
  }
})

describe('OrderFlow Stripe runtime prewarm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prewarms Stripe.js once when the order page mounts', async () => {
    render(
      <OrderFlow
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
        skipEmailVerification
      />,
    )

    await waitFor(() => {
      expect(loadStripeMock).toHaveBeenCalledTimes(1)
    })
    expect(loadStripeMock).toHaveBeenCalledWith('pk_test_mount_prewarm', undefined)
  })
})
