import Link from 'next/link';
import { CreditCard, DoorOpen, Info, Train } from 'lucide-react';
import { EnglishBadge } from './EnglishBadge';
import { MetaChip } from './MetaChip';
import { PhotoPlaceholder } from './PhotoPlaceholder';
import { PreviewListingRow } from './PreviewListingRow';
import { SVC_LABELS } from '@/features/services/lib/svc-labels';
import { getProviderId, getProviderListings } from '@/features/services/lib/types';
import type { Provider, ServiceListing } from '@/features/services/lib/types';

function sortListings(listings: ServiceListing[]): ServiceListing[] {
  return [...listings].sort((left, right) => {
    const leftConsult = left.requires_consult || left.price_cents == null;
    const rightConsult = right.requires_consult || right.price_cents == null;
    if (leftConsult !== rightConsult) return leftConsult ? 1 : -1;
    return (left.price_cents ?? Number.POSITIVE_INFINITY) - (right.price_cents ?? Number.POSITIVE_INFINITY);
  });
}

export function BrowseProviderCard({ provider, usdRate }: { provider: Provider; usdRate?: number }) {
  const providerId = getProviderId(provider);
  const listings = getProviderListings(provider);
  const preview = provider.preview_listings?.length ? provider.preview_listings : sortListings(listings).slice(0, 3);
  const primaryType = listings[0]?.service_type || 'facial';
  const photo = provider.photos?.[0] || provider.photo || '';
  const offeredTypes = Array.from(new Set(listings.map((listing) => listing.service_type))).slice(0, 4);
  const moreCount = Math.max(0, (provider.matching_listings_count || listings.length) - preview.length);
  const walkIn = provider.tourist_metadata.walk_in_accepted;

  return (
    <article className="overflow-hidden rounded-[var(--pv-radius-lg)] border border-[var(--pv-border)] bg-white shadow-[var(--pv-shadow-sm)]">
      <div className="relative h-[140px] overflow-hidden bg-[var(--pv-paper-muted)] md:h-[180px]">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <PhotoPlaceholder
            service_type={primaryType}
            provider_initial={provider.name}
            className="h-full w-full"
          />
        )}
        <EnglishBadge state={provider.english_friendly_signal} size="xs" className="absolute left-2.5 top-2.5 shadow-sm" />
        <span className="absolute bottom-2.5 right-2.5 rounded-full bg-[rgba(20,20,20,0.5)] px-2 py-1 text-[10.5px] font-semibold text-white backdrop-blur-md">
          No tipping
        </span>
      </div>
      <div className="p-4">
        <div className="text-[15px] font-semibold leading-tight text-[var(--pv-ink)]">{provider.name}</div>
        <div className="mt-1 text-[11px] text-[var(--pv-ink-45)]">
          {[provider.name_kr, provider.neighborhood].filter(Boolean).join(' · ')}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2">
          {provider.tourist_metadata.nearest_station ? (
            <MetaChip icon={<Train size={13} />}>{provider.tourist_metadata.nearest_station}</MetaChip>
          ) : null}
          {walkIn !== 'unknown' ? (
            <MetaChip icon={<DoorOpen size={13} />}>{walkIn === 'true' ? 'Walk-ins OK' : 'By appt.'}</MetaChip>
          ) : null}
          {provider.tourist_metadata.accepts_card !== 'unknown' ? (
            <MetaChip icon={<CreditCard size={13} />}>Cards OK</MetaChip>
          ) : null}
          <MetaChip icon={<Info size={13} />}>No tipping</MetaChip>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {offeredTypes.map((serviceType) => (
            <span
              key={serviceType}
              className="rounded-full border border-[var(--pv-border)] bg-[var(--pv-paper-muted)] px-2 py-1 text-[10.5px] font-medium text-[var(--pv-ink-60)]"
            >
              {SVC_LABELS[serviceType]}
            </span>
          ))}
        </div>
        <div className="mt-3">
          {preview.map((listing) => (
            <PreviewListingRow key={listing.listing_id || listing.id || listing.title} listing={listing} usdRate={usdRate || provider.usd_per_won_rate} />
          ))}
        </div>
        {moreCount > 0 ? <div className="mt-1 text-[11px] text-[var(--pv-ink-45)]">+{moreCount} more services</div> : null}
        <Link
          href={`/services/${providerId}`}
          className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-full bg-[var(--pv-ink)] px-4 text-[12px] font-semibold text-white"
        >
          View provider →
        </Link>
      </div>
    </article>
  );
}
