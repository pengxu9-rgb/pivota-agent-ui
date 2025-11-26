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
    accountsMe()
      .then((data) => {
        if ((data as any)?.user) {
          setSession({
            user: (data as any).user,
            memberships: (data as any).memberships || [],
            active_merchant_id: (data as any).active_merchant_id,
          })
        }
      })
      .catch((err: any) => {
        if (err?.status === 401 || err?.code === 'UNAUTHENTICATED') {
          clear()
        }
      })
      .finally(() => setChecked(true))
  }, [user, setSession, clear])

  // No UI; could return null or a minimal marker if needed
  if (!checked) return null
  return null
}
