import type { NormalizedOrderPermissions } from '@/lib/orders/normalize'

type StatusInput = {
  status?: string | null
  paymentStatus?: string | null
  fulfillmentStatus?: string | null
  deliveryStatus?: string | null
}

const normalize = (value: string | null | undefined): string =>
  String(value || '').trim().toLowerCase()

const titleCase = (value: string): string =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())

const isCancelled = (status?: string | null): boolean => {
  const normalized = normalize(status)
  return normalized === 'cancelled' || normalized === 'canceled' || normalized === 'refunded'
}

export const getOrderDisplayStatus = (input: StatusInput): string => {
  const status = normalize(input.status)
  const paymentStatus = normalize(input.paymentStatus)
  const fulfillmentStatus = normalize(input.fulfillmentStatus)
  const deliveryStatus = normalize(input.deliveryStatus)

  if (status === 'cancelled' || status === 'canceled') return 'Cancelled'
  if (status === 'refunded') return 'Refunded'
  if (status === 'partially_refunded' || paymentStatus === 'partially_refunded') {
    return 'Partially refunded'
  }
  if (deliveryStatus === 'delivered' || fulfillmentStatus === 'delivered') return 'Delivered'
  if (
    deliveryStatus === 'in_transit' ||
    deliveryStatus === 'shipped' ||
    fulfillmentStatus === 'shipped' ||
    fulfillmentStatus === 'fulfilled'
  ) {
    return 'Shipped'
  }
  if (paymentStatus === 'failed') return 'Payment failed'
  if (paymentStatus === 'pending' || paymentStatus === 'requires_action' || paymentStatus === 'processing') {
    return 'Payment pending'
  }
  if (paymentStatus === 'paid' || paymentStatus === 'succeeded' || paymentStatus === 'completed') {
    return 'Paid'
  }
  if (status) return titleCase(status)
  return 'Processing'
}

export const getOrderTone = (input: StatusInput): 'success' | 'warning' | 'danger' | 'neutral' => {
  const status = normalize(input.status)
  const paymentStatus = normalize(input.paymentStatus)
  const fulfillmentStatus = normalize(input.fulfillmentStatus)
  const deliveryStatus = normalize(input.deliveryStatus)

  if (status === 'cancelled' || status === 'canceled' || status === 'refunded') return 'danger'
  if (status === 'partially_refunded' || paymentStatus === 'partially_refunded') return 'warning'
  if (deliveryStatus === 'delivered' || fulfillmentStatus === 'delivered') return 'success'
  if (
    deliveryStatus === 'in_transit' ||
    deliveryStatus === 'shipped' ||
    fulfillmentStatus === 'shipped' ||
    fulfillmentStatus === 'fulfilled'
  ) {
    return 'success'
  }
  if (paymentStatus === 'failed') return 'danger'
  if (paymentStatus === 'pending' || paymentStatus === 'requires_action' || paymentStatus === 'processing') {
    return 'warning'
  }
  if (paymentStatus === 'paid' || paymentStatus === 'succeeded' || paymentStatus === 'completed') {
    return 'success'
  }
  return 'neutral'
}

export const canShowContinuePayment = (
  permissions: NormalizedOrderPermissions | null | undefined,
  status?: string | null,
): boolean => Boolean(permissions?.canPay) && !isCancelled(status)

export const canShowCancel = (
  permissions: NormalizedOrderPermissions | null | undefined,
  status?: string | null,
  paymentStatus?: string | null,
): boolean => {
  if (!permissions?.canCancel) return false
  if (isCancelled(status)) return false
  return normalize(paymentStatus) === 'pending'
}
