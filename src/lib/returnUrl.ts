export function safeReturnUrl(input: string | null): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('/')) return trimmed

  try {
    const u = new URL(trimmed)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    const host = u.hostname.toLowerCase()
    const allowed =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === 'google.com' ||
      host.endsWith('.google.com') ||
      host === 'g.co' ||
      host.endsWith('.g.co') ||
      host === 'pivota.cc' ||
      host.endsWith('.pivota.cc') ||
      host === 'pivota.com' ||
      host.endsWith('.pivota.com') ||
      host.endsWith('.railway.app') ||
      host.endsWith('.up.railway.app')
    return allowed ? u.toString() : null
  } catch {
    return null
  }
}

export function withReturnParams(returnUrl: string, params: Record<string, string>) {
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://agent.pivota.cc'
    const u = new URL(returnUrl, base)
    for (const [k, v] of Object.entries(params)) {
      if (!u.searchParams.get(k)) u.searchParams.set(k, v)
    }
    return u.toString()
  } catch {
    return returnUrl
  }
}

export function appendCurrentPathAsReturn(targetUrl: string): string {
  if (!targetUrl) return targetUrl
  if (typeof window === 'undefined') return targetUrl

  try {
    const base = window.location.origin
    const target = new URL(targetUrl, base)
    const hasReturn =
      Boolean(target.searchParams.get('return')) ||
      Boolean(target.searchParams.get('return_url')) ||
      Boolean(target.searchParams.get('returnUrl'))
    if (hasReturn) return `${target.pathname}${target.search}${target.hash}`

    const current = `${window.location.pathname}${window.location.search}`
    if (current) target.searchParams.set('return', current)
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return targetUrl
  }
}

export function isExternalAgentEntry(entry: string | null | undefined): boolean {
  const normalized = String(entry || '').trim().toLowerCase()
  if (!normalized) return false
  return normalized.includes('aurora') || normalized.includes('creator')
}

export function resolveExternalAgentHomeUrl(entry: string | null | undefined): string | null {
  const normalized = String(entry || '').trim().toLowerCase()
  if (!normalized) return null

  if (normalized.includes('creator')) {
    return (
      safeReturnUrl(
        String(process.env.NEXT_PUBLIC_CREATOR_AGENT_HOME_URL || 'https://creator.pivota.cc').trim(),
      ) || null
    )
  }

  if (normalized.includes('aurora')) {
    return (
      safeReturnUrl(
        String(process.env.NEXT_PUBLIC_AURORA_AGENT_HOME_URL || 'https://aurora.pivota.cc').trim(),
      ) || null
    )
  }

  return null
}
