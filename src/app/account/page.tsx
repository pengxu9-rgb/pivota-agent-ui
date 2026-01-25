'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LogOut, ShieldCheck } from 'lucide-react'
import { accountsLogout, accountsMe, accountsSetPassword } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'sonner'

export default function AccountPage() {
  const router = useRouter()
  const { user, setSession, clear } = useAuthStore()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await accountsMe()
        if (cancelled) return
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
          clear()
        } else {
          toast.error(err?.message || 'Failed to load account')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [setSession, clear])

  const hasPassword = Boolean(user?.has_password)

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPassword || !confirmPassword) {
      toast.error('Please enter your new password')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setSaving(true)
    try {
      await accountsSetPassword(newPassword, currentPassword || undefined)
      toast.success('Password saved')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      const code = err?.code
      if (code === 'CURRENT_PASSWORD_REQUIRED') {
        toast.error('Please enter your current password (or sign in with email code to reset it).')
      } else if (code === 'INVALID_CREDENTIALS') {
        toast.error('Current password is incorrect')
      } else if (code === 'INVALID_INPUT') {
        toast.error(err?.message || 'Invalid password')
      } else {
        toast.error(err?.message || 'Failed to save password')
      }
    } finally {
      setSaving(false)
    }
  }

  const doLogout = async () => {
    setSaving(true)
    try {
      await accountsLogout()
    } catch {
      // ignore
    } finally {
      clear()
      setSaving(false)
      router.replace('/')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-mesh flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white/80 backdrop-blur-md rounded-3xl shadow-lg p-8 space-y-6 border border-border">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Account</h1>
            <p className="text-sm text-muted-foreground">Manage your password and session.</p>
          </div>
          {user && (
            <button
              type="button"
              onClick={doLogout}
              disabled={saving}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-white/60 hover:bg-white disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" /> Logout
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !user ? (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">You’re not logged in.</div>
            <Link
              href="/login?redirect=/account"
              className="inline-flex items-center justify-center w-full px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold shadow hover:shadow-lg"
            >
              Login
            </Link>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submitPassword}>
            <div className="rounded-2xl border border-border bg-white/60 px-4 py-3 text-sm">
              <div className="font-semibold text-foreground">{user.email || user.id}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Password status: {hasPassword ? 'set' : 'not set'}
              </div>
            </div>

            {hasPassword && (
              <div>
                <label className="text-sm font-medium text-foreground">
                  Current password{' '}
                  <span className="font-normal text-xs text-muted-foreground">
                    (optional if you just signed in with email code)
                  </span>
                </label>
                <input
                  type="password"
                  className="mt-2 w-full rounded-xl border border-border bg-white/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={saving}
                />
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-foreground">New password</label>
              <input
                type="password"
                required
                className="mt-2 w-full rounded-xl border border-border bg-white/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={saving}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">Confirm password</label>
              <input
                type="password"
                required
                className="mt-2 w-full rounded-xl border border-border bg-white/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={saving}
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold shadow hover:shadow-lg disabled:opacity-60"
            >
              Save password
            </button>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
              <span>Passwords are stored securely (hashed).</span>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

