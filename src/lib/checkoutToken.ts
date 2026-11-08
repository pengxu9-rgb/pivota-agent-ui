const CHECKOUT_TOKEN_STORAGE_KEY = 'pivota_checkout_token'
const CHECKOUT_SOURCE_STORAGE_KEY = 'pivota_checkout_source'

export type CheckoutContext = {
  token: string | null
  source: string | null
}

function normalizeCheckoutToken(raw: unknown): string | null {
  const value = String(raw || '').trim()
  return value || null
}

export function normalizeCheckoutSource(raw: unknown): string | null {
  const value = String(raw || '').trim()
  if (!value) return null

  const normalized = value.toLowerCase().replace(/[\s-]+/g, '_')

  if (
    normalized === 'creator' ||
    normalized === 'creator_agent' ||
    normalized === 'creator_agent_ui'
  ) {
    return 'creator_agent'
  }

  if (
    normalized === 'shopping_agent' ||
    normalized === 'shopping_agent_ui' ||
    normalized === 'shopping_agent_web' ||
    normalized === 'shopping_web'
  ) {
    return 'shopping_agent'
  }

  return normalized
}

function readParams(search: string | null | undefined): URLSearchParams | null {
  const rawSearch = String(search || '').trim()
  if (!rawSearch) return null
  try {
    return new URLSearchParams(rawSearch)
  } catch {
    return null
  }
}

function readTokenFromSearch(search: string | null | undefined): string | null {
  const params = readParams(search)
  if (!params) return null
  return (
    normalizeCheckoutToken(params.get('checkout_token')) ||
    normalizeCheckoutToken(params.get('checkoutToken'))
  )
}

function readSourceFromSearch(search: string | null | undefined): string | null {
  const params = readParams(search)
  if (!params) return null
  return normalizeCheckoutSource(
    params.get('source') || params.get('src') || params.get('entry'),
  )
}

function readValueFromStorage(storage: Storage | null, key: string): string | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(key)
    if (key === CHECKOUT_TOKEN_STORAGE_KEY) return normalizeCheckoutToken(raw)
    return normalizeCheckoutSource(raw)
  } catch {
    return null
  }
}

function readStoredCheckoutContext(): CheckoutContext {
  if (typeof window === 'undefined') {
    return { token: null, source: null }
  }

  const tokenFromSession = readValueFromStorage(window.sessionStorage, CHECKOUT_TOKEN_STORAGE_KEY)
  const tokenFromLocal = readValueFromStorage(window.localStorage, CHECKOUT_TOKEN_STORAGE_KEY)
  const sourceFromSession = readValueFromStorage(window.sessionStorage, CHECKOUT_SOURCE_STORAGE_KEY)
  const sourceFromLocal = readValueFromStorage(window.localStorage, CHECKOUT_SOURCE_STORAGE_KEY)

  return {
    token: tokenFromSession || tokenFromLocal,
    source: sourceFromSession || sourceFromLocal,
  }
}

function writeValue(storage: Storage, key: string, value: string | null) {
  try {
    if (value) storage.setItem(key, value)
    else storage.removeItem(key)
  } catch {
    // ignore storage errors
  }
}

export function persistCheckoutContext(args: {
  token?: unknown
  source?: unknown
}): CheckoutContext {
  const token = normalizeCheckoutToken(args.token)
  const source = normalizeCheckoutSource(args.source)

  if (typeof window === 'undefined') {
    return { token, source }
  }

  writeValue(window.sessionStorage, CHECKOUT_TOKEN_STORAGE_KEY, token)
  writeValue(window.sessionStorage, CHECKOUT_SOURCE_STORAGE_KEY, source)
  writeValue(window.localStorage, CHECKOUT_TOKEN_STORAGE_KEY, token)
  writeValue(window.localStorage, CHECKOUT_SOURCE_STORAGE_KEY, source)

  return { token, source }
}

export function persistCheckoutToken(raw: unknown, source?: unknown): string | null {
  return persistCheckoutContext({ token: raw, source }).token
}

export function getCheckoutContextFromBrowser(search?: string | null): CheckoutContext {
  if (typeof window === 'undefined') return { token: null, source: null }

  const rawSearch = typeof search === 'string' ? search : window.location.search
  const tokenFromSearch = readTokenFromSearch(rawSearch)
  const sourceFromSearch = readSourceFromSearch(rawSearch)
  const stored = readStoredCheckoutContext()

  if (tokenFromSearch) {
    return persistCheckoutContext({
      token: tokenFromSearch,
      source: sourceFromSearch,
    })
  }

  if (sourceFromSearch) {
    return persistCheckoutContext({
      token: stored.token,
      source: sourceFromSearch,
    })
  }

  if (stored.token || stored.source) {
    return persistCheckoutContext(stored)
  }

  return { token: null, source: null }
}

export function getCheckoutTokenFromBrowser(search?: string | null): string | null {
  return getCheckoutContextFromBrowser(search).token
}

export function getCheckoutSourceFromBrowser(search?: string | null): string | null {
  return getCheckoutContextFromBrowser(search).source
}

// ---- Which order a checkout token is for ------------------------------------------------------------
//
// pivota-backend lets a checkout token act only on its own order (be#2760): the order the intent was
// minted for (the token's `order_id` claim), or an order created under the token (the backend stamps the
// token's `intent_id` on it). Any other order is a 403 on payments, confirm-payment and track. A stored
// token can outlive its checkout, so the resume entry (/order?orderId=...) must not send one that belongs
// to some other order; it drops it and the page runs as it does without a token.
//
// The claims are read, not verified: the backend verifies the signature on every call. This only decides
// whether sending the token can succeed.

const CHECKOUT_TOKEN_ORDERS_STORAGE_KEY = 'pivota_checkout_token_orders'
const MAX_REMEMBERED_TOKEN_ORDERS = 20

type CheckoutTokenOrderBinding = { intent_id: string; order_id: string }

export function decodeCheckoutTokenClaims(token: unknown): Record<string, any> | null {
  const raw = String(token || '').trim()
  if (!raw) return null
  const parts = raw.split('.')
  const payloadB64 =
    parts.length === 3 && parts[0] === 'v1' ? parts[1] : parts.length === 2 ? parts[0] : null
  if (!payloadB64) return null
  try {
    const padded = payloadB64 + '==='.slice((payloadB64.length + 3) % 4)
    const json = JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')))
    return json && typeof json === 'object' && !Array.isArray(json) ? json : null
  } catch {
    return null
  }
}

function claimString(claims: Record<string, any> | null, key: string): string {
  return String(claims?.[key] ?? '').trim()
}

function readTokenOrderBindings(storage: Storage | null): CheckoutTokenOrderBinding[] {
  if (!storage) return []
  try {
    const parsed = JSON.parse(storage.getItem(CHECKOUT_TOKEN_ORDERS_STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (b): b is CheckoutTokenOrderBinding =>
        Boolean(b) && typeof b.intent_id === 'string' && typeof b.order_id === 'string',
    )
  } catch {
    return []
  }
}

/** Records that `orderId` was created under `token`, so a later resume of that order may keep it. */
export function rememberCheckoutTokenOrder(token: unknown, orderId: unknown): void {
  if (typeof window === 'undefined') return
  const intentId = claimString(decodeCheckoutTokenClaims(token), 'intent_id')
  const oid = String(orderId || '').trim()
  if (!intentId || !oid) return
  for (const storage of [window.sessionStorage, window.localStorage]) {
    const kept = readTokenOrderBindings(storage).filter(
      (b) => !(b.intent_id === intentId && b.order_id === oid),
    )
    const next = [{ intent_id: intentId, order_id: oid }, ...kept].slice(0, MAX_REMEMBERED_TOKEN_ORDERS)
    try {
      storage.setItem(CHECKOUT_TOKEN_ORDERS_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // ignore storage errors
    }
  }
}

/** Whether `token` is bound to `orderId`: minted for it, or the order was created under it here. */
export function isCheckoutTokenBoundToOrder(token: unknown, orderId: unknown): boolean {
  const oid = String(orderId || '').trim()
  const claims = decodeCheckoutTokenClaims(token)
  if (!oid || !claims) return false
  if (claimString(claims, 'order_id') === oid) return true
  const intentId = claimString(claims, 'intent_id')
  if (!intentId || typeof window === 'undefined') return false
  return [window.sessionStorage, window.localStorage].some((storage) =>
    readTokenOrderBindings(storage).some((b) => b.intent_id === intentId && b.order_id === oid),
  )
}

/**
 * The checkout context for acting on one existing order (the resume entry). A token that is not bound
 * to that order is dropped from the page and from storage (every gateway call reads it from storage), so
 * the flow falls back to what it does without a token: sign-in, the email resume, the agent-key lane.
 */
export function getCheckoutContextForOrder(orderId: unknown, search?: string | null): CheckoutContext {
  const context = getCheckoutContextFromBrowser(search)
  if (!context.token || isCheckoutTokenBoundToOrder(context.token, orderId)) return context
  return persistCheckoutContext({ token: null, source: context.source })
}
