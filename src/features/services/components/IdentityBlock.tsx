import { CreditCard, DoorOpen, Info, Train } from 'lucide-react';
import { EnglishBadge } from './EnglishBadge';
import { MetaChip } from './MetaChip';
import type { Provider } from '@/features/services/lib/types';

export function IdentityBlock({ provider }: { provider: Provider }) {
  const walkIn = provider.tourist_metadata.walk_in_accepted;

  return (
    <section className="bg-white px-4 py-5 md:px-0 md:py-0">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-[26px] font-medium leading-tight text-[var(--pv-ink)] md:text-[32px]">
            {provider.name}
          </h1>
          <div className="mt-1 text-[13px] font-medium text-[var(--pv-ink-60)]">
            {[provider.name_kr, provider.neighborhood].filter(Boolean).join(' · ')}
          </div>
        </div>
        <EnglishBadge state={provider.english_friendly_signal} size="md" className="mt-1 shrink-0" />
      </div>
      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2">
        {provider.tourist_metadata.nearest_station ? (
          <MetaChip icon={<Train size={13} />}>{provider.tourist_metadata.nearest_station}</MetaChip>
        ) : null}
        {walkIn !== 'unknown' ? (
          <MetaChip icon={<DoorOpen size={13} />}>{walkIn === 'true' ? 'Walk-ins OK' : 'By appt.'}</MetaChip>
        ) : null}
        {provider.tourist_metadata.accepts_card !== 'unknown' ? (
          <MetaChip icon={<CreditCard size={13} />}>Cards accepted</MetaChip>
        ) : null}
        <MetaChip icon={<Info size={13} />}>No tipping (KR norm)</MetaChip>
      </div>
      {provider.english_friendly_signal === 'explicit' && provider.english_friendly_evidence ? (
        <div className="mt-4 rounded-[var(--pv-radius-lg)] bg-[var(--pv-teal-bg)] px-3.5 py-3 text-[12px] font-medium leading-relaxed text-[var(--pv-teal-icon)]">
          {provider.english_friendly_evidence}
        </div>
      ) : null}
    </section>
  );
}
