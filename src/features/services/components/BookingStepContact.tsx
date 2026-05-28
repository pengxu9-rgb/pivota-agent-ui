'use client';

import { useState } from 'react';
import type { BookingDraftAction, BookingDraftState } from '@/features/services/lib/use-booking-draft';

type Props = {
  draft: BookingDraftState;
  dispatch: React.Dispatch<BookingDraftAction>;
  /** Pre-verified email from the host app (Airbnb, Expedia, etc.) */
  partnerEmail?: string | null;
  /** Display name of the host app shown in the "Use my … verified contact" label */
  partnerName?: string | null;
};

function isValidEmail(value: string): boolean {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function BookingStepContact({ draft, dispatch, partnerEmail, partnerName }: Props) {
  const [emailTouched, setEmailTouched] = useState(false);
  const email = draft.contact.email || '';
  const phone = draft.contact.phone || '';
  const emailInvalid = emailTouched && !isValidEmail(email);

  const setContact = (patch: { email?: string; phone?: string }) => {
    dispatch({ type: 'set_contact', contact: { ...draft.contact, ...patch } });
  };

  const verifiedLabel = partnerName ? `Use my ${partnerName}-verified contact` : 'Use my verified contact';

  return (
    <div className="space-y-4">
      {partnerEmail ? (
        <label className="flex items-center justify-between gap-3 rounded-[var(--pv-radius-lg)] bg-[var(--pv-tip-bg)] px-3 py-3 text-[12px] font-medium text-[var(--pv-tip-fg)]">
          <span>{verifiedLabel}</span>
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--pv-primary)]"
            checked={email === partnerEmail}
            onChange={(event) => setContact({ email: event.target.checked ? partnerEmail : '' })}
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
        <span className="text-[12px] font-semibold text-[var(--pv-ink)]">Phone or messenger</span>
        <input
          type="tel"
          value={phone}
          onChange={(event) => setContact({ phone: event.target.value })}
          placeholder="+1 555 000 0000"
          className="mt-1 h-11 w-full rounded-[var(--pv-radius-md)] border border-[var(--pv-border)] bg-white px-3 text-[14px] text-[var(--pv-ink)] outline-none focus:border-[var(--pv-primary)]"
        />
      </label>

      <div className="text-[12px] leading-relaxed text-[var(--pv-ink-60)]">
        Add at least one contact method. WhatsApp, Telegram, Line, WeChat, KakaoTalk or SMS — whichever you use most.
      </div>
    </div>
  );
}
