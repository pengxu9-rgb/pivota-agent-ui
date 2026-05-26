'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { getServiceProvider } from '@/lib/api';
import { AddressCard } from '@/features/services/components/AddressCard';
import { BookingSheet } from '@/features/services/components/BookingSheet';
import { HoursAccordion } from '@/features/services/components/HoursAccordion';
import { IdentityBlock } from '@/features/services/components/IdentityBlock';
import { PilotDisclosure } from '@/features/services/components/PilotDisclosure';
import { ProviderHero } from '@/features/services/components/ProviderHero';
import { ProviderTopBar } from '@/features/services/components/ProviderTopBar';
import { ServiceMenuGroup } from '@/features/services/components/ServiceMenuGroup';
import { formatKRW } from '@/features/services/lib/format';
import { getProviderListings } from '@/features/services/lib/types';
import type { Provider, ServiceListing, ServiceType } from '@/features/services/lib/types';

function isBackendPending(error: string): boolean {
  return error === 'PIVOTA_SERVICES_BACKEND_NOT_READY';
}

function sortListings(listings: ServiceListing[]): ServiceListing[] {
  return [...listings].sort((left, right) => {
    const leftConsult = left.requires_consult || left.price_cents == null;
    const rightConsult = right.requires_consult || right.price_cents == null;
    if (leftConsult !== rightConsult) return leftConsult ? 1 : -1;
    return (left.price_cents ?? Number.POSITIVE_INFINITY) - (right.price_cents ?? Number.POSITIVE_INFINITY);
  });
}

function groupListings(listings: ServiceListing[]): Array<[ServiceType, ServiceListing[]]> {
  const map = new Map<ServiceType, ServiceListing[]>();
  for (const listing of listings) {
    const group = map.get(listing.service_type) || [];
    group.push(listing);
    map.set(listing.service_type, group);
  }
  return Array.from(map.entries());
}

function BackendPendingState() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--pv-tip-bg)] text-[var(--pv-tip-fg)]">
        <AlertCircle size={26} aria-hidden="true" />
      </div>
      <h1 className="mt-5 text-[20px] font-semibold text-[var(--pv-ink)]">Stage-1 backend not yet wired.</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--pv-ink-60)]">
        This provider detail page is ready, but real Seoul provider records are still pending backend endpoints.
      </p>
      <Link href="/services" className="mt-5 rounded-full bg-[var(--pv-ink)] px-4 py-2 text-[12px] font-semibold text-white">
        Back to Seoul services
      </Link>
    </div>
  );
}

export default function ProviderDetailPage({ providerId }: { providerId: string }) {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [usdRate, setUsdRate] = useState<number | undefined>();
  const [selectedListing, setSelectedListing] = useState<ServiceListing | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void getServiceProvider(providerId)
      .then((data) => {
        if (cancelled) return;
        setProvider(data.provider);
        setUsdRate(data.usd_per_won_rate || data.provider.usd_per_won_rate);
      })
      .catch((err) => {
        if (cancelled) return;
        setProvider(null);
        setError(err instanceof Error ? err.message : 'SERVICE_PROVIDER_FAILED');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  const listings = useMemo(() => (provider ? getProviderListings(provider) : []), [provider]);
  const sortedListings = useMemo(() => sortListings(listings), [listings]);
  const grouped = useMemo(() => groupListings(listings), [listings]);
  const primaryServiceType = sortedListings[0]?.service_type || 'facial';
  const cheapest = sortedListings.find((listing) => !listing.requires_consult && listing.price_cents != null);
  const hasBookable = sortedListings.some((listing) => !listing.requires_consult && listing.price_cents != null);
  const bottomListing = sortedListings[0] || null;

  const requestListing = (listing: ServiceListing) => {
    setSelectedListing(listing);
    setSheetOpen(true);
  };

  if (loading) {
    return (
      <div className="pv-pdp min-h-screen bg-[var(--pv-paper)]">
        <div className="h-[280px] animate-pulse bg-[var(--pv-paper-muted)]" />
      </div>
    );
  }

  if (isBackendPending(error)) {
    return <div className="pv-pdp min-h-screen bg-[var(--pv-paper)]"><BackendPendingState /></div>;
  }

  if (error || !provider) {
    return (
      <div className="pv-pdp min-h-screen bg-[var(--pv-paper)]">
        <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
          <h1 className="text-[20px] font-semibold text-[var(--pv-ink)]">That provider isn&apos;t in the Stage-1 Seoul pilot yet.</h1>
          <Link href="/services" className="mt-5 rounded-full bg-[var(--pv-ink)] px-4 py-2 text-[12px] font-semibold text-white">
            Browse Seoul services
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pv-pdp min-h-screen bg-[var(--pv-paper)] pb-28 text-[var(--pv-ink)] md:pb-16">
      <ProviderTopBar title={provider.name} />
      <div className="md:hidden">
        <ProviderHero photos={provider.photos || []} providerName={provider.name} serviceType={primaryServiceType} />
      </div>

      <main className="mx-auto max-w-[1180px] md:px-6 md:pt-20">
        <div className="hidden pb-4 text-[12px] font-medium text-[var(--pv-ink-45)] md:block">
          Services › Seoul · Gangnam-gu › {provider.neighborhood} › {provider.name}
        </div>
        <div className="grid gap-5 md:grid-cols-[600px_1fr] md:gap-12">
          <div className="space-y-4">
            <div className="hidden md:block">
              <ProviderHero photos={provider.photos || []} providerName={provider.name} serviceType={primaryServiceType} className="h-[480px]" />
            </div>
            <AddressCard provider={provider} />
            <HoursAccordion hours={provider.hours} />
          </div>

          <div className="space-y-4">
            <IdentityBlock provider={provider} />
            <PilotDisclosure />
            <section className="mx-4 space-y-3 md:mx-0">
              <div className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--pv-ink-45)]">Service menu</div>
              {grouped.map(([serviceType, group], index) => (
                <ServiceMenuGroup
                  key={serviceType}
                  serviceType={serviceType}
                  listings={group}
                  defaultOpen={index === 0}
                  usdRate={usdRate}
                  onRequest={requestListing}
                />
              ))}
            </section>
          </div>
        </div>
      </main>

      {bottomListing ? (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-[var(--pv-border)] bg-white px-4 py-3 md:hidden">
          <div className="mx-auto flex max-w-[480px] items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium text-[var(--pv-ink-45)]">From</div>
              <div className="text-[15px] font-bold text-[var(--pv-ink)]">{cheapest?.price_cents ? formatKRW(cheapest.price_cents) : 'Consult'}</div>
            </div>
            <button type="button" onClick={() => requestListing(bottomListing)} className="h-11 rounded-full bg-[var(--pv-ink)] px-5 text-[13px] font-semibold text-white">
              {hasBookable ? 'Request booking' : 'Request consultation'}
            </button>
          </div>
        </div>
      ) : null}

      {selectedListing ? (
        <BookingSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          provider={provider}
          listing={selectedListing}
        />
      ) : null}
    </div>
  );
}
