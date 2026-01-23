'use client'

import { useEffect, useState } from 'react'
import { accountsMe } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

export default function AuthInit() {
  const { setSession, clear, user } = useAuthStore()
  const [checked, setChecked] = useState(false)

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
      try {
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
        }
      } catch (err: any) {
        if (cancelled) return
        if (err?.status === 401 || err?.code === 'UNAUTHENTICATED') {
          // Same guard: ignore stale 401s if the buyer logged in while this
          // request was in-flight.
          if (!useAuthStore.getState().user) clear()
        }
      } finally {
        if (!cancelled) setChecked(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user, setSession, clear])

  // No UI; could return null or a minimal marker if needed
  if (!checked) return null
  return null
}
