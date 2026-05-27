import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { EnglishBadge } from './EnglishBadge';
import { PhotoPlaceholder } from './PhotoPlaceholder';
import { SeoulPinTag } from './SeoulPinTag';
import { formatKRW, formatUSD } from '@/features/services/lib/format';
import { SVC_LABELS } from '@/features/services/lib/svc-labels';
import { getProviderId } from '@/features/services/lib/types';
import type { ServiceCardData } from '@/features/services/lib/types';

type Props = {
  service: ServiceCardData;
};

export function ServiceFeedCard({ service }: Props) {
  const { provider, listing } = service;
  const providerId = getProviderId(provider);
  const photo = provider.photos?.[0] || provider.photo || '';
  const isConsult = listing.requires_consult || listing.price_cents == null;
  const priceWon = listing.price_cents ?? 0;

  return (
    <Link
      href={`/services/${providerId}`}
      prefetch={false}
      className="group flex flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${provider.name} in ${provider.neighborhood}`}
    >
      <div
        className="relative aspect-square overflow-hidden rounded-md bg-[var(--pv-paper-muted)] transition-transform duration-300 group-hover:scale-[1.02]"
        style={{ transitionTimingFunction: 'cubic-bezier(.2,.7,.3,1)' }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
            style={{ transitionTimingFunction: 'cubic-bezier(.2,.7,.3,1)' }}
          />
        ) : (
          <PhotoPlaceholder
            service_type={listing.service_type}
            provider_initial={provider.name}
            className="h-full w-full"
          />
        )}
        <SeoulPinTag className="absolute left-2 top-2" />
        {provider.english_friendly_signal === 'explicit' ? (
          <EnglishBadge state="explicit" size="xs" className="absolute right-2 top-2 shadow-sm" />
        ) : null}
      </div>
      <div className="flex flex-1 flex-col pt-2 text-left">
        <div className="text-[9.5px] font-bold uppercase leading-none tracking-[0.09em] text-[var(--pv-ink-60)]">
          {SVC_LABELS[listing.service_type]}
        </div>
        <div className="mt-1 line-clamp-2 min-h-[2.6em] text-[12.5px] font-medium leading-[1.3] text-[var(--pv-ink)]">
          {provider.name}
          <span className="font-normal text-[var(--pv-ink-60)]"> · {provider.neighborhood}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          {isConsult ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pv-tip-bg)] px-[7px] py-[1px] text-[11px] font-semibold text-[var(--pv-tip-fg)]">
              <MessageCircle size={11} aria-hidden="true" />
              Consult
            </span>
          ) : (
            <>
              <span className="text-[13.5px] font-bold tabular-nums text-[var(--pv-ink)]">
                {formatKRW(priceWon)}
              </span>
              <span className="text-[10px] text-[var(--pv-ink-45)]">
                {formatUSD(priceWon, service.usdRate || provider.usd_per_won_rate)}
              </span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
