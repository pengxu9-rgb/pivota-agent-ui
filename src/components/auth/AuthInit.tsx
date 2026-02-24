'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { accountsMe } from '@/lib/api'
import { ensureAuroraSession, shouldUseAuroraAutoExchange } from '@/lib/auroraOrdersAuth'
import { useAuthStore } from '@/store/authStore'

const trackAuthSession = (payload: Record<string, unknown>) => {
  // eslint-disable-next-line no-console
  console.log('[TRACK]', 'aurora_session_source', {
    ...payload,
    ts: new Date().toISOString(),
  })
}

export default function AuthInit() {
  const { setSession, clear, user } = useAuthStore()
  const [checked, setChecked] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    // Avoid refetch if already have user
    if (user) {
      setChecked(true)
      return
    }

    // Guard against stale /auth/me responses: the buyer may log in while this
    // request is in-flight. In that case we must ignore the earlier 401
    // response and not clear the newly established session.
    let cancelled = false

    ;(async () => {
      let sessionSource: 'cookie' | 'aurora_exchange' = 'cookie'
      try {
        if (shouldUseAuroraAutoExchange(pathname)) {
          const exchangeResult = await ensureAuroraSession(pathname)
          if (exchangeResult.ok) {
            sessionSource = 'aurora_exchange'
          }
        }
        const data = await accountsMe()
        if (cancelled) return
        // If the buyer logged in while /auth/me was in-flight, do not overwrite
        // the newly established session with a stale response.
        if (useAuthStore.getState().user) return
        if ((data as any)?.user) {
          setSession({
            user: (data as any).user,
            memberships: (data as any).memberships || [],
            active_merchant_id: (data as any).active_merchant_id,
          })
          trackAuthSession({
            session_source: sessionSource,
            user_id: (data as any)?.user?.id || null,
            path: pathname || null,
          })
        } else {
          trackAuthSession({
            session_source: sessionSource,
            user_id: null,
            path: pathname || null,
          })
        }
      } catch (err: any) {
        if (cancelled) return
        if (err?.status === 401 || err?.code === 'UNAUTHENTICATED') {
          // Same guard: ignore stale 401s if the buyer logged in while this
          // request was in-flight.
          if (!useAuthStore.getState().user) clear()
          trackAuthSession({
            session_source: 'cookie',
            user_id: null,
            path: pathname || null,
            error_code: err?.code || 'UNAUTHENTICATED',
          })
        }
      } finally {
        if (!cancelled) setChecked(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [pathname, user, setSession, clear])

  // No UI; could return null or a minimal marker if needed
  if (!checked) return null
  return null
}
