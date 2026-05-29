import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import OrderFlow, {
  isValidCheckoutReceiptEmail,
  shouldRequireCheckoutEmailVerification,
} from './OrderFlow'

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
const setSessionMock = vi.fn()

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
  recordPaymentOfferEvidence: vi.fn(),
}))

vi.mock('@/store/cartStore', () => ({
  useCartStore: (selector: (state: { clearCart: () => void }) => unknown) =>
    selector({ clearCart: vi.fn() }),
}))

vi.mock('@/store/authStore', () => ({
  useAuthStore: () => ({
    user: null,
    setSession: setSessionMock,
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    message: (...args: unknown[]) => toastMessageMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}))

function fillShippingForm(container: HTMLElement, email = 'guest@example.com') {
  fireEvent.change(container.querySelector('input[type="email"]') as HTMLInputElement, {
    target: { value: email },
  })
  fireEvent.change(container.querySelector('input[autocomplete="name"]') as HTMLInputElement, {
    target: { value: 'Guest Buyer' },
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
}

describe('OrderFlow guest-first checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMerchantIdMock.mockReturnValue('merchant_checkout')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response)
  })

  it('treats email verification as optional before purchase', () => {
    expect(
      shouldRequireCheckoutEmailVerification({
        hasUser: false,
        skipEmailVerification: false,
      }),
    ).toBe(false)
    expect(
      shouldRequireCheckoutEmailVerification({
        hasUser: true,
        skipEmailVerification: false,
      }),
    ).toBe(false)
    expect(
      shouldRequireCheckoutEmailVerification({
        hasUser: false,
        skipEmailVerification: true,
      }),
    ).toBe(false)
  })

  it('validates the guest receipt email shape', () => {
    expect(isValidCheckoutReceiptEmail('guest@example.com')).toBe(true)
    expect(isValidCheckoutReceiptEmail(' guest@example.com ')).toBe(true)
    expect(isValidCheckoutReceiptEmail('guest')).toBe(false)
    expect(isValidCheckoutReceiptEmail('guest@example')).toBe(false)
    expect(isValidCheckoutReceiptEmail('')).toBe(false)
  })

  it('lets a standard guest reach payment and submit without OTP or password', async () => {
    previewQuoteMock.mockResolvedValueOnce({
      quote_id: 'quote_guest_123',
      currency: 'USD',
      pricing: {
        subtotal: 24,
        shipping_fee: 0,
        tax: 0,
        total: 24,
      },
      line_items: [
        {
          variant_id: 'var_123',
          unit_price_effective: 24,
        },
      ],
      delivery_options: [],
    })
    createOrderMock.mockResolvedValueOnce({
      order_id: 'ord_guest_123',
    })
    processPaymentMock.mockResolvedValueOnce({
      payment_status: 'requires_action',
      psp: 'stripe',
      client_secret: 'pi_guest_secret_123',
      payment_action: {
        type: 'stripe_client_secret',
        client_secret: 'pi_guest_secret_123',
        public_key: 'pk_test_guest_123',
      },
    })

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
      />,
    )

    fillShippingForm(container)

    expect(screen.getAllByText(/Have an account\? Sign in \(optional\)/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/You can continue as a guest/i).length).toBeGreaterThan(0)

    fireEvent.click(screen.getAllByRole('button', { name: /continue to payment/i })[0])

    expect(await screen.findByTestId('payment-element')).toBeInTheDocument()
    expect(createOrderMock).toHaveBeenCalledTimes(1)
    expect(processPaymentMock).toHaveBeenCalledTimes(1)
    expect(toastErrorMock).not.toHaveBeenCalledWith('Please verify your email to continue.')
    expect(toastErrorMock).not.toHaveBeenCalledWith('Please complete email verification to continue.')

    fireEvent.click(screen.getByRole('button', { name: /^Pay/i }))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled()
    })
    expect(toastErrorMock).not.toHaveBeenCalledWith('Please verify your email before paying.')
    expect(toastErrorMock).not.toHaveBeenCalledWith('Please complete email verification before paying.')
  })
})
