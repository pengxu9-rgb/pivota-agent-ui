import { beforeEach, describe, expect, it, vi } from 'vitest'

const { loadStripeMock } = vi.hoisted(() => ({
  loadStripeMock: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: loadStripeMock,
}))

import {
  buildPaymentOfferContextFromEvidence,
  clearStripePromiseCacheForTests,
  hasAvailableStripeExpressWallets,
  paymentOfferMatchesCurrentEvidence,
  pickSelectedPaymentOfferIdFromEvidence,
  prewarmStripeRuntime,
  resolveAdyenEnvironment,
  resolveCheckoutPaymentMethodHint,
  resolveStripeAccount,
  resolveStripePaymentMethodOrder,
  resolveStripePublishableKey,
  shouldRenderExternalPayButton,
  shouldHydrateCreatedOrderPaymentSurface,
} from './OrderFlow'

beforeEach(() => {
  clearStripePromiseCacheForTests()
  loadStripeMock.mockClear()
})

describe('resolveStripePublishableKey', () => {
  it('prefers explicit payment action public key from the backend contract', () => {
    expect(
      resolveStripePublishableKey(
        {
          payment_action: {
            type: 'stripe_client_secret',
            public_key: 'pk_live_backend_contract',
          },
        },
        null,
      ),
    ).toBe('pk_live_backend_contract')
  })

  it('falls back to nested raw public key when top-level field is absent', () => {
    expect(
      resolveStripePublishableKey(
        {
          payment: {
            payment_action: {
              raw: {
                public_key: 'pk_live_from_raw',
              },
            },
          },
        },
        null,
      ),
    ).toBe('pk_live_from_raw')
  })

  it('resolves connected account context from the backend contract', () => {
    expect(
      resolveStripeAccount(
        {
          payment_action: {
            type: 'stripe_client_secret',
            stripe_account: 'acct_live_123',
          },
        },
        null,
      ),
    ).toBe('acct_live_123')
  })

  it('leaves payment method ordering to Stripe dynamic defaults by default', () => {
    expect(resolveStripePaymentMethodOrder('US')).toBeNull()
  })

  it('keeps checkout payment hints dynamic until the customer picks a concrete Stripe method', () => {
    expect(resolveCheckoutPaymentMethodHint(null)).toBe('dynamic')
    expect(resolveCheckoutPaymentMethodHint('')).toBe('dynamic')
    expect(resolveCheckoutPaymentMethodHint('klarna')).toBe('klarna')
  })

  it('hydrates reusable create_order Stripe surfaces so fresh checkout does not re-init payment', () => {
    expect(
      shouldHydrateCreatedOrderPaymentSurface(
        { type: 'stripe_client_secret', client_secret: 'pi_secret_123' },
        'stripe',
      ),
    ).toBe(true)

    expect(
      shouldHydrateCreatedOrderPaymentSurface(
        { type: 'checkout_session', client_secret: 'cs_test_123' },
        'checkout',
      ),
    ).toBe(true)
  })

  it('shows express wallet buttons only when Apple Pay or Google Pay are actually available', () => {
    expect(hasAvailableStripeExpressWallets(undefined)).toBe(false)
    expect(hasAvailableStripeExpressWallets({ applePay: false, googlePay: false })).toBe(false)
    expect(hasAvailableStripeExpressWallets({ applePay: true, googlePay: false })).toBe(true)
    expect(hasAvailableStripeExpressWallets({ applePay: false, googlePay: true })).toBe(true)
  })

  it('prewarms stripe runtime only once for the same publishable key and account pair', async () => {
    await Promise.all([
      prewarmStripeRuntime('pk_live_cached'),
      prewarmStripeRuntime('pk_live_cached'),
    ])

    expect(loadStripeMock).toHaveBeenCalledTimes(1)
    expect(loadStripeMock).toHaveBeenCalledWith('pk_live_cached', undefined)
  })

  it('keeps a separate stripe runtime cache per connected account', async () => {
    await prewarmStripeRuntime('pk_live_platform', 'acct_live_one')
    await prewarmStripeRuntime('pk_live_platform', 'acct_live_two')

    expect(loadStripeMock).toHaveBeenCalledTimes(2)
    expect(loadStripeMock).toHaveBeenNthCalledWith(1, 'pk_live_platform', {
      stripeAccount: 'acct_live_one',
    })
    expect(loadStripeMock).toHaveBeenNthCalledWith(2, 'pk_live_platform', {
      stripeAccount: 'acct_live_two',
    })
  })

  it('does not select a network-specific payment offer from generic card evidence', () => {
    const paymentOfferEvidence = {
      offers: [
        {
          payment_offer_id: 'mc_5',
          eligibility: { status: 'context_matched' },
          requirements: {
            psp: 'stripe',
            payment_method_type: 'card',
            card_network: 'mastercard',
          },
        },
      ],
    }

    expect(
      pickSelectedPaymentOfferIdFromEvidence(paymentOfferEvidence, {
        psp: 'stripe',
        payment_method_type: 'card',
      }),
    ).toBeNull()
  })

  it('selects a wallet payment offer only when current wallet evidence satisfies requirements', () => {
    const paymentOfferEvidence = {
      offers: [
        {
          payment_offer_id: 'apple_pay_3',
          requirements: {
            psp: 'stripe',
            payment_method_type: 'wallet',
            wallet_type: 'apple_pay',
          },
        },
      ],
    }

    expect(
      pickSelectedPaymentOfferIdFromEvidence(paymentOfferEvidence, {
        psp: 'stripe',
        selected_payment_method_type: 'apple_pay',
      }),
    ).toBe('apple_pay_3')

    expect(
      pickSelectedPaymentOfferIdFromEvidence(paymentOfferEvidence, {
        psp: 'stripe',
        selected_payment_method_type: 'google_pay',
      }),
    ).toBeNull()
  })

  it('matches generic card offers but requires all concrete offer requirements', () => {
    const cardContext = buildPaymentOfferContextFromEvidence({
      psp: 'stripe',
      payment_method_type: 'card',
    })

    expect(
      paymentOfferMatchesCurrentEvidence(
        {
          requirements: {
            psp: 'stripe',
            payment_method_type: 'card',
          },
        },
        cardContext,
      ),
    ).toBe(true)

    expect(
      paymentOfferMatchesCurrentEvidence(
        {
          requirements: {
            psp: 'stripe',
            payment_method_type: 'card',
            issuer_name: 'Chase',
          },
        },
        cardContext,
      ),
    ).toBe(false)
  })

  it('derives the Adyen runtime environment from the backend action or client key prefix', () => {
    expect(
      resolveAdyenEnvironment({
        raw: {
          environment: 'live',
          clientKey: 'test_should_not_win',
        },
      }),
    ).toBe('live')

    expect(
      resolveAdyenEnvironment({
        raw: {
          clientKey: 'live_ABC123',
        },
      }),
    ).toBe('live')

    expect(
      resolveAdyenEnvironment({
        raw: {
          clientKey: 'test_ABC123',
        },
      }),
    ).toBe('test')
  })

  it('hides the external pay button once an Adyen session is mounted', () => {
    expect(shouldRenderExternalPayButton('adyen_session')).toBe(false)
    expect(shouldRenderExternalPayButton('stripe_client_secret')).toBe(true)
    expect(shouldRenderExternalPayButton(null)).toBe(true)
  })
})
