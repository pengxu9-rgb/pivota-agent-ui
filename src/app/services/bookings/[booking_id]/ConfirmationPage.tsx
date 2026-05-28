'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Check, ChevronRight, Clock } from 'lucide-react';
import { getServiceBooking } from '@/lib/api';
import { BookingItineraryCard } from '@/features/services/components/BookingItineraryCard';
import { BookingStatusPill } from '@/features/services/components/BookingStatusPill';
import { BrowseProviderCard } from '@/features/services/components/BrowseProviderCard';
import type { ServiceBooking } from '@/features/services/lib/types';

function addHoursLabel(hours: number): string {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
    timeZoneName: 'short',
  }).format(date);
}

function BackendPendingState() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--pv-tip-bg)] text-[var(--pv-tip-fg)]">
        <AlertCircle size={26} aria-hidden="true" />
      </div>
      <h1 className="mt-5 text-[20px] font-semibold text-[var(--pv-ink)]">Stage-1 backend not yet wired.</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--pv-ink-60)]">
        Booking status pages will load after `/api/services/bookings/*` is available.
      </p>
      <Link href="/services" className="mt-5 rounded-full bg-[var(--pv-ink)] px-4 py-2 text-[12px] font-semibold text-white">
        Browse Seoul services
      </Link>
    </div>
  );
}

function SuggestedAlternatives({ booking }: { booking: ServiceBooking }) {
  const alternatives = booking.alternative_providers?.slice(0, 2) || [];
  if (!alternatives.length) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-[15px] font-semibold text-[var(--pv-ink)]">Try another provider</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {alternatives.map((provider) => (
          <BrowseProviderCard key={provider.id} provider={provider} usdRate={booking.usd_per_won_rate} />
        ))}
      </div>
    </section>
  );
}

function ConfirmationLayout({ booking, onRefresh, refreshing }: { booking: ServiceBooking; onRefresh: () => void; refreshing: boolean }) {
  const email = booking.contact.email || 'your contact email';
  const isConfirmed = booking.status === 'confirmed';
  const isDeclined = booking.status === 'declined';
  const heading = isConfirmed
    ? `Confirmed for ${booking.provider.name}.`
    : isDeclined
      ? `${booking.provider.name} couldn't accommodate.`
      : `Request sent to ${booking.provider.name}.`;
  const slaTitle = isConfirmed
    ? `Confirmed for ${booking.confirmed_for?.date || booking.preferred.date} · ${booking.confirmed_for?.time || booking.preferred.time} KST`
    : isDeclined
      ? 'The provider could not accommodate this request.'
      : `Expect a reply by ${booking.expires_at ? booking.expires_at : addHoursLabel(24)}`;

  return (
    <main className="mx-auto max-w-[760px] px-4 pb-16">
      <header className="rounded-b-[var(--pv-radius-lg)] bg-gradient-to-b from-[var(--pv-teal-bg)] to-transparent px-2 pb-8 pt-10 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[var(--pv-teal)] text-white">
          <Check size={24} aria-hidden="true" />
        </div>
        <h1 className="mt-4 font-serif text-[30px] font-medium leading-tight text-[var(--pv-ink)]">{heading}</h1>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[var(--pv-ink-60)]">
          Pivota will route updates to {email}. Requests usually confirm within 24h.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <span className="rounded-full bg-white px-3 py-1.5 font-mono text-[11px] text-[var(--pv-ink-60)] shadow-[var(--pv-shadow-sm)]">
            booking_id · {booking.booking_id}
          </span>
          <BookingStatusPill status={booking.status} />
        </div>
      </header>

      <div className="mt-6 space-y-5">
        <BookingItineraryCard
          provider={booking.provider}
          listing={booking.listing}
          preferred={booking.confirmed_for || booking.preferred}
          status={booking.status}
          usdRate={booking.usd_per_won_rate}
        />
        <section className="flex items-start gap-3 rounded-[var(--pv-radius-lg)] bg-white p-4 shadow-[var(--pv-shadow-sm)]">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--pv-paper-muted)] text-[var(--pv-ink)]">
            <Clock size={17} aria-hidden="true" />
          </div>
          <div>
            <div className="text-[14px] font-semibold text-[var(--pv-ink)]">{slaTitle}</div>
            <div className="mt-1 text-[12px] leading-relaxed text-[var(--pv-ink-60)]">
              No deposit is charged for Stage-1 service requests.
            </div>
          </div>
        </section>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="h-11 rounded-full bg-[var(--pv-ink)] px-4 text-[13px] font-semibold text-white disabled:opacity-45"
          >
            {refreshing ? 'Refreshing…' : 'Refresh status'}
          </button>
          <Link
            href="/services"
            className="flex h-11 items-center justify-center rounded-full border border-[var(--pv-border)] bg-white px-4 text-[13px] font-semibold text-[var(--pv-ink)]"
          >
            Browse more Seoul services
          </Link>
        </div>
      </div>
    </main>
  );
}

function ExpiredLayout({ booking }: { booking: ServiceBooking }) {
  return (
    <main className="mx-auto max-w-[760px] px-4 pb-16">
      <header className="rounded-b-[var(--pv-radius-lg)] bg-gradient-to-b from-[var(--pv-coral-bg)] to-transparent px-2 pb-8 pt-10 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[var(--pv-coral-bg)] text-[var(--pv-coral-icon)]">
          <AlertCircle size={24} aria-hidden="true" />
        </div>
        <h1 className="mt-4 font-serif text-[30px] font-medium leading-tight text-[var(--pv-ink)]">No response from {booking.provider.name}.</h1>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[var(--pv-ink-60)]">
          The 24h reply window passed and no charge was made.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <BookingStatusPill status="expired" />
          <span className="rounded-full bg-white px-3 py-1.5 font-mono text-[11px] text-[var(--pv-ink-60)] shadow-[var(--pv-shadow-sm)]">
            booking_id · {booking.booking_id}
          </span>
        </div>
      </header>

      <div className="mt-6 space-y-5">
        <BookingItineraryCard
          provider={booking.provider}
          listing={booking.listing}
          preferred={booking.preferred}
          status="expired"
          dim
          usdRate={booking.usd_per_won_rate}
        />
        <SuggestedAlternatives booking={booking} />
        <Link href="/services" className="flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--pv-ink)] px-4 text-[13px] font-semibold text-white">
          Browse all Seoul services <ChevronRight size={15} aria-hidden="true" />
        </Link>
        <p className="text-center text-[11px] text-[var(--pv-ink-60)]">
          Heads up: providers in our Stage-1 pilot reply 88% of the time. Sorry this one slipped through.
        </p>
      </div>
    </main>
  );
}

export default function ConfirmationPage({ bookingId }: { bookingId: string }) {
  const [booking, setBooking] = useState<ServiceBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void getServiceBooking(bookingId)
      .then((data) => {
        if (!cancelled) setBooking(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'SERVICE_BOOKING_FAILED');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const refreshStatus = async () => {
    setRefreshing(true);
    try {
      const data = await getServiceBooking(bookingId);
      setBooking(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SERVICE_BOOKING_FAILED');
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return <div className="pv-pdp min-h-screen animate-pulse bg-[var(--pv-paper)]" />;
  }

  if (error === 'PIVOTA_SERVICES_BACKEND_NOT_READY') {
    return <div className="pv-pdp min-h-screen bg-[var(--pv-paper)]"><BackendPendingState /></div>;
  }

  if (error || !booking) {
    return (
      <div className="pv-pdp flex min-h-screen items-center justify-center bg-[var(--pv-paper)] px-6 text-center">
        <div>
          <h1 className="text-[20px] font-semibold text-[var(--pv-ink)]">Booking unavailable.</h1>
          <Link href="/services" className="mt-5 inline-flex rounded-full bg-[var(--pv-ink)] px-4 py-2 text-[12px] font-semibold text-white">
            Browse Seoul services
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pv-pdp min-h-screen bg-[var(--pv-paper)] text-[var(--pv-ink)]">
      {booking.status === 'expired' ? <ExpiredLayout booking={booking} /> : <ConfirmationLayout booking={booking} onRefresh={refreshStatus} refreshing={refreshing} />}
    </div>
  );
}
