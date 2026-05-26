import { ArrowUpRight, MapPin } from 'lucide-react';
import type { Provider } from '@/features/services/lib/types';

export function AddressCard({ provider }: { provider: Provider }) {
  const query = encodeURIComponent(provider.address_kr || provider.address || provider.name);

  return (
    <section className="mx-4 rounded-[var(--pv-radius-lg)] border border-[var(--pv-border)] bg-white p-3 shadow-[var(--pv-shadow-sm)] md:mx-0">
      <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-3">
        <div className="relative h-[76px] overflow-hidden rounded-[var(--pv-radius-sm)] bg-[var(--pv-paper-muted)]">
          <div
            className="absolute inset-0 opacity-80"
            style={{
              backgroundImage:
                'linear-gradient(var(--pv-border) 1px, transparent 1px), linear-gradient(90deg, var(--pv-border) 1px, transparent 1px)',
              backgroundSize: '18px 18px',
            }}
          />
          <span className="absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--pv-coral)] text-white shadow-sm">
            <MapPin size={15} aria-hidden="true" />
          </span>
        </div>
        <div className="min-w-0 self-center">
          <div className="text-[12px] font-semibold text-[var(--pv-ink)]">{provider.name}</div>
          <div className="mt-1 text-[12px] leading-snug text-[var(--pv-ink-60)]">{provider.address_kr || provider.address}</div>
          <a
            href={`https://map.naver.com/v5/search/${query}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--pv-primary)]"
          >
            Open in Naver Map <ArrowUpRight size={12} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
