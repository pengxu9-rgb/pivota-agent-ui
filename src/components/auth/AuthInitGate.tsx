'use client'

import { usePathname } from 'next/navigation'
import AuthInit from '@/components/auth/AuthInit'

const AUTH_REQUIRED_PREFIXES = ['/orders', '/my-orders', '/ops']

export default function AuthInitGate() {
  const pathname = usePathname() || ''

  const shouldInitAuth = AUTH_REQUIRED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  if (!shouldInitAuth) return null

  return <AuthInit />
}

