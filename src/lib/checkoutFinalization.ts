import { isBackendSettledPaymentStatus } from '@/lib/checkoutPaymentContract'

type SleepFn = (ms: number) => Promise<void>
type NowFn = () => number

export type PaymentConfirmationResult = {
  status: 'confirmed' | 'pending'
  attempts: number
  paymentStatus: string | null
  lastError: unknown | null
}

export type PaymentStatusPollResult = {
  status: 'confirmed' | 'pending'
  polls: number
  paymentStatus: string | null
  lastError: unknown | null
}

function normalizeStatus(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  return trimmed || null
}

const PAYMENT_STATUS_HINTS = new Set([
  'pending',
  'processing',
  'paid',
  'completed',
  'succeeded',
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
])

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function extractPaymentStatusFromPayload(payload: unknown): string | null {
  const root = isRecord(payload) ? payload : {}
  const payment = isRecord(root.payment) ? root.payment : {}
  const order = isRecord(root.order) ? root.order : {}
  const nestedOrderPayment = isRecord(order.payment) ? order.payment : {}
  const result = isRecord(root.result) ? root.result : {}
  const detail = isRecord(root.detail) ? root.detail : {}
  const detailOrder = isRecord(detail.order) ? detail.order : {}
  const tracking = isRecord(root.tracking) ? root.tracking : {}
  const payments = Array.isArray(root.payments) ? root.payments : []
  const firstPayment = isRecord(payments[0]) ? payments[0] : {}
  const trackingTimeline = Array.isArray(tracking.timeline) ? tracking.timeline : []

  const normalizePaymentHint = (value: unknown): string | null => {
    const normalized = normalizeStatus(value)
    if (!normalized) return null
    return PAYMENT_STATUS_HINTS.has(normalized) ? normalized : null
  }

  const candidates = [
    root.payment_status,
    payment.payment_status,
    order.payment_status,
    nestedOrderPayment.payment_status,
    result.payment_status,
    detail.payment_status,
    detailOrder.payment_status,
    payment.status,
    firstPayment.payment_status,
    firstPayment.status,
  ]

  for (const candidate of candidates) {
    const normalized = normalizePaymentHint(candidate)
    if (normalized) return normalized
  }

  for (const event of trackingTimeline) {
    if (!isRecord(event) || event.completed !== true) continue
    const normalized = normalizeStatus(event.status)
    if (normalized === 'paid' || normalized === 'completed' || normalized === 'succeeded') {
      return normalized
    }
    if (normalized === 'shipped' || normalized === 'delivered') {
      return 'paid'
    }
  }

  const trailingCandidates = [
    tracking.payment_status,
    tracking.status,
    order.status,
    result.status,
    root.status,
  ]

  for (const candidate of trailingCandidates) {
    const normalized = normalizePaymentHint(candidate)
    if (normalized) return normalized
  }

  return null
}

export function isRetryableFinalizationError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false

  const anyErr = err as Record<string, any>
  const name = String(anyErr.name || '').trim().toUpperCase()
  if (name === 'ABORTERROR') return false

  const code = String(anyErr.code || '').trim().toUpperCase()
  if (code === 'TEMPORARY_UNAVAILABLE' || code === 'UPSTREAM_TIMEOUT') return true

  const message = String(anyErr.message || '').trim().toUpperCase()
  if (!message) return name === 'TYPEERROR'

  return (
    name === 'TYPEERROR' ||
    message.includes('FAILED TO FETCH') ||
    message.includes('NETWORK ERROR') ||
    message.includes('LOAD FAILED') ||
    message.includes('UPSTREAM_TIMEOUT') ||
    message.includes('TEMPORARY_UNAVAILABLE') ||
    message.includes('TIMED OUT')
  )
}

export async function confirmPaymentWithRetry(args: {
  orderId: string
  confirmPayment: (orderId: string) => Promise<unknown>
  maxAttempts?: number
  retryDelayMs?: number
  sleepFn?: SleepFn
}): Promise<PaymentConfirmationResult> {
  const maxAttempts = Math.max(1, Math.floor(args.maxAttempts || 3))
  const retryDelayMs = Math.max(0, Math.floor(args.retryDelayMs || 220))
  const sleepFn = args.sleepFn || defaultSleep

  let lastError: unknown | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await args.confirmPayment(args.orderId)
      const paymentStatus = extractPaymentStatusFromPayload(response)
      if (paymentStatus && isBackendSettledPaymentStatus(paymentStatus)) {
        return {
          status: 'confirmed',
          attempts: attempt,
          paymentStatus,
          lastError: null,
        }
      }
      return {
        status: 'pending',
        attempts: attempt,
        paymentStatus,
        lastError: null,
      }
    } catch (err) {
      lastError = err
      if (!isRetryableFinalizationError(err) || attempt >= maxAttempts) {
        break
      }
      const delayMs = retryDelayMs * attempt
      await sleepFn(delayMs)
    }
  }

  return {
    status: 'pending',
    attempts: maxAttempts,
    paymentStatus: null,
    lastError,
  }
}

export async function pollOrderStatusUntilSettled(args: {
  orderId: string
  getOrderStatus: (orderId: string) => Promise<unknown>
  timeoutMs?: number
  intervalMs?: number
  sleepFn?: SleepFn
  nowFn?: NowFn
}): Promise<PaymentStatusPollResult> {
  const timeoutMs = Math.max(0, Math.floor(args.timeoutMs || 4500))
  const intervalMs = Math.max(50, Math.floor(args.intervalMs || 550))
  const sleepFn = args.sleepFn || defaultSleep
  const nowFn = args.nowFn || (() => Date.now())

  const startedAt = nowFn()
  let polls = 0
  let lastError: unknown | null = null
  let lastPaymentStatus: string | null = null

  while (nowFn() - startedAt <= timeoutMs) {
    try {
      const response = await args.getOrderStatus(args.orderId)
      polls += 1
      lastPaymentStatus = extractPaymentStatusFromPayload(response)
      if (lastPaymentStatus && isBackendSettledPaymentStatus(lastPaymentStatus)) {
        return {
          status: 'confirmed',
          polls,
          paymentStatus: lastPaymentStatus,
          lastError: null,
        }
      }
    } catch (err) {
      lastError = err
      if (!isRetryableFinalizationError(err)) {
        break
      }
    }

    if (nowFn() - startedAt >= timeoutMs) {
      break
    }
    await sleepFn(intervalMs)
  }

  return {
    status: 'pending',
    polls,
    paymentStatus: lastPaymentStatus,
    lastError,
  }
}
