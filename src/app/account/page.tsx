'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, LogOut, ShieldCheck, Sparkles, User as UserIcon } from 'lucide-react';
import { accountsLogout, accountsMe, accountsSetPassword } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';

export default function AccountPage() {
  const router = useRouter();
  const { user, setSession, clear } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await accountsMe();
        if (cancelled) return;
        if ((data as any)?.user) {
          setSession({
            user: (data as any).user,
            memberships: (data as any).memberships || [],
            active_merchant_id: (data as any).active_merchant_id,
          });
        }
      } catch (err: any) {
        if (cancelled) return;
        if (err?.status === 401 || err?.code === 'UNAUTHENTICATED') {
          clear();
        } else {
          toast.error(err?.message || 'Failed to load account');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [setSession, clear]);

  const hasPassword = Boolean(user?.has_password);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      toast.error('Please enter your new password');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setSaving(true);
    try {
      await accountsSetPassword(newPassword, currentPassword || undefined);
      toast.success('Password saved');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      router.replace('/');
    } catch (err: any) {
      const code = err?.code;
      if (code === 'CURRENT_PASSWORD_REQUIRED') {
        toast.error('Please enter your current password (or sign in with email code to reset it).');
      } else if (code === 'INVALID_CREDENTIALS') {
        toast.error('Current password is incorrect');
      } else if (code === 'INVALID_INPUT') {
        toast.error(err?.message || 'Invalid password');
      } else {
        toast.error(err?.message || 'Failed to save password');
      }
    } finally {
      setSaving(false);
    }
  };

  const doLogout = async () => {
    setSaving(true);
    try {
      await accountsLogout();
    } catch {
      // ignore
    } finally {
      clear();
      setSaving(false);
      router.replace('/');
    }
  };

  const inputClass =
    'mt-1.5 w-full rounded-xl bg-[#F4F4F2] px-3 py-2.5 text-[13px] outline-none transition focus:bg-white';
  const inputStyle = {
    color: '#2C2C2A',
    borderWidth: '0.5px',
    borderColor: 'rgba(44,44,42,0.08)',
  } as const;

  return (
    <div className="flex h-screen w-full flex-col bg-white">
      {/* Top bar — matches home */}
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
        <h1 className="text-[14px] font-semibold" style={{ color: '#2C2C2A' }}>Account</h1>
        <div className="w-9" />
      </header>

      <main className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
        {loading ? (
          <div className="text-[13px]" style={{ color: '#2C2C2A99' }}>Loading…</div>
        ) : !user ? (
          <div className="space-y-3 pt-12 text-center">
            <div
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
              style={{ backgroundColor: '#EEEDFE' }}
            >
              <UserIcon className="h-6 w-6" style={{ color: '#534AB7' }} strokeWidth={1.6} />
            </div>
            <div className="space-y-1">
              <p className="text-[15px] font-semibold" style={{ color: '#2C2C2A' }}>Sign in to Pivota</p>
              <p className="text-[12px]" style={{ color: '#2C2C2A99' }}>
                Save orders, sync your shopping behavior, and access tailored picks.
              </p>
            </div>
            <Link
              href="/login?redirect=/account"
              className="mt-2 inline-flex w-full items-center justify-center rounded-full px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity active:opacity-85"
              style={{ backgroundColor: '#534AB7' }}
            >
              Login
            </Link>
          </div>
        ) : (
          <>
            {/* Profile card */}
            <section
              className="rounded-2xl bg-white p-4"
              style={{ borderWidth: '0.5px', borderColor: 'rgba(44,44,42,0.08)' }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-full"
                  style={{ backgroundColor: '#EEEDFE' }}
                >
                  <Sparkles className="h-5 w-5" style={{ color: '#534AB7' }} strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold truncate" style={{ color: '#2C2C2A' }}>
                    {user.email || user.id}
                  </div>
                  <div
                    className="mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: hasPassword ? '#E1F5EE' : '#FAEEDA',
                      color: hasPassword ? '#1D9E75' : '#633806',
                    }}
                  >
                    Password {hasPassword ? 'set' : 'not set'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={doLogout}
                  disabled={saving}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-medium transition-colors active:bg-[#FAECE7] disabled:opacity-50"
                  style={{
                    color: '#993C1D',
                    borderWidth: '0.5px',
                    borderColor: 'rgba(216, 90, 48, 0.3)',
                  }}
                >
                  <LogOut className="h-3 w-3" />
                  Logout
                </button>
              </div>
            </section>

            {/* Password form */}
            <section
              className="rounded-2xl bg-white p-4 space-y-3"
              style={{ borderWidth: '0.5px', borderColor: 'rgba(44,44,42,0.08)' }}
            >
              <div>
                <h2 className="text-[13px] font-semibold" style={{ color: '#2C2C2A' }}>
                  {hasPassword ? 'Change password' : 'Set a password'}
                </h2>
                <p className="mt-0.5 text-[11px]" style={{ color: '#2C2C2A99' }}>
                  {hasPassword
                    ? 'Update your password to keep the account secure.'
                    : 'Add a password so you can sign in without an email code.'}
                </p>
              </div>

              <form className="space-y-3" onSubmit={submitPassword}>
                {hasPassword && (
                  <div>
                    <label htmlFor="account-current-password" className="text-[12px] font-medium" style={{ color: '#2C2C2A' }}>
                      Current password{' '}
                      <span className="font-normal text-[10px]" style={{ color: '#2C2C2A99' }}>
                        (optional if just signed in)
                      </span>
                    </label>
                    <input
                      id="account-current-password"
                      type="password"
                      className={inputClass}
                      style={inputStyle}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="account-new-password" className="text-[12px] font-medium" style={{ color: '#2C2C2A' }}>
                    New password
                  </label>
                  <input
                    id="account-new-password"
                    type="password"
                    required
                    className={inputClass}
                    style={inputStyle}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={saving}
                  />
                </div>

                <div>
                  <label htmlFor="account-confirm-password" className="text-[12px] font-medium" style={{ color: '#2C2C2A' }}>
                    Confirm password
                  </label>
                  <input
                    id="account-confirm-password"
                    type="password"
                    required
                    className={inputClass}
                    style={inputStyle}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={saving}
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full inline-flex items-center justify-center rounded-full px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity active:opacity-85 disabled:opacity-50"
                  style={{ backgroundColor: '#534AB7' }}
                >
                  Save password
                </button>

                <div className="flex items-center gap-1.5 text-[10px]" style={{ color: '#2C2C2A99' }}>
                  <ShieldCheck className="h-3 w-3" />
                  Passwords are stored hashed. We never see them.
                </div>
              </form>
            </section>

            {/* Quick links */}
            <section
              className="rounded-2xl bg-white overflow-hidden"
              style={{ borderWidth: '0.5px', borderColor: 'rgba(44,44,42,0.08)' }}
            >
              {[
                { href: '/orders',         label: 'My orders' },
                { href: '/browse-history', label: 'Browse history' },
                { href: '/reviews',        label: 'Reviews' },
              ].map((row, i, arr) => (
                <Link
                  key={row.href}
                  href={row.href}
                  className="flex items-center justify-between px-4 py-3 transition-colors active:bg-[#F4F4F2]"
                  style={
                    i < arr.length - 1
                      ? { borderBottomWidth: '0.5px', borderColor: 'rgba(44,44,42,0.08)' }
                      : undefined
                  }
                >
                  <span className="text-[13px]" style={{ color: '#2C2C2A' }}>{row.label}</span>
                  <ChevronLeft className="h-4 w-4 rotate-180" style={{ color: '#2C2C2A66' }} />
                </Link>
              ))}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
