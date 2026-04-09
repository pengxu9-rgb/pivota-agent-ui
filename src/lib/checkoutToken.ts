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
