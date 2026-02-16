const CHECKOUT_TOKEN_STORAGE_KEY = 'pivota_checkout_token'

function normalizeCheckoutToken(raw: unknown): string | null {
  const value = String(raw || '').trim()
  return value || null
}

function readTokenFromSearch(search: string | null | undefined): string | null {
  const rawSearch = String(search || '').trim()
  if (!rawSearch) return null
  try {
    const params = new URLSearchParams(rawSearch)
    return (
      normalizeCheckoutToken(params.get('checkout_token')) ||
      normalizeCheckoutToken(params.get('checkoutToken'))
    )
  } catch {
    return null
  }
}

function readTokenFromStorage(storage: Storage | null): string | null {
  if (!storage) return null
  try {
    return normalizeCheckoutToken(storage.getItem(CHECKOUT_TOKEN_STORAGE_KEY))
  } catch {
    return null
  }
}

export function persistCheckoutToken(raw: unknown): string | null {
  const token = normalizeCheckoutToken(raw)
  if (!token || typeof window === 'undefined') return token

  try {
    window.sessionStorage.setItem(CHECKOUT_TOKEN_STORAGE_KEY, token)
  } catch {
    // ignore storage errors
  }

  try {
    window.localStorage.setItem(CHECKOUT_TOKEN_STORAGE_KEY, token)
  } catch {
    // ignore storage errors
  }

  return token
}

export function getCheckoutTokenFromBrowser(search?: string | null): string | null {
  if (typeof window === 'undefined') return null

  const tokenFromSearch = readTokenFromSearch(
    typeof search === 'string' ? search : window.location.search,
  )
  if (tokenFromSearch) return persistCheckoutToken(tokenFromSearch)

  const tokenFromSession = readTokenFromStorage(window.sessionStorage)
  if (tokenFromSession) return persistCheckoutToken(tokenFromSession)

  const tokenFromLocal = readTokenFromStorage(window.localStorage)
  if (tokenFromLocal) return persistCheckoutToken(tokenFromLocal)

  return null
}
