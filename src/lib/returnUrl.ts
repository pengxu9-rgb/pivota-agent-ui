// Post-checkout redirect targets. Every entry here is a host we control, because a return URL is
// followed by a buyer's browser after a purchase — an attacker-supplied value on an allowlisted host
// is a credible phishing landing.
//
// Deliberately NOT allowlisted:
//   *.railway.app / *.up.railway.app — the PaaS wildcard, not a Pivota property. It admitted every
//     tenant on the platform, and once we leave Railway a re-registered slot on that wildcard would
//     still satisfy this check. Pivota's own Railway services are reached through pivota.cc names.
//   pivota.com — registered in 2011 through a domain-parking registrar and serving no HTTPS; there
//     is no evidence Pivota owns it. If that is wrong, re-add it deliberately with a note.
export function safeReturnUrl(input: string | null): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null

  // A same-origin path is allowed without consulting the host policy - but ONLY a real path.
  // `//evil.example.com/x` is a PROTOCOL-RELATIVE URL: the browser resolves it against the current
  // scheme and navigates off-origin, so returning it here would be a post-authentication open
  // redirect from a pivota.cc page, bypassing the entire allowlist below. `/\evil.example.com`
  // is treated as `//` by browsers, and `///host` collapses the same way, so reject all three.
  if (trimmed.startsWith('/')) {
    const secondChar = trimmed[1]
    if (secondChar === '/' || secondChar === '\\') return null
    return trimmed
  }

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
      host.endsWith('.pivota.cc')
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

// Service and UCP profile URLs are server-side destinations, not browser redirect
// targets. They must still use a stable Pivota-owned hostname: accepting an old
// PaaS hostname here can silently revive a retired upstream through an env var.
export function safePivotaServiceUrl(input: string | null | undefined): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null
  try {
    const u = new URL(trimmed)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    const host = u.hostname.toLowerCase()
    const allowed =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === 'pivota.cc' ||
      host.endsWith('.pivota.cc')
    return allowed ? u.toString().replace(/\/+$/, '') : null
  } catch {
    return null
  }
}

export function safeUcpProfileUrl(input: string | null): string | null {
  return safePivotaServiceUrl(input)
}
