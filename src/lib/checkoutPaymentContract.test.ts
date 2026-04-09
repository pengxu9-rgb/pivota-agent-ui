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
