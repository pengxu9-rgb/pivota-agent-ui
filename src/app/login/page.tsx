'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Mail, ArrowRight, ShieldCheck } from 'lucide-react'
import { accountsLogin, accountsLoginWithPassword, accountsSetPassword, accountsVerify } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'sonner'

type LoginMethod = 'otp' | 'password'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/my-orders'

  const { setSession, user } = useAuthStore()
  const [method, setMethod] = useState<LoginMethod>('otp')
  const [step, setStep] = useState<'email' | 'otp' | 'set_password'>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [debugOtp, setDebugOtp] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      router.replace(redirect)
    }
  }, [user, redirect, router])

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const data = await accountsLoginWithPassword(email.trim(), password)
      setSession({
        user: (data as any).user,
        memberships: (data as any).memberships || [],
        active_merchant_id: (data as any).active_merchant_id,
      })
      toast.success('Login successful')
      router.replace(redirect)
    } catch (err: any) {
      const code = err?.code
      if (code === 'NO_PASSWORD') {
        toast.error('No password is set for this account. Use email code once, then set a password.')
        setMethod('otp')
        setStep('email')
      } else if (code === 'INVALID_CREDENTIALS') {
        toast.error('Email or password is incorrect')
      } else if (code === 'INVALID_INPUT') {
        toast.error(err?.message || 'Invalid input')
      } else {
        toast.error(err?.message || 'Login failed')
      }
    } finally {
      setLoading(false)
    }
  }

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setDebugOtp(null)
    try {
      const res = await accountsLogin(email.trim())
      if ((res as any)?.debug_otp) {
        setDebugOtp((res as any).debug_otp)
        console.debug('Debug OTP (dev only):', (res as any).debug_otp)
      }
      toast.success('Verification code sent')
      setStep('otp')
    } catch (err: any) {
      const code = err?.code
      if (code === 'INVALID_INPUT') {
        toast.error('Please enter a valid email')
      } else if (code === 'RATE_LIMITED') {
        toast.error('Requests are too frequent, please retry later')
      } else {
        toast.error(err?.message || 'Failed to send code')
      }
    } finally {
      setLoading(false)
    }
  }

  const submitOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const data = await accountsVerify(email.trim(), otp.trim())
      setSession({
        user: (data as any).user,
        memberships: (data as any).memberships || [],
        active_merchant_id: (data as any).active_merchant_id,
      })
      const hasPassword = Boolean((data as any)?.user?.has_password)
      if (!hasPassword) {
        toast.success('Login successful — set a password to skip email codes next time')
        setStep('set_password')
        return
      }
      toast.success('Login successful')
      router.replace(redirect)
    } catch (err: any) {
      const code = err?.code
      if (code === 'INVALID_OTP') {
        toast.error('Verification code is invalid or expired')
      } else if (code === 'RATE_LIMITED') {
        toast.error('Too many attempts, please retry later')
      } else {
        toast.error(err?.message || 'Login failed, please retry')
      }
    } finally {
      setLoading(false)
    }
  }

  const submitSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPassword || !confirmPassword) {
      toast.error('Please enter your new password')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      await accountsSetPassword(newPassword)
      toast.success('Password saved')
      router.replace(redirect)
    } catch (err: any) {
      const code = err?.code
      if (code === 'CURRENT_PASSWORD_REQUIRED') {
        toast.error('Please enter your current password in Account settings to change it.')
      } else if (code === 'INVALID_INPUT') {
        toast.error(err?.message || 'Invalid password')
      } else {
        toast.error(err?.message || 'Failed to save password')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-mesh flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white/80 backdrop-blur-md rounded-3xl shadow-lg p-8 space-y-6 border border-border">
        <div className="flex items-center gap-3">
            <Mail className="h-8 w-8 text-indigo-500" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Account Login</h1>
            <p className="text-sm text-muted-foreground">Use password or a one-time email code</p>
          </div>
        </div>

        {step !== 'set_password' && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setMethod('password')
                setStep('email')
                setOtp('')
                setDebugOtp(null)
              }}
              className={`px-4 py-2 rounded-xl border ${
                method === 'password'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white/60 text-foreground border-border hover:bg-white'
              } disabled:opacity-60`}
            >
              Password
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setMethod('otp')
                setStep('email')
                setPassword('')
              }}
              className={`px-4 py-2 rounded-xl border ${
                method === 'otp'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white/60 text-foreground border-border hover:bg-white'
              } disabled:opacity-60`}
            >
              Email code
            </button>
          </div>
        )}

        {method === 'password' && step === 'email' && (
          <form className="space-y-4" onSubmit={submitPassword}>
            <div>
              <label className="text-sm font-medium text-foreground">Email</label>
              <input
                type="email"
                required
                className="mt-2 w-full rounded-xl border border-border bg-white/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Password</label>
              <input
                type="password"
                required
                className="mt-2 w-full rounded-xl border border-border bg-white/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold shadow hover:shadow-lg disabled:opacity-60"
            >
              Login <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        )}

        {method === 'otp' && step === 'email' && (
          <form className="space-y-4" onSubmit={submitEmail}>
            <div>
              <label className="text-sm font-medium text-foreground">Email</label>
              <input
                type="email"
                required
                className="mt-2 w-full rounded-xl border border-border bg-white/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold shadow hover:shadow-lg disabled:opacity-60"
            >
              Send Code <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        )}

        {method === 'otp' && step === 'otp' && (
          <form className="space-y-4" onSubmit={submitOtp}>
            <div className="text-sm text-muted-foreground">Verification code was sent to {email}</div>
            <div>
              <label className="text-sm font-medium text-foreground">Code</label>
              <input
                inputMode="numeric"
                required
                className="mt-2 w-full rounded-xl border border-border bg-white/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="6-digit code"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
              {debugOtp && (
                <p className="text-xs text-muted-foreground mt-1">Dev OTP: {debugOtp}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold shadow hover:shadow-lg disabled:opacity-60"
            >
              Verify & Login
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => setStep('email')}
              className="w-full text-sm text-indigo-600 hover:underline"
            >
              Change email
            </button>
          </form>
        )}

        {step === 'set_password' && (
          <form className="space-y-4" onSubmit={submitSetPassword}>
            <div className="text-sm text-muted-foreground">
              Set a password for {email} to skip email codes next time.
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">New password</label>
              <input
                type="password"
                required
                className="mt-2 w-full rounded-xl border border-border bg-white/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
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
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold shadow hover:shadow-lg disabled:opacity-60"
            >
              Save password
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => router.replace(redirect)}
              className="w-full text-sm text-indigo-600 hover:underline"
            >
              Skip for now
            </button>
          </form>
        )}

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          <span>Use a password or one-time email code. Passwords are stored securely (hashed).</span>
        </div>
      </div>
    </div>
  )
}

export default function LoginPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-mesh flex items-center justify-center text-muted-foreground">Loading...</div>}>
      <LoginContent />
    </Suspense>
  )
}
