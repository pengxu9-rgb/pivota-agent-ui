import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    error: (...args: unknown[]) => toastErrorMock(...args),
    message: (...args: unknown[]) => toastMessageMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}))

const MISSING_KEY_MESSAGE =
  'Stripe public key is missing for this merchant. Reconnect Stripe and try again.'

function quotePayload(quoteId: string) {
  return {
    quote_id: quoteId,
    currency: 'USD',
    pricing: { subtotal: 23, shipping_fee: 8, tax: 0, total: 31 },
    line_items: [{ variant_id: 'var_123', unit_price_effective: 23 }],
    delivery_options: [],
  }
}

// Mirrors the real confirm_payment/submit_payment body observed in production: the buyer's
// browser owns confirmation, so OrderFlow must route into the Stripe client-confirmation branch
// rather than settling the order server-side. Getting this shape wrong makes the regression
// assertions below vacuous.
//
// On `public_key`: the production body captured from agent.pivota.cc carried none — the key
// reaches the client on the create_order response. Both shapes are exercised here because
// `resolveStripePublishableKey` accepts either, and the guard must hold for both.
function paymentPendingResponse(clientSecret: string) {
  return {
    status: 'pending',
    payment_status: 'pending',
    payment_status_raw: 'awaiting_payment',
    psp: 'stripe',
    confirmation_owner: 'client',
    requires_client_confirmation: true,
    client_secret: clientSecret,
    payment_action: {
      type: 'stripe_client_secret',
      client_secret: clientSecret,
      public_key: 'pk_test_arrived_with_this_response',
      submit_owner: 'external_button',
      component_kind: 'stripe_payment_element',
      supported_in_shopping_ui: true,
    },
  }
}

// POSITIVE counterpart to the `not.toHaveBeenCalledWith(MISSING_KEY_MESSAGE)` assertions below.
// Without this, an unrelated failure ANYWHERE earlier in the click (a throw before the Stripe
// branch, a bail-out in create_order, a settled-server-side contract) leaves the negative
// assertion trivially true and the whole file green while the guard it exists to protect never
// runs. Both messages below are emitted only AFTER the publishable-key guard has passed:
//   - the ready prompt, when the card form is not mounted yet;
//   - the confirmation failure, when it is mounted and Stripe rejects the empty/unmocked form.
function expectClickReachedStripeConfirmation() {
  const sawReadyPrompt = toastMessageMock.mock.calls.some((call) =>
    String(call[0] ?? '').includes('press Pay to complete your order'),
  )
  const sawConfirmationAttempt = toastErrorMock.mock.calls.some((call) =>
    String(call[0] ?? '').includes('Payment failed'),
  )
  expect(sawReadyPrompt || sawConfirmationAttempt).toBe(true)
}

function quoteDriftError() {
  const err = new Error('order request does not match quote snapshot') as Error & { code?: string }
  err.code = 'QUOTE_MISMATCH'
  return err
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

// Regression: production checkout reported "Stripe public key is missing for this merchant.
// Reconnect Stripe and try again." on the FIRST Pay click, every time, for a merchant whose
// Stripe connection was perfectly healthy — the second click then paid on the same key.
//
// The trigger is a payment-step prefetch whose create_order drifts (QUOTE_MISMATCH). That leaves
// `stripePublishableKey` empty, so the card form is not mounted. The click then re-creates the
// order, resolves the key from that response and calls setStripePublishableKey — but the guard a
// few statements later read the render-scoped const, which a state setter does not rebind, so it
// still saw '' and blamed the merchant's Stripe connection.
describe('OrderFlow first-click Stripe runtime', () => {
  beforeEach(() => {
    // resetAllMocks rather than clearAllMocks: clearAllMocks leaves any unconsumed
    // `mockRejectedValueOnce` on the queue, where it would fire inside a LATER test. These tests
    // each consume exactly one, so both work today — reset is the one that stays correct if a
    // test is later changed to not reach its drift.
    vi.resetAllMocks()
    getMerchantIdMock.mockReturnValue('merchant_checkout')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response)
  })

  // Each test here mounts the whole OrderFlow tree. Without an explicit unmount the previous
  // tree stays in the document, and `screen.getAllByRole(...)[0]` then drives the STALE
  // component — which silently turns the later tests into assertions about test 1.
  afterEach(() => {
    cleanup()
  })

  it('never blames the merchant Stripe connection when the key arrives during the paying click', async () => {
    previewQuoteMock.mockResolvedValue(quotePayload('quote_drift_1'))
    // The payment-step prefetch drifts, so nothing sets a publishable key and the card form
    // never mounts. Every later create_order succeeds and carries the key.
    createOrderMock.mockRejectedValueOnce(quoteDriftError())
    createOrderMock.mockResolvedValue({ order_id: 'ord_drift_123' })
    processPaymentMock.mockResolvedValue(paymentPendingResponse('pi_drift_secret_123'))

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

    const payButton = await screen.findByRole('button', { name: /^Pay/i }, { timeout: 10_000 })
    fireEvent.click(payButton)

    await waitFor(
      () => {
        expect(createOrderMock.mock.calls.length).toBeGreaterThan(1)
      },
      { timeout: 10_000 },
    )

    // The delivering assertion. Reverting the guard to read the render-scoped
    // `stripePublishableKey` makes this fail: the buyer is told to reconnect Stripe.
    await waitFor(() => expectClickReachedStripeConfirmation(), { timeout: 10_000 })
    expect(toastErrorMock).not.toHaveBeenCalledWith(MISSING_KEY_MESSAGE)
    expect(toastErrorMock).not.toHaveBeenCalledWith(expect.stringContaining('Reconnect Stripe'))

    // The key only became known during this click, so <Elements> has not mounted and the buyer
    // has never seen a card field. The click must end on a neutral prompt and NO error at all —
    // deleting the not-yet-mounted guard makes this fail, because the flow pushes on to Stripe
    // with an empty form and reports "Payment failed. Please check the payment details".
    expect(toastMessageMock).toHaveBeenCalledWith(
      'Payment details are ready — press Pay to complete your order.',
    )
    expect(toastErrorMock).not.toHaveBeenCalled()
  }, 30_000)

  // At pay time OrderFlow reuses the create_order payment response when one is available
  // (`getReusableCreatedOrderPayment`), and in production THAT is the response carrying the
  // publishable key — the submit-payment body captured from agent.pivota.cc has none. So the key
  // the guard sees comes from the reused create-order response, not from the pay call.
  it('takes the key from the reused create-order payment response', async () => {
    previewQuoteMock.mockResolvedValue(quotePayload('quote_drift_3'))
    createOrderMock.mockRejectedValueOnce(quoteDriftError())
    createOrderMock.mockResolvedValue({
      order_id: 'ord_drift_789',
      payment_action: {
        type: 'stripe_client_secret',
        client_secret: 'pi_drift_secret_789',
        public_key: 'pk_test_from_create_order',
      },
    })
    // Deliberately keyless AND deliberately poisoned: if OrderFlow ever stops reusing the
    // create-order response and calls this instead, the test must fail rather than quietly pass.
    processPaymentMock.mockImplementation(() => {
      throw new Error('pay-time processPayment should not be reached when create_order is reusable')
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

    const payButton = await screen.findByRole('button', { name: /^Pay/i }, { timeout: 10_000 })
    fireEvent.click(payButton)

    await waitFor(
      () => {
        expect(createOrderMock.mock.calls.length).toBeGreaterThan(1)
      },
      { timeout: 10_000 },
    )
    await waitFor(() => expectClickReachedStripeConfirmation(), { timeout: 10_000 })
    expect(toastErrorMock).not.toHaveBeenCalledWith(MISSING_KEY_MESSAGE)
  }, 30_000)

  it('confirms on the mounted card form rather than aborting on the stale key', async () => {
    previewQuoteMock.mockResolvedValue(quotePayload('quote_drift_2'))
    createOrderMock.mockRejectedValueOnce(quoteDriftError())
    createOrderMock.mockResolvedValue({ order_id: 'ord_drift_456' })
    processPaymentMock.mockResolvedValue(paymentPendingResponse('pi_drift_secret_456'))

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

    const payButton = await screen.findByRole('button', { name: /^Pay/i }, { timeout: 10_000 })
    fireEvent.click(payButton)

    // The card form is mounted (the prefetch's own drift handler recovered and applied the key),
    // so the ONLY thing that was broken on this click was the guard reading a stale const. The
    // click must therefore reach Stripe confirmation on the mounted element instead of aborting.
    expect(await screen.findByTestId('payment-element', {}, { timeout: 10_000 })).toBeInTheDocument()
    await waitFor(() => expectClickReachedStripeConfirmation(), { timeout: 10_000 })
    expect(toastErrorMock).not.toHaveBeenCalledWith(MISSING_KEY_MESSAGE)
  }, 30_000)
})
