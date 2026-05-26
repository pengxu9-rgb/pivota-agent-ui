'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ServiceMenuRow } from './ServiceMenuRow';
import { formatKRW } from '@/features/services/lib/format';
import { SVC_LABELS } from '@/features/services/lib/svc-labels';
import type { ServiceListing, ServiceType } from '@/features/services/lib/types';

type Props = {
  serviceType: ServiceType;
  listings: ServiceListing[];
  defaultOpen?: boolean;
  usdRate?: number;
  onRequest?: (listing: ServiceListing) => void;
};

function sortListings(listings: ServiceListing[]): ServiceListing[] {
  return [...listings].sort((left, right) => {
    const leftConsult = left.requires_consult || left.price_cents == null;
    const rightConsult = right.requires_consult || right.price_cents == null;
    if (leftConsult !== rightConsult) return leftConsult ? 1 : -1;
    return (left.price_cents ?? Number.POSITIVE_INFINITY) - (right.price_cents ?? Number.POSITIVE_INFINITY);
  });
}

function groupSubtitle(listings: ServiceListing[]): string {
  const priced = listings.filter((listing) => !listing.requires_consult && listing.price_cents != null);
  const count = listings.length;
  if (!priced.length) return `${count} ${count === 1 ? 'service' : 'services'} · consult only`;
  const cheapest = Math.min(...priced.map((listing) => listing.price_cents || 0));
  return `${count} ${count === 1 ? 'service' : 'services'} · from ${formatKRW(cheapest)}`;
}

export function ServiceMenuGroup({ serviceType, listings, defaultOpen = false, usdRate, onRequest }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const sorted = sortListings(listings);

  return (
    <section className="overflow-hidden rounded-[var(--pv-radius-lg)] border border-[var(--pv-border)] bg-white shadow-[var(--pv-shadow-sm)]">
      <button type="button" className="flex w-full items-center gap-3 px-4 py-4 text-left" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-[var(--pv-ink)]">{SVC_LABELS[serviceType]}</div>
          <div className="mt-0.5 text-[11px] text-[var(--pv-ink-45)]">{groupSubtitle(sorted)}</div>
        </div>
        <ChevronDown size={17} className={cn('text-[var(--pv-ink-45)] transition-transform duration-200', open ? 'rotate-180' : '')} aria-hidden="true" />
      </button>
      {open ? (
        <div>
          {sorted.map((listing) => (
            <ServiceMenuRow
              key={listing.listing_id || listing.id || listing.title}
              listing={listing}
              usdRate={usdRate}
              onRequest={onRequest}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
