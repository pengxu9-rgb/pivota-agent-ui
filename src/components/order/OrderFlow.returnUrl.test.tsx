import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import OrderFlow from './OrderFlow'

const previewQuoteMock = vi.fn()
const createOrderMock = vi.fn()
const processPaymentMock = vi.fn()
const confirmOrderPaymentMock = vi.fn()
const getMerchantIdMock = vi.fn()
const pushMock = vi.fn()
const backMock = vi.fn()
const toastErrorMock = vi.fn()
const toastMessageMock = vi.fn()
const toastSuccessMock = vi.fn()

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
  createOrder: (...args: unknown[]) => createOrderMock(...args),
  processPayment: (...args: unknown[]) => processPaymentMock(...args),
  getMerchantId: (...args: unknown[]) => getMerchantIdMock(...args),
  accountsLogin: vi.fn(),
  accountsLoginWithPassword: vi.fn(),
  accountsVerify: vi.fn(),
  previewQuote: (...args: unknown[]) => previewQuoteMock(...args),
  confirmOrderPayment: (...args: unknown[]) => confirmOrderPaymentMock(...args),
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
    error: (...args: unknown[]) => toastErrorMock(...args),
    message: (...args: unknown[]) => toastMessageMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}))

// The PSP return URL (processPayment return_url, Stripe confirm return_url) must not carry the checkout
// token: the PSP receives and may log it. The success page reads the token from storage instead.
describe('OrderFlow PSP return_url', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMerchantIdMock.mockReturnValue('merchant_checkout')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response)
  })

  it('sends a return_url without the checkout token', async () => {
    previewQuoteMock.mockResolvedValue({
      quote_id: 'quote_123',
      currency: 'USD',
      pricing: { subtotal: 24, shipping_fee: 0, tax: 0, total: 24 },
      line_items: [{ variant_id: 'var_123', unit_price_effective: 24 }],
      delivery_options: [],
    })
    createOrderMock.mockResolvedValue({ order_id: 'ord_return_1' })
    processPaymentMock.mockRejectedValue(new Error('stop after payload capture'))

    const { container } = render(
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
        checkoutToken="tok_return_url_secret"
      />,
    )

    fireEvent.change(container.querySelector('input[type="email"]') as HTMLInputElement, {
      target: { value: 'buyer@example.com' },
    })
    fireEvent.change(container.querySelector('input[autocomplete="name"]') as HTMLInputElement, {
      target: { value: 'Buyer One' },
    })
    fireEvent.change(container.querySelector('input[autocomplete="address-line1"]') as HTMLInputElement, {
      target: { value: '123 Market St' },
    })
    fireEvent.change(container.querySelector('input[autocomplete="address-level2"]') as HTMLInputElement, {
      target: { value: 'San Francisco' },
    })
    fireEvent.change(container.querySelector('input[autocomplete="postal-code"]') as HTMLInputElement, {
      target: { value: '94107' },
    })

    fireEvent.click(screen.getAllByRole('button', { name: /continue to payment/i })[0])

    await waitFor(() => {
      expect(processPaymentMock).toHaveBeenCalled()
    })

    for (const call of processPaymentMock.mock.calls) {
      const returnUrl = String((call[0] as Record<string, any>)?.return_url || '')
      expect(returnUrl).toContain('/order/success')
      expect(returnUrl).toContain('orderId=ord_return_1')
      expect(returnUrl).not.toContain('checkout_token')
      expect(returnUrl).not.toContain('tok_return_url_secret')
    }
  })
})
