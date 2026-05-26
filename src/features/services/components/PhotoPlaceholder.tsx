import { cn } from '@/lib/utils';
import { SVC_LABELS } from '@/features/services/lib/svc-labels';
import { SVC_PALETTE } from '@/features/services/lib/svc-palette';
import type { ServiceType } from '@/features/services/lib/types';

type Props = {
  service_type: ServiceType;
  provider_initial?: string;
  className?: string;
};

export function PhotoPlaceholder({ service_type, provider_initial, className }: Props) {
  const palette = SVC_PALETTE[service_type];

  return (
    <div
      className={cn('relative isolate overflow-hidden bg-[var(--pv-paper-muted)]', className)}
      style={{
        backgroundImage: `radial-gradient(circle at 82% 86%, rgba(255,255,255,0.34), transparent 34%), linear-gradient(155deg, ${palette[0]}, ${palette[1]})`,
      }}
    >
      <div
        className="absolute left-3 top-3 font-serif text-[11px] font-medium uppercase leading-none tracking-[0.08em] opacity-85"
        style={{ color: palette[2] }}
      >
        {SVC_LABELS[service_type]}
      </div>
      {provider_initial ? (
        <div
          className="absolute bottom-[-0.18em] right-3 font-serif text-[82px] font-medium leading-none opacity-15"
          style={{ color: palette[2] }}
          aria-hidden="true"
        >
          {provider_initial.slice(0, 1).toUpperCase()}
        </div>
      ) : null}
    </div>
  );
}
