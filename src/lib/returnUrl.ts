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
