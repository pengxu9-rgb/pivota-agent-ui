import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDuration, formatKST, formatKRW, formatUSD } from '@/features/services/lib/format';
import type { BookingStatus, Provider, ServiceListing, SlotChoice } from '@/features/services/lib/types';

type Props = {
  provider: Provider;
  listing: ServiceListing;
  preferred: SlotChoice;
  status?: BookingStatus;
  dim?: boolean;
  usdRate?: number;
};

function formatSlot(slot: SlotChoice): string {
  if (!slot?.date || !slot?.time) return 'Time pending';
  return `${slot.date} · ${formatKST(slot.time)}`;
}

export function BookingItineraryCard({ provider, listing, preferred, status, dim, usdRate }: Props) {
  const priceWon = listing.price_cents ?? 0;
  const isConsult = listing.requires_consult || listing.price_cents == null;

  return (
    <section className={cn('relative rounded-[var(--pv-radius-lg)] border border-[var(--pv-border)] bg-white p-4 shadow-[var(--pv-shadow-sm)]', dim ? 'opacity-55' : '')}>
      {status === 'expired' ? (
        <span className="absolute right-4 top-4 rounded-full bg-[var(--pv-paper-muted)] px-2 py-1 text-[10px] font-semibold text-[var(--pv-ink-60)]">
          Expired
        </span>
      ) : null}
      <div className="grid grid-cols-[34px_1fr] gap-3">
        <div className="flex flex-col items-center pt-1">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--pv-ink)]" />
          <span className="my-1 h-14 w-px bg-[var(--pv-border-strong)]" />
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--pv-coral)] text-white">
            <MapPin size={12} aria-hidden="true" />
          </span>
        </div>
        <div className="grid gap-3 text-[13px]">
          <div className="grid grid-cols-[78px_1fr] gap-3">
            <div className="font-semibold text-[var(--pv-ink-45)]">When</div>
            <div className="font-semibold text-[var(--pv-ink)]">{formatSlot(preferred)}</div>
          </div>
          <div className="grid grid-cols-[78px_1fr] gap-3">
            <div className="font-semibold text-[var(--pv-ink-45)]">Service</div>
            <div className="text-[var(--pv-ink)]">
              <div className="font-semibold">{listing.title}</div>
              <div className="mt-0.5 text-[11px] text-[var(--pv-ink-45)]">
                {listing.duration_minutes ? `${formatDuration(listing.duration_minutes)} · ` : ''}
                {isConsult ? 'Consult required' : `${formatKRW(priceWon)} ${formatUSD(priceWon, usdRate)}`}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-[78px_1fr] gap-3">
            <div className="font-semibold text-[var(--pv-ink-45)]">Where</div>
            <div className="text-[var(--pv-ink)]">
              <div className="font-semibold">{provider.name}</div>
              <div className="mt-0.5 text-[11px] text-[var(--pv-ink-45)]">{provider.neighborhood} · {provider.address}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
