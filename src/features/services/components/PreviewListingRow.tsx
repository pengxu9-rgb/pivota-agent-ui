import { MessageCircle } from 'lucide-react';
import { formatDuration, formatKRW, formatUSD } from '@/features/services/lib/format';
import { SVC_LABELS } from '@/features/services/lib/svc-labels';
import type { ServiceListing } from '@/features/services/lib/types';

type Props = {
  listing: ServiceListing;
  usdRate?: number;
};

export function PreviewListingRow({ listing, usdRate }: Props) {
  const isConsult = listing.requires_consult || listing.price_cents == null;
  const priceWon = listing.price_cents ?? 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-[var(--pv-border)] py-2.5">
      <div className="min-w-0">
        <div className="truncate text-[12.5px] font-medium leading-snug text-[var(--pv-ink)]">{listing.title}</div>
        <div className="mt-0.5 text-[10.5px] text-[var(--pv-ink-45)]">
          {SVC_LABELS[listing.service_type]}
          {listing.duration_minutes ? ` · ${formatDuration(listing.duration_minutes)}` : ''}
        </div>
      </div>
      <div className="text-right">
        {isConsult ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pv-tip-bg)] px-2 py-1 text-[10px] font-semibold text-[var(--pv-tip-fg)]">
            <MessageCircle size={11} aria-hidden="true" />
            Consult
          </span>
        ) : (
          <>
            <div className="text-[14px] font-bold tabular-nums text-[var(--pv-ink)]">{formatKRW(priceWon)}</div>
            <div className="text-[10px] text-[var(--pv-ink-45)]">{formatUSD(priceWon, usdRate)}</div>
          </>
        )}
      </div>
    </div>
  );
}
