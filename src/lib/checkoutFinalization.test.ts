import { describe, expect, it, vi } from 'vitest'

import {
  confirmPaymentWithRetry,
  extractPaymentStatusFromPayload,
  pollOrderStatusUntilSettled,
} from './checkoutFinalization'

describe('checkout finalization helpers', () => {
  it('retries retryable confirmation failures and settles once confirmation succeeds', async () => {
    const confirmPayment = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ payment_status: 'paid' })
    const sleepFn = vi.fn().mockResolvedValue(undefined)

    const result = await confirmPaymentWithRetry({
      orderId: 'ord_123',
      confirmPayment,
      maxAttempts: 3,
      retryDelayMs: 10,
      sleepFn,
    })

    expect(result).toMatchObject({
      status: 'confirmed',
      attempts: 2,
      paymentStatus: 'paid',
      lastError: null,
    })
    expect(confirmPayment).toHaveBeenCalledTimes(2)
    expect(sleepFn).toHaveBeenCalledTimes(1)
  })

  it('returns pending after retry budget is exhausted', async () => {
    const err = Object.assign(new Error('Gateway timeout'), { code: 'UPSTREAM_TIMEOUT' })
    const confirmPayment = vi.fn().mockRejectedValue(err)
    const sleepFn = vi.fn().mockResolvedValue(undefined)

    const result = await confirmPaymentWithRetry({
      orderId: 'ord_123',
      confirmPayment,
      maxAttempts: 3,
      retryDelayMs: 10,
      sleepFn,
    })

    expect(result.status).toBe('pending')
    expect(result.attempts).toBe(3)
    expect(result.lastError).toBe(err)
    expect(confirmPayment).toHaveBeenCalledTimes(3)
    expect(sleepFn).toHaveBeenCalledTimes(2)
  })

  it('keeps confirmation pending when the response is only processing', async () => {
    const confirmPayment = vi.fn().mockResolvedValue({ payment_status: 'processing' })

    const result = await confirmPaymentWithRetry({
      orderId: 'ord_123',
      confirmPayment,
      maxAttempts: 1,
    })

    expect(result).toMatchObject({
      status: 'pending',
      attempts: 1,
      paymentStatus: 'processing',
      lastError: null,
    })
  })

  it('keeps confirmation pending when no settled payment status is returned', async () => {
    const confirmPayment = vi.fn().mockResolvedValue({ ok: true })

    const result = await confirmPaymentWithRetry({
      orderId: 'ord_123',
      confirmPayment,
      maxAttempts: 1,
    })

    expect(result).toMatchObject({
      status: 'pending',
      attempts: 1,
      paymentStatus: null,
      lastError: null,
    })
  })

  it('polls order status until payment becomes backend-settled', async () => {
    let now = 0
    const getOrderStatus = vi
      .fn()
      .mockResolvedValueOnce({ payment_status: 'pending' })
      .mockResolvedValueOnce({ payment_status: 'paid' })
    const sleepFn = vi.fn().mockImplementation(async (ms: number) => {
      now += ms
    })

    const result = await pollOrderStatusUntilSettled({
      orderId: 'ord_123',
      getOrderStatus,
      timeoutMs: 1000,
      intervalMs: 200,
      sleepFn,
      nowFn: () => now,
    })

    expect(result).toMatchObject({
      status: 'confirmed',
      polls: 2,
      paymentStatus: 'paid',
      lastError: null,
    })
    expect(getOrderStatus).toHaveBeenCalledTimes(2)
    expect(sleepFn).toHaveBeenCalledTimes(1)
  })

  it('extracts payment status from nested order payloads', () => {
    expect(
      extractPaymentStatusFromPayload({
        order: {
          payment: {
            payment_status: 'completed',
          },
        },
      }),
    ).toBe('completed')
  })
})
