import { describe, expect, it } from 'vitest'

import {
  resolveCheckoutPaymentMethodHint,
  resolveStripeAccount,
  resolveStripePaymentMethodOrder,
  resolveStripePublishableKey,
  shouldHydrateCreatedOrderPaymentSurface,
} from './OrderFlow'

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
})
