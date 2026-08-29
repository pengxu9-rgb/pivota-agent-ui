import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import OrderFlow from './OrderFlow'

const previewQuoteMock = vi.fn()
const createOrderMock = vi.fn()
const processPaymentMock = vi.fn()
const confirmOrderPaymentMock = vi.fn()
const getMerchantIdMock = vi.fn()
const toastErrorMock = vi.fn()
const toastMessageMock = vi.fn()

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

vi.mock('@stripe/stripe-js', () => ({ loadStripe: () => Promise.resolve(null) }))

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
  useAuthStore: () => ({ user: null, setSession: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    message: (...args: unknown[]) => toastMessageMock(...args),
    success: vi.fn(),
  },
}))

// A realistic delivery option: the backend fingerprints this whole object, so every field here
// is part of the quote-vs-order comparison.
const STANDARD_OPTION = {
  id: 'standard',
  title: 'Standard',
  handle: 'standard',
  amount: 8,
  currency: 'USD',
  estimated_days: '3-5',
}

function quotePayload(quoteId: string) {
  return {
    quote_id: quoteId,
    currency: 'USD',
    pricing: { subtotal: 23, shipping_fee: 8, tax: 0, total: 31 },
    line_items: [{ variant_id: 'var_123', unit_price_effective: 23 }],
    delivery_options: [STANDARD_OPTION],
  }
}

function fillShippingForm(container: HTMLElement) {
  fireEvent.change(container.querySelector('input[type="email"]') as HTMLInputElement, {
    target: { value: 'guest@example.com' },
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

// Regression: the FIRST create_order of every checkout returned 409 QUOTE_MISMATCH, and the retry
// then succeeded. Verified against prod logs (2026-08-29 04:29:05Z 409 on /agent/v1/orders/create,
// re-quote, 04:29:09Z 200) — the 409 lands before `validate_quote_snapshot_live` even runs, i.e.
// on the request-fingerprint comparison.
//
// Cause: the first quote is requested with NO selected_delivery_option, then refreshQuote
// auto-selects delivery_options[0] for display, and create_order sent that display-only choice.
// The backend fingerprints `selected_delivery_option` into both the quote and the order request,
// so the order could not match the quote it named.
describe('OrderFlow quote/order delivery-option alignment', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getMerchantIdMock.mockReturnValue('merchant_checkout')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response)
  })

  afterEach(() => {
    cleanup()
  })

  it('creates the order with the delivery option the quote was actually priced with', async () => {
    previewQuoteMock.mockResolvedValue(quotePayload('quote_align_1'))
    createOrderMock.mockResolvedValue({ order_id: 'ord_align_1' })
    processPaymentMock.mockResolvedValue({
      status: 'pending',
      payment_status: 'pending',
      psp: 'stripe',
      confirmation_owner: 'client',
      requires_client_confirmation: true,
      client_secret: 'pi_align_secret',
      payment_action: {
        type: 'stripe_client_secret',
        client_secret: 'pi_align_secret',
        public_key: 'pk_test_align',
        submit_owner: 'external_button',
        component_kind: 'stripe_payment_element',
        supported_in_shopping_ui: true,
      },
    })

    const { container } = render(
      <OrderFlow
        items={[
          {
            product_id: 'prod_123',
            variant_id: 'var_123',
            merchant_id: 'merchant_checkout',
            title: 'Knight Unicorn Satin Blush',
            quantity: 1,
            unit_price: 23,
            currency: 'USD',
          },
        ]}
      />,
    )

    fillShippingForm(container)
    fireEvent.click(screen.getAllByRole('button', { name: /continue to payment/i })[0])

    await waitFor(() => expect(createOrderMock).toHaveBeenCalled(), { timeout: 10_000 })

    // Positive counterpart: prove a quote really was requested, so the comparison below is not
    // between two absent values.
    expect(previewQuoteMock).toHaveBeenCalled()
    const quoteReq = previewQuoteMock.mock.calls[0][0] as Record<string, unknown>
    const orderReq = createOrderMock.mock.calls[0][0] as Record<string, unknown>

    // THE INVARIANT. The backend hashes selected_delivery_option into both the quote's
    // request_fingerprint and the order's, then rejects the order when they differ. Whatever the
    // quote was priced with — here, nothing — the order must carry exactly the same thing.
    // Sending `selectedDeliveryOption` instead (the pre-fix behaviour) puts the auto-selected
    // delivery_options[0] on the order while the quote had none: a guaranteed 409.
    expect(orderReq.selected_delivery_option ?? null).toEqual(
      quoteReq.selected_delivery_option ?? null,
    )
  }, 30_000)
})
