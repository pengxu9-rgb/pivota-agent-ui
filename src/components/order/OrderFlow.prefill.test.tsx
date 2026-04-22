import React from 'react'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import OrderFlow from './OrderFlow'

const pushMock = vi.fn()
const backMock = vi.fn()
const setSessionMock = vi.fn()
let mockAuthUser: { id?: string; email?: string | null } | null = null

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
  useAuthStore: () => ({
    user: mockAuthUser,
    setSession: setSessionMock,
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    message: vi.fn(),
    success: vi.fn(),
  },
}))

describe('OrderFlow shipping prefill', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser = null
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          buyer: { primary_email: 'buyer@example.com' },
          default_address: {
            recipient_name: 'Buyer One',
            line1: '123 Market St',
            city: 'San Francisco',
            region: 'CA',
            postal_code: '94107',
            country: 'US',
            phone: '4155550101',
          },
        }),
      } as Response)
  })

  it('re-runs buyer address prefill after sign-in', async () => {
    const props = {
      items: [
        {
          product_id: 'prod_123',
          variant_id: 'var_123',
          merchant_id: 'merchant_checkout',
          title: 'Creator serum',
          quantity: 1,
          unit_price: 24,
          currency: 'USD',
        },
      ],
    }

    const { container, rerender } = render(<OrderFlow {...props} />)

    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement
    const nameInput = container.querySelector('input[autocomplete="name"]') as HTMLInputElement
    const addressInput = container.querySelector('input[autocomplete="address-line1"]') as HTMLInputElement
    const cityInput = container.querySelector('input[autocomplete="address-level2"]') as HTMLInputElement
    const postalInput = container.querySelector('input[autocomplete="postal-code"]') as HTMLInputElement

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    })
    expect(addressInput.value).toBe('')

    mockAuthUser = { id: 'buyer_123', email: 'buyer@example.com' }
    rerender(<OrderFlow {...props} />)

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    })
    await waitFor(() => {
      expect(nameInput.value).toBe('Buyer One')
      expect(addressInput.value).toBe('123 Market St')
      expect(cityInput.value).toBe('San Francisco')
      expect(postalInput.value).toBe('94107')
      expect(emailInput.value).toBe('buyer@example.com')
    })
  })
})
