'use client';

import { useState } from 'react';
import type { BookingDraftAction, BookingDraftState } from '@/features/services/lib/use-booking-draft';

type Props = {
  draft: BookingDraftState;
  dispatch: React.Dispatch<BookingDraftAction>;
  airbnbEmail?: string | null;
};

function isValidEmail(value: string): boolean {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function BookingStepContact({ draft, dispatch, airbnbEmail }: Props) {
  const [emailTouched, setEmailTouched] = useState(false);
  const email = draft.contact.email || '';
  const phone = draft.contact.phone || '';
  const emailInvalid = emailTouched && !isValidEmail(email);

  const setContact = (patch: { email?: string; phone?: string }) => {
    dispatch({ type: 'set_contact', contact: { ...draft.contact, ...patch } });
  };

  return (
    <div className="space-y-4">
      {airbnbEmail ? (
        <label className="flex items-center justify-between gap-3 rounded-[var(--pv-radius-lg)] bg-[var(--pv-tip-bg)] px-3 py-3 text-[12px] font-medium text-[var(--pv-tip-fg)]">
          <span>Use my Airbnb-verified contact</span>
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--pv-primary)]"
            checked={email === airbnbEmail}
            onChange={(event) => setContact({ email: event.target.checked ? airbnbEmail : '' })}
          />
        </label>
      ) : null}

      <label className="block">
        <span className="text-[12px] font-semibold text-[var(--pv-ink)]">Email</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setContact({ email: event.target.value })}
          onBlur={() => setEmailTouched(true)}
          placeholder="you@example.com"
          className="mt-1 h-11 w-full rounded-[var(--pv-radius-md)] border border-[var(--pv-border)] bg-white px-3 text-[14px] text-[var(--pv-ink)] outline-none focus:border-[var(--pv-primary)]"
        />
        {emailInvalid ? <span className="mt-1 block text-[11px] font-medium text-[var(--pv-coral-icon)]">Enter a valid email.</span> : null}
      </label>

      <label className="block">
        <span className="text-[12px] font-semibold text-[var(--pv-ink)]">Phone or KakaoTalk</span>
        <input
          type="tel"
          value={phone}
          onChange={(event) => setContact({ phone: event.target.value })}
          placeholder="+1 555 000 0000"
          className="mt-1 h-11 w-full rounded-[var(--pv-radius-md)] border border-[var(--pv-border)] bg-white px-3 text-[14px] text-[var(--pv-ink)] outline-none focus:border-[var(--pv-primary)]"
        />
      </label>

      <div className="text-[12px] leading-relaxed text-[var(--pv-ink-60)]">
        Add at least one contact method. KakaoTalk is preferred for fast provider replies.
      </div>
    </div>
  );
}
