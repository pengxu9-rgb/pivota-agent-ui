'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, MapPin, Search, X, AlertCircle } from 'lucide-react';
import { getServicesBrowse } from '@/lib/api';
import { BrowseProviderCard } from '@/features/services/components/BrowseProviderCard';
import { SkeletonCard } from '@/features/services/components/SkeletonCard';
import { SVC_FILTER_CHIPS } from '@/features/services/lib/svc-labels';
import { useServicesSearchParams } from '@/features/services/lib/use-services-search-params';
import type { Provider, ServicesBrowseResponse, ServiceType } from '@/features/services/lib/types';

function isBackendPending(error: string): boolean {
  return error === 'PIVOTA_SERVICES_BACKEND_NOT_READY';
}

function BackendPendingState() {
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--pv-tip-bg)] text-[var(--pv-tip-fg)]">
        <AlertCircle size={26} aria-hidden="true" />
      </div>
      <h2 className="mt-5 text-[18px] font-semibold text-[var(--pv-ink)]">Stage-1 backend not yet wired.</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--pv-ink-60)]">
        The services UI is ready, but real Seoul provider data will load only after `/api/services/*` lands.
      </p>
    </div>
  );
}

function EmptyState({ totalPilotProviders, onClear }: { totalPilotProviders?: number; onClear: () => void }) {
  const pilotLabel = totalPilotProviders ? `${totalPilotProviders} providers` : 'a small set of providers';

  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--pv-paper-muted)] text-[var(--pv-ink-45)]">
        <Search size={26} aria-hidden="true" />
      </div>
      <h2 className="mt-5 text-[18px] font-semibold text-[var(--pv-ink)]">No providers match that yet.</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--pv-ink-60)]">
        The pilot is limited to {pilotLabel} in Gangnam-gu, so narrower filters may need a second pass.
      </p>
      <div className="mt-5 flex items-center justify-center gap-2">
        <button type="button" onClick={onClear} className="rounded-full bg-[var(--pv-ink)] px-4 py-2 text-[12px] font-semibold text-white">
          Clear filters
        </button>
        <a href="mailto:hello@pivota.cc?subject=Seoul%20services%20request" className="rounded-full border border-[var(--pv-border)] bg-white px-4 py-2 text-[12px] font-semibold text-[var(--pv-ink)]">
          Tell us what to add
        </a>
      </div>
    </div>
  );
}

export default function ServicesBrowsePage() {
  const { filters, patch, clear } = useServicesSearchParams();
  const [response, setResponse] = useState<ServicesBrowseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void getServicesBrowse({ ...filters, limit: 24 })
      .then((data) => {
        if (cancelled) return;
        setResponse(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setResponse(null);
        setError(err instanceof Error ? err.message : 'SERVICE_BROWSE_FAILED');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filterKey, filters]);

  const results: Provider[] = response?.results || [];
  const total = response?.pagination?.total ?? results.length;
  const activeTypes = filters.service_type || [];

  const toggleServiceType = (serviceType: 'all' | ServiceType) => {
    if (serviceType === 'all') {
      patch({ service_type: undefined, offset: undefined });
      return;
    }
    const next = activeTypes.includes(serviceType)
      ? activeTypes.filter((type) => type !== serviceType)
      : [...activeTypes, serviceType];
    patch({ service_type: next.length ? next : undefined, offset: undefined });
  };

  return (
    <div className="pv-pdp min-h-screen bg-[var(--pv-paper)] text-[var(--pv-ink)]">
      <header className="sticky top-0 z-20 border-b border-[var(--pv-border)] bg-[rgba(250,250,248,0.94)] backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto max-w-[1180px] px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Back" className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--pv-border)] bg-white md:hidden" onClick={() => history.back()}>
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-[18px] font-semibold leading-tight text-[var(--pv-ink)]">Beauty services in Seoul</h1>
              <div className="mt-0.5 flex items-center gap-1 text-[11.5px] text-[var(--pv-ink-60)]">
                <MapPin size={12} className="text-[var(--pv-coral)]" aria-hidden="true" />
                Gangnam-gu · {total} curated providers
              </div>
            </div>
            <Link href="/" className="hidden rounded-full border border-[var(--pv-border)] bg-white px-3 py-2 text-[12px] font-semibold text-[var(--pv-ink)] md:inline-flex">
              Pivota
            </Link>
          </div>

          <div className="relative mt-3">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pv-ink-45)]" aria-hidden="true" />
            <input
              value={filters.q || ''}
              onChange={(event) => patch({ q: event.target.value || undefined, offset: undefined })}
              placeholder="Search facial, lash, clinic..."
              className="h-[38px] w-full rounded-full border border-[var(--pv-border)] bg-white pl-9 pr-10 text-[13px] outline-none focus:border-[var(--pv-primary)]"
            />
            {filters.q ? (
              <button type="button" onClick={() => patch({ q: undefined, offset: undefined })} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--pv-ink-45)]" aria-label="Clear search">
                <X size={15} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {SVC_FILTER_CHIPS.map((chip) => {
              const active = chip.id === 'all' ? activeTypes.length === 0 : activeTypes.includes(chip.id);
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => toggleServiceType(chip.id)}
                  className={active
                    ? 'shrink-0 rounded-full bg-[var(--pv-ink)] px-3 py-2 text-[12px] font-semibold text-white'
                    : 'shrink-0 rounded-full border border-[var(--pv-border)] bg-white px-3 py-2 text-[12px] font-semibold text-[var(--pv-ink-60)]'}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {[
              { key: 'english_friendly', label: 'English-friendly', active: filters.english_friendly, patch: { english_friendly: filters.english_friendly ? undefined : true } },
              { key: 'priced_only', label: 'Posted price', active: filters.priced_only, patch: { priced_only: filters.priced_only ? undefined : true } },
              { key: 'walk_ins', label: 'Walk-ins', active: filters.walk_ins, patch: { walk_ins: filters.walk_ins ? undefined : true } },
              { key: 'under_200', label: 'Under ₩200k', active: filters.max_price_won === 200000, patch: { max_price_won: filters.max_price_won === 200000 ? undefined : 200000 } },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => patch({ ...item.patch, offset: undefined })}
                className={item.active
                  ? 'shrink-0 rounded-full border-[1.5px] border-[var(--pv-primary)] bg-[var(--pv-primary-50)] px-3 py-2 text-[12px] font-semibold text-[var(--pv-primary)]'
                  : 'shrink-0 rounded-full border border-[var(--pv-border)] bg-white px-3 py-2 text-[12px] font-semibold text-[var(--pv-ink-60)]'}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-4 pb-16 md:px-6">
        <div className="my-4 rounded-[var(--pv-radius-lg)] bg-[var(--pv-tip-bg)] px-3 py-3 text-[11.5px] font-medium leading-relaxed text-[var(--pv-tip-fg)]">
          Pilot · Seoul Gangnam-gu. Requests are routed via KakaoTalk; providers typically confirm within 24h. No deposit charged.
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <SkeletonCard key={index} className={index > 3 ? 'hidden md:block' : ''} />
            ))}
          </div>
        ) : isBackendPending(error) ? (
          <BackendPendingState />
        ) : error ? (
          <div className="mx-auto max-w-md px-6 py-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--pv-coral-bg)] text-[var(--pv-coral-icon)]">
              <AlertCircle size={26} aria-hidden="true" />
            </div>
            <h2 className="mt-5 text-[18px] font-semibold text-[var(--pv-ink)]">Couldn&apos;t load services.</h2>
            <button type="button" onClick={() => patch({ offset: undefined })} className="mt-4 rounded-full bg-[var(--pv-ink)] px-4 py-2 text-[12px] font-semibold text-white">
              Retry
            </button>
          </div>
        ) : results.length ? (
          <div className="grid gap-4 md:grid-cols-3">
            {results.map((provider) => (
              <BrowseProviderCard key={provider.id} provider={provider} usdRate={response?.usd_per_won_rate} />
            ))}
          </div>
        ) : (
          <EmptyState totalPilotProviders={response?.pagination?.total_pilot_providers} onClear={clear} />
        )}
      </main>
    </div>
  );
}
