'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, ChevronLeft, ShieldCheck, Sparkles } from 'lucide-react';
import { accountsLogin, accountsLoginWithPassword, accountsSetPassword, accountsVerify } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';
import { safeReturnUrl } from '@/lib/returnUrl';

type LoginMethod = 'otp' | 'password';

const trackAuthSession = (payload: Record<string, unknown>) => {
  // eslint-disable-next-line no-console
  console.log('[TRACK]', 'aurora_session_source', {
    ...payload,
    ts: new Date().toISOString(),
  });
};

const inputClass =
  'mt-1.5 w-full rounded-xl bg-[#F4F4F2] px-3 py-2.5 text-[13px] outline-none transition focus:bg-white';
const inputStyle = {
  color: '#2C2C2A',
  borderWidth: '0.5px',
  borderColor: 'rgba(44,44,42,0.08)',
} as const;

const submitBtnClass =
  'w-full inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity active:opacity-85 disabled:opacity-50';
const submitBtnStyle = { backgroundColor: '#534AB7' } as const;

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = safeReturnUrl(searchParams.get('redirect')) || '/my-orders';

  const { setSession, user } = useAuthStore();
  const [method, setMethod] = useState<LoginMethod>('otp');
  const [step, setStep] = useState<'email' | 'otp' | 'set_password'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [debugOtp, setDebugOtp] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      router.replace(redirect);
    }
  }, [user, redirect, router]);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await accountsLoginWithPassword(email.trim(), password);
      setSession({
        user: (data as any).user,
        memberships: (data as any).memberships || [],
        active_merchant_id: (data as any).active_merchant_id,
      });
      trackAuthSession({
        session_source: 'login',
        method: 'password',
        user_id: (data as any)?.user?.id || null,
      });
      toast.success('Login successful');
      router.replace(redirect);
    } catch (err: any) {
      const code = err?.code;
      if (code === 'NO_PASSWORD') {
        toast.error('No password is set for this account. Use email code once, then set a password.');
        setMethod('otp');
        setStep('email');
      } else if (code === 'INVALID_CREDENTIALS') {
        toast.error('Email or password is incorrect');
      } else if (code === 'INVALID_INPUT') {
        toast.error(err?.message || 'Invalid input');
      } else {
        toast.error(err?.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setDebugOtp(null);
    try {
      const res = await accountsLogin(email.trim());
      if ((res as any)?.debug_otp) {
        setDebugOtp((res as any).debug_otp);
        console.debug('Debug OTP (dev only):', (res as any).debug_otp);
      }
      toast.success('Verification code sent');
      setStep('otp');
    } catch (err: any) {
      const code = err?.code;
      if (code === 'INVALID_INPUT') {
        toast.error('Please enter a valid email');
      } else if (code === 'RATE_LIMITED') {
        toast.error('Requests are too frequent, please retry later');
      } else {
        toast.error(err?.message || 'Failed to send code');
      }
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await accountsVerify(email.trim(), otp.trim());
      setSession({
        user: (data as any).user,
        memberships: (data as any).memberships || [],
        active_merchant_id: (data as any).active_merchant_id,
      });
      trackAuthSession({
        session_source: 'login',
        method: 'otp',
        user_id: (data as any)?.user?.id || null,
      });
      const hasPassword = Boolean((data as any)?.user?.has_password);
      if (!hasPassword) {
        toast.success('Login successful — set a password to skip email codes next time');
        setStep('set_password');
        return;
      }
      toast.success('Login successful');
      router.replace(redirect);
    } catch (err: any) {
      const code = err?.code;
      if (code === 'INVALID_OTP') {
        toast.error('Verification code is invalid or expired');
      } else if (code === 'RATE_LIMITED') {
        toast.error('Too many attempts, please retry later');
      } else {
        toast.error(err?.message || 'Login failed, please retry');
      }
    } finally {
      setLoading(false);
    }
  };

  const submitSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      toast.error('Please enter your new password');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await accountsSetPassword(newPassword);
      toast.success('Password saved');
      router.replace(redirect);
    } catch (err: any) {
      const code = err?.code;
      if (code === 'CURRENT_PASSWORD_REQUIRED') {
        toast.error('Please enter your current password in Account settings to change it.');
      } else if (code === 'INVALID_INPUT') {
        toast.error(err?.message || 'Invalid password');
      } else {
        toast.error(err?.message || 'Failed to save password');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-white">
      {/* Top bar */}
      <header
        className="flex items-center justify-between bg-white px-3"
        style={{
          height: '54px',
          borderBottomWidth: '0.5px',
          borderColor: 'rgba(44,44,42,0.08)',
        }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          className="h-9 w-9 rounded-full flex items-center justify-center transition-opacity active:opacity-60"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" style={{ color: '#2C2C2A' }} />
        </button>
        <h1 className="text-[14px] font-semibold" style={{ color: '#2C2C2A' }}>Sign in</h1>
        <div className="w-9" />
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-8">
        <div className="w-full max-w-md space-y-5">
          {/* Hero */}
          <div className="text-center space-y-2 pb-2">
            <span
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
              style={{ backgroundColor: '#534AB7' }}
            >
              <Sparkles className="h-6 w-6 text-white" strokeWidth={1.8} />
            </span>
            <h2 className="text-[18px] font-semibold" style={{ color: '#2C2C2A' }}>
              Welcome to Pivota
            </h2>
            <p className="text-[12px]" style={{ color: '#2C2C2A99' }}>
              Use a password or one-time email code to continue
            </p>
          </div>

          {/* Method tabs */}
          {step !== 'set_password' && (
            <div
              className="grid grid-cols-2 rounded-full p-1"
              style={{ backgroundColor: '#F4F4F2' }}
            >
              {(['password', 'otp'] as LoginMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setMethod(m);
                    setStep('email');
                    setOtp('');
                    setPassword('');
                    setDebugOtp(null);
                  }}
                  className="rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-60"
                  style={
                    method === m
                      ? { backgroundColor: '#FFFFFF', color: '#534AB7', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }
                      : { backgroundColor: 'transparent', color: '#2C2C2A99' }
                  }
                >
                  {m === 'password' ? 'Password' : 'Email code'}
                </button>
              ))}
            </div>
          )}

          {/* Forms in a card */}
          <section
            className="rounded-2xl bg-white p-4 space-y-3"
            style={{ borderWidth: '0.5px', borderColor: 'rgba(44,44,42,0.08)' }}
          >
            {method === 'password' && step === 'email' && (
              <form className="space-y-3" onSubmit={submitPassword}>
                <div>
                  <label className="text-[12px] font-medium" style={{ color: '#2C2C2A' }}>Email</label>
                  <input
                    type="email"
                    required
                    className={inputClass}
                    style={inputStyle}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[12px] font-medium" style={{ color: '#2C2C2A' }}>Password</label>
                  <input
                    type="password"
                    required
                    className={inputClass}
                    style={inputStyle}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <button type="submit" disabled={loading} className={submitBtnClass} style={submitBtnStyle}>
                  Login <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            )}

            {method === 'otp' && step === 'email' && (
              <form className="space-y-3" onSubmit={submitEmail}>
                <div>
                  <label className="text-[12px] font-medium" style={{ color: '#2C2C2A' }}>Email</label>
                  <input
                    type="email"
                    required
                    className={inputClass}
                    style={inputStyle}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <button type="submit" disabled={loading} className={submitBtnClass} style={submitBtnStyle}>
                  Send code <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            )}

            {method === 'otp' && step === 'otp' && (
              <form className="space-y-3" onSubmit={submitOtp}>
                <div className="text-[12px]" style={{ color: '#2C2C2A99' }}>
                  Verification code was sent to <span style={{ color: '#2C2C2A' }}>{email}</span>
                </div>
                <div>
                  <label className="text-[12px] font-medium" style={{ color: '#2C2C2A' }}>Code</label>
                  <input
                    inputMode="numeric"
                    required
                    className={inputClass}
                    style={inputStyle}
                    placeholder="6-digit code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                  />
                  {debugOtp && (
                    <p className="text-[10px] mt-1" style={{ color: '#2C2C2A99' }}>Dev OTP: {debugOtp}</p>
                  )}
                </div>
                <button type="submit" disabled={loading} className={submitBtnClass} style={submitBtnStyle}>
                  Verify & Login
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setStep('email')}
                  className="w-full text-[12px] underline-offset-2 hover:underline"
                  style={{ color: '#534AB7' }}
                >
                  Change email
                </button>
              </form>
            )}

            {step === 'set_password' && (
              <form className="space-y-3" onSubmit={submitSetPassword}>
                <div className="text-[12px]" style={{ color: '#2C2C2A99' }}>
                  Set a password for <span style={{ color: '#2C2C2A' }}>{email}</span> to skip email codes next time.
                </div>
                <div>
                  <label className="text-[12px] font-medium" style={{ color: '#2C2C2A' }}>New password</label>
                  <input
                    type="password"
                    required
                    className={inputClass}
                    style={inputStyle}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[12px] font-medium" style={{ color: '#2C2C2A' }}>Confirm password</label>
                  <input
                    type="password"
                    required
                    className={inputClass}
                    style={inputStyle}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                <button type="submit" disabled={loading} className={submitBtnClass} style={submitBtnStyle}>
                  Save password
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => router.replace(redirect)}
                  className="w-full text-[12px] underline-offset-2 hover:underline"
                  style={{ color: '#534AB7' }}
                >
                  Skip for now
                </button>
              </form>
            )}
          </section>

          {/* Footer hint */}
          <div className="flex items-start gap-1.5 px-1 text-[10px]" style={{ color: '#2C2C2A99' }}>
            <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" strokeWidth={1.7} />
            <span>Use a password or one-time email code. Passwords are stored hashed; we never see them.</span>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function LoginPageWrapper() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center bg-white text-[13px]"
          style={{ color: '#2C2C2A99' }}
        >
          Loading...
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
