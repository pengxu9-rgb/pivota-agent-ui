export type CheckoutConfirmationOwner = 'backend' | 'client'
export type CheckoutSubmitOwner =
  | 'external_button'
  | 'component'
  | 'redirect'
  | 'unsupported'
  | null

export type CheckoutPaymentContract = {
  paymentStatus: string
  paymentStatusRaw: string | null
  confirmationOwner: CheckoutConfirmationOwner
  requiresClientConfirmation: boolean
  submitOwner: CheckoutSubmitOwner
  componentKind: string | null
  supportedInShoppingUi: boolean
}

const BACKEND_OWNED_PAYMENT_STATUSES = new Set([
  'paid',
])
const TERMINAL_FAILURE_PAYMENT_STATUSES = new Set([
  'payment_failed',
  'cancelled',
  'refunded',
  'partially_refunded',
])
const CLIENT_OWNED_PAYMENT_STATUSES = new Set(['requires_action'])

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
  const normalized = token.toLowerCase()
  if (normalized === 'requires_payment_method' || normalized === 'requires_confirmation') {
    return 'requires_action'
  }
  if (normalized === 'completed' || normalized === 'succeeded' || normalized === 'success' || normalized === 'settled') {
    return 'paid'
  }
  if (normalized === 'failed') return 'payment_failed'
  if (normalized === 'canceled') return 'cancelled'
  return normalized
}

function normalizeSubmitOwner(rawSubmitOwner: unknown): CheckoutSubmitOwner {
  const token = readString(rawSubmitOwner)
  if (!token) return null
  const normalized = token.toLowerCase()
  if (
    normalized === 'external_button' ||
    normalized === 'component' ||
    normalized === 'redirect' ||
    normalized === 'unsupported'
  ) {
    return normalized
  }
  return null
}

function inferSubmitOwnerFromAction(actionType: string | null): CheckoutSubmitOwner {
  if (actionType === 'stripe_client_secret') return 'external_button'
  if (actionType === 'adyen_session') return 'component'
  if (actionType === 'redirect_url') return 'redirect'
  if (actionType === 'checkout_session') return 'unsupported'
  return null
}

function inferComponentKindFromAction(actionType: string | null): string | null {
  if (actionType === 'stripe_client_secret') return 'stripe_payment_element'
  if (actionType === 'adyen_session') return 'adyen_dropin'
  if (actionType === 'checkout_session') return 'checkout_embedded'
  return null
}

export function isBackendSettledPaymentStatus(status: unknown): boolean {
  const normalized = normalizePaymentStatus(status)
  return BACKEND_OWNED_PAYMENT_STATUSES.has(normalized)
}

export function isTerminalPaymentFailureStatus(status: unknown): boolean {
  const normalized = normalizePaymentStatus(status)
  return TERMINAL_FAILURE_PAYMENT_STATUSES.has(normalized)
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
  const actionFromRoot =
    root.payment_action && typeof root.payment_action === 'object'
      ? (root.payment_action as Record<string, unknown>)
      : null
  const actionFromNested =
    nested?.payment_action && typeof nested.payment_action === 'object'
      ? (nested.payment_action as Record<string, unknown>)
      : null
  const actionObj =
    args.action && typeof args.action === 'object'
      ? (args.action as Record<string, unknown>)
      : actionFromRoot || actionFromNested || {}
  const actionType = readString(actionObj.type)?.toLowerCase() || null
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
  const explicitSubmitOwner =
    normalizeSubmitOwner(actionObj.submit_owner) ||
    normalizeSubmitOwner(root.submit_owner) ||
    normalizeSubmitOwner(nested?.submit_owner)
  const explicitComponentKind =
    readString(actionObj.component_kind) ||
    readString(root.component_kind) ||
    readString(nested?.component_kind)
  const explicitSupported =
    readBoolean(actionObj.supported_in_shopping_ui) ??
    readBoolean(root.supported_in_shopping_ui) ??
    readBoolean(nested?.supported_in_shopping_ui)
  const hasExplicitContractFields =
    explicitRequires != null ||
    explicitOwner != null ||
    explicitSubmitOwner != null ||
    explicitComponentKind != null ||
    explicitSupported != null

  if (
    BACKEND_OWNED_PAYMENT_STATUSES.has(paymentStatus) ||
    TERMINAL_FAILURE_PAYMENT_STATUSES.has(paymentStatus)
  ) {
    return {
      paymentStatus,
      paymentStatusRaw,
      confirmationOwner: 'backend',
      requiresClientConfirmation: false,
      submitOwner: null,
      componentKind: null,
      supportedInShoppingUi: true,
    }
  }

  if (hasExplicitContractFields) {
    const owner: CheckoutConfirmationOwner =
      explicitOwner || (explicitRequires ? 'client' : 'backend')
    const requiresClientConfirmation =
      explicitRequires ?? owner === 'client'
    const hasExplicitOwnershipFields =
      explicitRequires != null || explicitOwner != null
    const submitOwner = hasExplicitOwnershipFields
      ? explicitSubmitOwner ||
        (requiresClientConfirmation || actionType ? 'unsupported' : null)
      : actionType
        ? 'unsupported'
        : null
    const componentKind =
      hasExplicitOwnershipFields && explicitSubmitOwner ? explicitComponentKind : null
    const supportedInShoppingUi =
      explicitSupported ?? (submitOwner === 'unsupported' ? false : true)

    return {
      paymentStatus,
      paymentStatusRaw,
      confirmationOwner: owner,
      requiresClientConfirmation,
      submitOwner,
      componentKind,
      supportedInShoppingUi,
    }
  }

  const inferredSubmitOwner = inferSubmitOwnerFromAction(actionType)
  const inferredComponentKind = inferComponentKindFromAction(actionType)

  if (inferredSubmitOwner || CLIENT_OWNED_PAYMENT_STATUSES.has(paymentStatus)) {
    return {
      paymentStatus,
      paymentStatusRaw,
      confirmationOwner: 'client',
      requiresClientConfirmation: true,
      submitOwner: inferredSubmitOwner,
      componentKind: inferredSubmitOwner ? inferredComponentKind : null,
      supportedInShoppingUi: inferredSubmitOwner === 'unsupported' ? false : true,
    }
  }

  return {
    paymentStatus,
    paymentStatusRaw,
    confirmationOwner: 'backend',
    requiresClientConfirmation: false,
    submitOwner: null,
    componentKind: null,
    supportedInShoppingUi: true,
  }
}
