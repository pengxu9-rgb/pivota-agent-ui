import { formatKST, formatKRW, formatUSD } from '@/features/services/lib/format';
import type { BookingDraftState } from '@/features/services/lib/use-booking-draft';
import type { Provider, ServiceListing } from '@/features/services/lib/types';

type Props = {
  draft: BookingDraftState;
  provider: Provider;
  listing: ServiceListing;
  usdRate?: number;
};

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 border-t border-[var(--pv-border)] py-2.5 text-[12px]">
      <div className="font-semibold text-[var(--pv-ink-45)]">{label}</div>
      <div className="min-w-0 text-[var(--pv-ink)]">{children}</div>
    </div>
  );
}

export function BookingStepReview({ draft, provider, listing, usdRate }: Props) {
  const isConsult = listing.requires_consult || listing.price_cents == null;
  const priceWon = listing.price_cents ?? 0;
  const preferred = draft.preferred.date && draft.preferred.time
    ? `${draft.preferred.date} · ${formatKST(draft.preferred.time)}`
    : 'Not selected';
  const contact = [draft.contact.email, draft.contact.phone].filter(Boolean).join(' · ') || 'Missing contact';

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--pv-radius-lg)] border border-[var(--pv-border)] bg-white px-4 py-2">
        <ReviewRow label="Provider">{provider.name} · {provider.neighborhood}</ReviewRow>
        <ReviewRow label="Service">
          <div className="font-semibold">{listing.title}</div>
          <div className="mt-0.5 text-[11px] text-[var(--pv-ink-45)]">
            {isConsult ? 'Consult required' : `${formatKRW(priceWon)} ${formatUSD(priceWon, usdRate)}`}
          </div>
        </ReviewRow>
        <ReviewRow label="Preferred">{preferred}</ReviewRow>
        <ReviewRow label="Alternates">
          {draft.alternates.length
            ? draft.alternates.map((slot) => `${slot.date} · ${formatKST(slot.time)}`).join(', ')
            : 'None added'}
        </ReviewRow>
        <ReviewRow label="Contact">{contact}</ReviewRow>
        <ReviewRow label="Notes">{draft.notes?.trim() || 'No notes'}</ReviewRow>
      </div>

      <div className="rounded-[var(--pv-radius-lg)] bg-[var(--pv-tip-bg)] px-4 py-3 text-[12px] leading-relaxed text-[var(--pv-tip-fg)]">
        <div className="font-semibold">What happens next</div>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>Pivota sends your request via KakaoTalk.</li>
          <li>The provider has a 24h reply window.</li>
          <li>Your request expires or confirms.</li>
          <li>Pivota notifies you at the contact above.</li>
        </ol>
      </div>
    </div>
  );
}
