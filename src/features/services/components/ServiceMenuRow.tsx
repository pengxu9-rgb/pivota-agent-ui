import { MessageCircle } from 'lucide-react';
import { formatDuration, formatKRW, formatUSD } from '@/features/services/lib/format';
import { SVC_LABELS } from '@/features/services/lib/svc-labels';
import type { ServiceListing } from '@/features/services/lib/types';

type Props = {
  listing: ServiceListing;
  usdRate?: number;
  onRequest?: (listing: ServiceListing) => void;
};

export function ServiceMenuRow({ listing, usdRate, onRequest }: Props) {
  const isConsult = listing.requires_consult || listing.price_cents == null;
  const priceWon = listing.price_cents ?? 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-t border-[var(--pv-border)] px-4 py-4">
      <div className="min-w-0">
        <div className="text-[14px] font-semibold leading-snug text-[var(--pv-ink)]">{listing.title}</div>
        <div className="mt-1 text-[11px] text-[var(--pv-ink-45)]">
          {SVC_LABELS[listing.service_type]}
          {listing.duration_minutes ? ` · ${formatDuration(listing.duration_minutes)}` : ''}
        </div>
        <div className="mt-2">
          {isConsult ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pv-tip-bg)] px-2 py-1 text-[11px] font-semibold text-[var(--pv-tip-fg)]">
              <MessageCircle size={12} aria-hidden="true" />
              Consult
            </span>
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="text-[15px] font-bold tabular-nums text-[var(--pv-ink)]">{formatKRW(priceWon)}</span>
              <span className="text-[11px] text-[var(--pv-ink-45)]">{formatUSD(priceWon, usdRate)}</span>
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onRequest?.(listing)}
        className={
          isConsult
            ? 'self-center rounded-full border border-[var(--pv-ink)] px-3 py-2 text-[11.5px] font-semibold text-[var(--pv-ink)]'
            : 'self-center rounded-full bg-[var(--pv-ink)] px-3 py-2 text-[11.5px] font-semibold text-white'
        }
      >
        {isConsult ? 'Request consultation' : 'Request booking'}
      </button>
    </div>
  );
}
