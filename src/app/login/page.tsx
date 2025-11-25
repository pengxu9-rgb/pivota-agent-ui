'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Mail, ArrowRight, ShieldCheck } from 'lucide-react'
import { accountsLogin, accountsVerify } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'sonner'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/my-orders'

  const { setSession, user } = useAuthStore()
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [debugOtp, setDebugOtp] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      router.replace(redirect)
    }
  }, [user, redirect, router])

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

  return (
    <div className="min-h-screen bg-gradient-mesh flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white/80 backdrop-blur-md rounded-3xl shadow-lg p-8 space-y-6 border border-border">
        <div className="flex items-center gap-3">
          <Mail className="h-8 w-8 text-indigo-500" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Account Login</h1>
            <p className="text-sm text-muted-foreground">Use your email to receive a one-time code</p>
          </div>
        </div>

        {step === 'email' && (
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

        {step === 'otp' && (
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

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          <span>We use one-time codes. No password is stored.</span>
        </div>
      </div>
    </div>
  )
}
