import { describe, expect, it } from 'vitest'

import { buildCheckoutTimingSnapshot } from './OrderFlow'

describe('buildCheckoutTimingSnapshot', () => {
  it('derives the main checkout latency breakdown from timing marks', () => {
    const snapshot = buildCheckoutTimingSnapshot({
      shipping_submit_started_at_ms: 1000,
      quote_ready_at_ms: 1600,
      payment_step_visible_at_ms: 2200,
      payment_init_started_at_ms: 1700,
      create_order_started_at_ms: 1750,
      create_order_completed_at_ms: 2050,
      submit_payment_started_at_ms: 2050,
      submit_payment_completed_at_ms: 2550,
      wallets_ready_at_ms: 2800,
      payment_element_ready_at_ms: 2950,
    })

    expect(snapshot.durations_ms).toEqual({
      shipping_to_quote_ms: 600,
      shipping_to_payment_step_ms: 1200,
      shipping_to_payment_init_ms: 700,
      quote_to_payment_init_ms: 100,
      payment_init_to_create_order_ms: 50,
      create_order_ms: 300,
      submit_payment_ms: 500,
      payment_step_to_wallets_ready_ms: 600,
      payment_step_to_payment_element_ready_ms: 750,
      shipping_to_payment_element_ready_ms: 1950,
    })
  })

  it('returns null durations when prerequisite marks are missing', () => {
    const snapshot = buildCheckoutTimingSnapshot({
      shipping_submit_started_at_ms: 1000,
      payment_element_ready_at_ms: 2200,
    })

    expect(snapshot.durations_ms.shipping_to_payment_element_ready_ms).toBe(1200)
    expect(snapshot.durations_ms.create_order_ms).toBeNull()
    expect(snapshot.durations_ms.submit_payment_ms).toBeNull()
    expect(snapshot.durations_ms.payment_step_to_payment_element_ready_ms).toBeNull()
  })
})
