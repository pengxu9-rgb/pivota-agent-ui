'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { submitServiceBooking } from '@/lib/api';
import { BookingStepContact } from './BookingStepContact';
import { BookingStepNotes } from './BookingStepNotes';
import { BookingStepReview } from './BookingStepReview';
import { BookingStepSlots } from './BookingStepSlots';
import { PhotoPlaceholder } from './PhotoPlaceholder';
import { useBookingDraft } from '@/features/services/lib/use-booking-draft';
import { formatKRW } from '@/features/services/lib/format';
import type { Provider, ServiceListing } from '@/features/services/lib/types';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: Provider;
  listing: ServiceListing;
};

const STEP_LABELS = ['Choose your time', 'Contact details', 'Notes', 'Review + submit'];

function canContinue(step: number, draft: ReturnType<typeof useBookingDraft>['draft']): boolean {
  if (step === 0) return Boolean(draft.preferred.date && draft.preferred.time);
  if (step === 1) return Boolean(draft.contact.email || draft.contact.phone);
  return true;
}

export function BookingSheet({ open, onOpenChange, provider, listing }: Props) {
  const router = useRouter();
  const { draft, dispatch, clear } = useBookingDraft({
    providerId: provider.id,
    listingId: listing.listing_id || listing.id,
  });
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const photo = provider.photos?.[0] || provider.photo || '';
  const priceLabel = listing.price_cents == null || listing.requires_consult ? 'Consult required' : formatKRW(listing.price_cents);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setError('');
  }, [open, listing.listing_id, listing.id]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onOpenChange]);

  const content = useMemo(() => {
    if (step === 0) return <BookingStepSlots draft={draft} dispatch={dispatch} />;
    if (step === 1) return <BookingStepContact draft={draft} dispatch={dispatch} />;
    if (step === 2) return <BookingStepNotes draft={draft} dispatch={dispatch} />;
    return <BookingStepReview draft={draft} provider={provider} listing={listing} usdRate={provider.usd_per_won_rate} />;
  }, [dispatch, draft, listing, provider, step]);

  if (!open) return null;

  const submit = async () => {
    if (!canContinue(step, draft)) return;
    if (step < 3) {
      setStep((value) => value + 1);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const response = await submitServiceBooking({
        provider_id: provider.id,
        listing_id: listing.listing_id || listing.id,
        preferred: draft.preferred,
        alternates: draft.alternates,
        contact: draft.contact,
        notes: draft.notes,
      });
      clear();
      onOpenChange(false);
      router.push(`/services/bookings/${response.booking_id}`);
    } catch (err) {
      const message = err instanceof Error && err.message === 'PIVOTA_SERVICES_BACKEND_NOT_READY'
        ? 'Stage-1 backend not yet wired. Your request was not sent.'
        : 'Could not send this request. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="pv-pdp fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-0 backdrop-blur-[2px] md:items-center md:px-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={STEP_LABELS[step]}
        className="relative flex h-[90vh] w-full max-w-none flex-col overflow-hidden rounded-t-[18px] bg-white text-[var(--pv-ink)] shadow-[var(--pv-shadow-pop)] md:h-auto md:max-h-[88vh] md:max-w-[720px] md:rounded-[var(--pv-radius-lg)]"
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-[var(--pv-border)] px-4 pb-4 pt-3 md:px-6 md:pt-5">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--pv-border-strong)] md:hidden" />
            <div className="flex items-start gap-3">
              <div className="hidden h-14 w-14 shrink-0 overflow-hidden rounded-[var(--pv-radius-sm)] bg-[var(--pv-paper-muted)] md:block">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" className="h-full w-full object-cover" />
                ) : (
                  <PhotoPlaceholder service_type={listing.service_type} provider_initial={provider.name} className="h-full w-full" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--pv-ink-45)]">
                  Step {step + 1} of 4
                </div>
                <div className="mt-0.5 text-[16px] font-semibold text-[var(--pv-ink)] md:text-[18px]">{STEP_LABELS[step]}</div>
                <div className="mt-1 truncate text-[12px] text-[var(--pv-ink-60)]">{provider.name} · {listing.title} · {priceLabel}</div>
              </div>
              <button type="button" onClick={() => onOpenChange(false)} className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--pv-border)] text-[var(--pv-ink)]" aria-label="Close">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-4 hidden grid-cols-4 gap-2 md:grid">
              {STEP_LABELS.map((label, index) => (
                <div key={label} className="flex items-center gap-2">
                  <span className={cn('flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold', index <= step ? 'bg-[var(--pv-ink)] text-white' : 'bg-[var(--pv-paper-muted)] text-[var(--pv-ink-45)]')}>
                    {index + 1}
                  </span>
                  <span className="truncate text-[11px] font-medium text-[var(--pv-ink-60)]">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--pv-paper)] px-4 py-5 md:px-6">
            {content}
          </div>

          <div className="border-t border-[var(--pv-border)] bg-white px-4 py-3 md:px-6">
            {error ? <div className="mb-2 text-[12px] font-semibold text-[var(--pv-coral-icon)]">{error}</div> : null}
            <div className="flex items-center gap-3">
              {step > 0 ? (
                <button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} className="h-10 rounded-full border border-[var(--pv-border)] px-4 text-[13px] font-semibold text-[var(--pv-ink)]">
                  Back
                </button>
              ) : <div className="w-[70px]" />}
              <div className="flex flex-1 justify-center gap-1.5">
                {STEP_LABELS.map((label, index) => (
                  <span key={label} className={cn('h-1.5 rounded-full', index === step ? 'w-5 bg-[var(--pv-ink)]' : 'w-1.5 bg-[var(--pv-border-strong)]')} />
                ))}
              </div>
              <button
                type="button"
                onClick={submit}
                disabled={!canContinue(step, draft) || submitting}
                className="h-10 rounded-full bg-[var(--pv-ink)] px-4 text-[13px] font-semibold text-white disabled:opacity-45"
              >
                {submitting ? 'Submitting…' : step === 3 ? 'Send request' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
