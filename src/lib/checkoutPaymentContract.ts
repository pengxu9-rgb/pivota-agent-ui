export type CheckoutConfirmationOwner = 'backend' | 'client'

export type CheckoutPaymentContract = {
  paymentStatus: string
  paymentStatusRaw: string | null
  confirmationOwner: CheckoutConfirmationOwner
  requiresClientConfirmation: boolean
}

const BACKEND_OWNED_PAYMENT_STATUSES = new Set([
  'processing',
  'paid',
  'completed',
  'succeeded',
])
const CLIENT_OWNED_PAYMENT_STATUSES = new Set([
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
])

function readString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || null
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    const normalized = String(value).trim()
    return normalized || null
  }
  return null
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function normalizePaymentStatus(rawStatus: unknown): string {
  const token = readString(rawStatus)
  if (!token) return 'unknown'
  return token.toLowerCase()
}

export function isBackendSettledPaymentStatus(status: unknown): boolean {
  const normalized = normalizePaymentStatus(status)
  return BACKEND_OWNED_PAYMENT_STATUSES.has(normalized)
}

export function resolveCheckoutPaymentContract(args: {
  paymentResponse: unknown
  action?: unknown
}): CheckoutPaymentContract {
  const root =
    args.paymentResponse && typeof args.paymentResponse === 'object'
      ? (args.paymentResponse as Record<string, unknown>)
      : {}
  const nested =
    root.payment && typeof root.payment === 'object'
      ? (root.payment as Record<string, unknown>)
      : null
  const actionObj =
    args.action && typeof args.action === 'object'
      ? (args.action as Record<string, unknown>)
      : {}
  const actionType = normalizePaymentStatus(actionObj.type)
  const statusRaw =
    readString(root.payment_status) ||
    readString(root.status) ||
    readString(nested?.payment_status) ||
    readString(nested?.status)
  const paymentStatus = normalizePaymentStatus(statusRaw)
  const paymentStatusRaw = paymentStatus === 'unknown' ? statusRaw : null
  const explicitRequires =
    readBoolean(root.requires_client_confirmation) ??
    readBoolean(nested?.requires_client_confirmation)
  const explicitOwnerRaw =
    readString(root.confirmation_owner) || readString(nested?.confirmation_owner)
  const explicitOwner =
    explicitOwnerRaw === 'client'
      ? 'client'
      : explicitOwnerRaw === 'backend'
      ? 'backend'
      : null

  if (explicitRequires != null) {
    const owner: CheckoutConfirmationOwner =
      explicitOwner || (explicitRequires ? 'client' : 'backend')
    return {
      paymentStatus,
      paymentStatusRaw,
      confirmationOwner: owner,
      requiresClientConfirmation: explicitRequires,
    }
  }
  if (explicitOwner) {
    return {
      paymentStatus,
      paymentStatusRaw,
      confirmationOwner: explicitOwner,
      requiresClientConfirmation: explicitOwner === 'client',
    }
  }

  // Compatibility for legacy payloads without owner fields.
  if (actionType === 'adyen_session' || actionType === 'redirect_url') {
    return {
      paymentStatus,
      paymentStatusRaw,
      confirmationOwner: 'client',
      requiresClientConfirmation: true,
    }
  }
  if (CLIENT_OWNED_PAYMENT_STATUSES.has(paymentStatus)) {
    return {
      paymentStatus,
      paymentStatusRaw,
      confirmationOwner: 'client',
      requiresClientConfirmation: true,
    }
  }
  if (BACKEND_OWNED_PAYMENT_STATUSES.has(paymentStatus)) {
    return {
      paymentStatus,
      paymentStatusRaw,
      confirmationOwner: 'backend',
      requiresClientConfirmation: false,
    }
  }
  if (actionType === 'stripe_client_secret') {
    return {
      paymentStatus,
      paymentStatusRaw,
      confirmationOwner: 'client',
      requiresClientConfirmation: true,
    }
  }

  return {
    paymentStatus,
    paymentStatusRaw,
    confirmationOwner: 'backend',
    requiresClientConfirmation: false,
  }
}
