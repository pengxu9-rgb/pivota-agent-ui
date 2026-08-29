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

// Realistic delivery options. compute_request_fingerprint hashes the WHOLE object (it is the one
// field it does not normalise), so these assertions compare whole objects, not ids. Two options,
// because the shipping-method <select> only renders when there is more than one — and that
// <select> is how the tests below prove the display-only auto-select actually happened.
const STANDARD_OPTION = {
  id: 'standard',
  title: 'Standard',
  handle: 'standard',
  amount: 8,
  currency: 'USD',
  estimated_days: '3-5',
}
const EXPRESS_OPTION = {
  id: 'express',
  title: 'Express',
  handle: 'express',
  amount: 18,
  currency: 'USD',
  estimated_days: '1-2',
}

// A fresh quote_id per call, as the backend does. Reusing one makes buildPaymentInitKeyForQuote
// de-duplicate the second checkout leg, and the re-quote test would silently never re-create.
let quoteSeq = 0
function nextQuotePayload() {
  quoteSeq += 1
  return {
    quote_id: `quote_align_${quoteSeq}`,
    currency: 'USD',
    pricing: { subtotal: 23, shipping_fee: 8, tax: 0, total: 31 },
    line_items: [{ variant_id: 'var_123', unit_price_effective: 23 }],
    delivery_options: [STANDARD_OPTION, EXPRESS_OPTION],
  }
}

const STRIPE_PENDING_PAYMENT = {
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
}

const ITEMS = [
  {
    product_id: 'prod_123',
    variant_id: 'var_123',
    merchant_id: 'merchant_checkout',
    title: 'Knight Unicorn Satin Blush',
    quantity: 1,
    unit_price: 23,
    currency: 'USD',
  },
]

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

  it('does not put the display-only auto-selected option on an order the quote never priced', async () => {
    quoteSeq = 0
    previewQuoteMock.mockImplementation(async () => nextQuotePayload())
    createOrderMock.mockResolvedValue({ order_id: 'ord_align_1' })
    processPaymentMock.mockResolvedValue(STRIPE_PENDING_PAYMENT)

    const { container } = render(<OrderFlow items={ITEMS} />)
    fillShippingForm(container)
    fireEvent.click(screen.getAllByRole('button', { name: /continue to payment/i })[0])

    await waitFor(() => expect(createOrderMock).toHaveBeenCalled(), { timeout: 10_000 })

    // ANTI-VACUITY GUARDS. Both assertions below compare possibly-absent values, so without these
    // the test would pass as `undefined === undefined` on a fixture that never produced delivery
    // options at all — i.e. trimming `delivery_options` would silently disarm the regression.
    const select = (await screen.findByRole('combobox')) as HTMLSelectElement
    expect(select.options.length).toBe(2)
    // The <select> value is the index of the option matching `selectedDeliveryOption`, so '0'
    // proves the display-only auto-select of opts[0] — the exact state whose leak WAS the bug —
    // really fired before create_order ran.
    expect(select.value).toBe('0')

    const quoteReq = previewQuoteMock.mock.calls[0][0] as Record<string, unknown>
    const orderReq = createOrderMock.mock.calls[0][0] as Record<string, unknown>

    // THE INVARIANT. The backend hashes selected_delivery_option into both the quote's
    // request_fingerprint and the order's, then 409s when they differ. The quote was priced
    // without one, so the order must carry none either.
    expect(quoteReq.selected_delivery_option).toBeUndefined()
    expect(orderReq.selected_delivery_option).toBeUndefined()
  }, 30_000)

  it('sends the option the buyer picked, because choosing one re-quotes first', async () => {
    quoteSeq = 0
    previewQuoteMock.mockImplementation(async () => nextQuotePayload())
    createOrderMock.mockImplementation(async () => ({ order_id: `ord_align_${quoteSeq}` }))
    processPaymentMock.mockResolvedValue(STRIPE_PENDING_PAYMENT)

    const { container } = render(<OrderFlow items={ITEMS} />)
    fillShippingForm(container)
    fireEvent.click(screen.getAllByRole('button', { name: /continue to payment/i })[0])
    await waitFor(() => expect(createOrderMock).toHaveBeenCalled(), { timeout: 10_000 })

    // The buyer switches to Express. That re-quotes WITH the option, so this time the order must
    // carry it. Simply never sending selected_delivery_option would break checkout in the mirror
    // direction — the quote priced with an option, the order without — and this is what catches it.
    const select = (await screen.findByRole('combobox')) as HTMLSelectElement
    fireEvent.change(select, { target: { value: '1' } })

    await waitFor(() => expect(previewQuoteMock.mock.calls.length).toBeGreaterThanOrEqual(2), {
      timeout: 10_000,
    })
    await waitFor(() => expect(createOrderMock.mock.calls.length).toBeGreaterThanOrEqual(2), {
      timeout: 10_000,
    })

    const lastQuoteReq = previewQuoteMock.mock.calls.at(-1)![0] as Record<string, unknown>
    const lastOrderReq = createOrderMock.mock.calls.at(-1)![0] as Record<string, unknown>
    // Whole-object equality, because that is what compute_request_fingerprint hashes.
    expect(lastQuoteReq.selected_delivery_option).toEqual(EXPRESS_OPTION)
    expect(lastOrderReq.selected_delivery_option).toEqual(EXPRESS_OPTION)
  }, 30_000)
})
