import { describe, expect, it } from 'vitest'

import {
  isBackendSettledPaymentStatus,
  resolveCheckoutPaymentContract,
} from './checkoutPaymentContract'

describe('resolveCheckoutPaymentContract', () => {
  it('treats processing + stripe_client_secret as client-owned confirmation', () => {
    const contract = resolveCheckoutPaymentContract({
      paymentResponse: {
        status: 'processing',
        payment_action: {
          type: 'stripe_client_secret',
        },
      },
      action: {
        type: 'stripe_client_secret',
      },
    })

    expect(contract).toMatchObject({
      paymentStatus: 'processing',
      confirmationOwner: 'client',
      requiresClientConfirmation: true,
      submitOwner: 'external_button',
      componentKind: 'stripe_payment_element',
      supportedInShoppingUi: true,
    })
  })

  it('treats processing + redirect_url as client-owned confirmation', () => {
    const contract = resolveCheckoutPaymentContract({
      paymentResponse: {
        status: 'processing',
      },
      action: {
        type: 'redirect_url',
      },
    })

    expect(contract).toMatchObject({
      paymentStatus: 'processing',
      confirmationOwner: 'client',
      requiresClientConfirmation: true,
      submitOwner: 'redirect',
      supportedInShoppingUi: true,
    })
  })

  it('treats processing without action as backend-owned but not settled', () => {
    const contract = resolveCheckoutPaymentContract({
      paymentResponse: {
        status: 'processing',
      },
    })

    expect(contract).toMatchObject({
      paymentStatus: 'processing',
      confirmationOwner: 'backend',
      requiresClientConfirmation: false,
      submitOwner: null,
    })
  })

  it('does not treat processing as a settled payment status', () => {
    expect(isBackendSettledPaymentStatus('processing')).toBe(false)
    expect(isBackendSettledPaymentStatus('paid')).toBe(true)
    expect(isBackendSettledPaymentStatus('completed')).toBe(true)
    expect(isBackendSettledPaymentStatus('succeeded')).toBe(true)
  })

  it('treats requires_action as client-owned confirmation', () => {
    const contract = resolveCheckoutPaymentContract({
      paymentResponse: {
        payment_status: 'requires_action',
      },
    })

    expect(contract).toMatchObject({
      paymentStatus: 'requires_action',
      confirmationOwner: 'client',
      requiresClientConfirmation: true,
    })
  })

  it('uses explicit submit ownership from the backend contract', () => {
    const contract = resolveCheckoutPaymentContract({
      paymentResponse: {
        payment_status: 'requires_action',
        confirmation_owner: 'client',
        requires_client_confirmation: true,
        payment_action: {
          type: 'checkout_session',
          submit_owner: 'unsupported',
          component_kind: 'checkout_embedded',
          supported_in_shopping_ui: false,
        },
      },
      action: {
        type: 'checkout_session',
        submit_owner: 'unsupported',
        component_kind: 'checkout_embedded',
        supported_in_shopping_ui: false,
      },
    })

    expect(contract).toMatchObject({
      paymentStatus: 'requires_action',
      confirmationOwner: 'client',
      requiresClientConfirmation: true,
      submitOwner: 'unsupported',
      componentKind: 'checkout_embedded',
      supportedInShoppingUi: false,
    })
  })

  it('reads explicit contract fields from paymentResponse.payment_action without a separate action arg', () => {
    const contract = resolveCheckoutPaymentContract({
      paymentResponse: {
        payment_status: 'requires_action',
        payment_action: {
          type: 'adyen_session',
          confirmation_owner: 'client',
          requires_client_confirmation: true,
          submit_owner: 'component',
          component_kind: 'adyen_dropin',
          supported_in_shopping_ui: true,
        },
      },
    })

    expect(contract).toMatchObject({
      paymentStatus: 'requires_action',
      confirmationOwner: 'client',
      requiresClientConfirmation: true,
      submitOwner: 'component',
      componentKind: 'adyen_dropin',
      supportedInShoppingUi: true,
    })
  })

  it('reads explicit ownership fields from the supplied action object', () => {
    const contract = resolveCheckoutPaymentContract({
      paymentResponse: {
        payment_status: 'requires_action',
      },
      action: {
        type: 'stripe_client_secret',
        confirmation_owner: 'client',
        requires_client_confirmation: true,
        submit_owner: 'external_button',
        component_kind: 'stripe_payment_element',
        supported_in_shopping_ui: true,
      },
    })

    expect(contract).toMatchObject({
      paymentStatus: 'requires_action',
      confirmationOwner: 'client',
      requiresClientConfirmation: true,
      submitOwner: 'external_button',
      componentKind: 'stripe_payment_element',
      supportedInShoppingUi: true,
    })
  })

  it('fails closed when upstream sends only a partial explicit contract', () => {
    const contract = resolveCheckoutPaymentContract({
      paymentResponse: {
        payment_status: 'requires_action',
        payment_action: {
          type: 'stripe_client_secret',
          submit_owner: 'external_button',
        },
      },
      action: {
        type: 'stripe_client_secret',
        submit_owner: 'external_button',
      },
    })

    expect(contract).toMatchObject({
      paymentStatus: 'requires_action',
      confirmationOwner: 'backend',
      requiresClientConfirmation: false,
      submitOwner: 'unsupported',
      componentKind: null,
      supportedInShoppingUi: false,
    })
  })

  it('normalizes failed statuses into terminal payment_failed', () => {
    const contract = resolveCheckoutPaymentContract({
      paymentResponse: {
        status: 'failed',
      },
    })

    expect(contract).toMatchObject({
      paymentStatus: 'payment_failed',
      confirmationOwner: 'backend',
      requiresClientConfirmation: false,
    })
  })

  it('ignores explicit client ownership on terminal payment failure', () => {
    const contract = resolveCheckoutPaymentContract({
      paymentResponse: {
        payment_status: 'payment_failed',
        confirmation_owner: 'client',
        requires_client_confirmation: true,
        payment_action: {
          type: 'adyen_session',
          submit_owner: 'component',
          component_kind: 'adyen_dropin',
          supported_in_shopping_ui: true,
        },
      },
      action: {
        type: 'adyen_session',
        submit_owner: 'component',
        component_kind: 'adyen_dropin',
        supported_in_shopping_ui: true,
      },
    })

    expect(contract).toMatchObject({
      paymentStatus: 'payment_failed',
      confirmationOwner: 'backend',
      requiresClientConfirmation: false,
      submitOwner: null,
      componentKind: null,
      supportedInShoppingUi: true,
    })
  })

  it('falls back unknown status without action to backend-owned', () => {
    const contract = resolveCheckoutPaymentContract({
      paymentResponse: {
        status: 'queued_for_review',
      },
    })

    expect(contract).toMatchObject({
      paymentStatus: 'queued_for_review',
      paymentStatusRaw: null,
      confirmationOwner: 'backend',
      requiresClientConfirmation: false,
    })
  })
})
