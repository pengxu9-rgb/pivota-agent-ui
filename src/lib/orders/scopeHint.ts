const SCOPE_HINT_STORAGE_KEY = 'aurora_orders_scope_hint_v1'
const SCOPE_HINT_TTL_MS = 6 * 60 * 60 * 1000

type ScopeHintPayload = {
  merchantId: string
  savedAt: number
}

const normalizeMerchantId = (value: unknown): string | null => {
  const normalized = String(value || '').trim()
  return normalized ? normalized : null
}

export const readAuroraOrdersScopeHint = (): string | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SCOPE_HINT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ScopeHintPayload
    const merchantId = normalizeMerchantId(parsed?.merchantId)
    if (!merchantId) return null
    const savedAt = Number(parsed?.savedAt)
    if (!Number.isFinite(savedAt) || savedAt <= 0) return null
    const ageMs = Date.now() - savedAt
    if (ageMs < 0 || ageMs > SCOPE_HINT_TTL_MS) return null
    return merchantId
  } catch {
    return null
  }
}

export const writeAuroraOrdersScopeHint = (merchantId: string | null | undefined) => {
  if (typeof window === 'undefined') return
  const normalized = normalizeMerchantId(merchantId)
  if (!normalized) return
  try {
    const payload: ScopeHintPayload = {
      merchantId: normalized,
      savedAt: Date.now(),
    }
    window.localStorage.setItem(SCOPE_HINT_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // ignore storage failures
  }
}

export const clearAuroraOrdersScopeHint = () => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(SCOPE_HINT_STORAGE_KEY)
  } catch {
    // ignore storage failures
  }
}
