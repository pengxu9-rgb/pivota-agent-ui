import { cn } from '@/lib/utils';
import type { BookingStatus } from '@/features/services/lib/types';

const STATUS_META: Record<BookingStatus, { bg: string; fg: string; dot: string; label: string }> = {
  requested: {
    bg: 'var(--pv-tip-bg)',
    fg: 'var(--pv-tip-fg)',
    dot: '#C77F2A',
    label: 'Requested · awaiting reply',
  },
  confirmed: {
    bg: 'var(--pv-teal-bg)',
    fg: 'var(--pv-teal-icon)',
    dot: 'var(--pv-teal)',
    label: 'Confirmed',
  },
  declined: {
    bg: 'var(--pv-coral-bg)',
    fg: 'var(--pv-coral-icon)',
    dot: 'var(--pv-coral)',
    label: "Couldn't accommodate",
  },
  expired: {
    bg: 'var(--pv-paper-muted)',
    fg: 'var(--pv-ink-60)',
    dot: 'var(--pv-ink-45)',
    label: 'No response · try another',
  },
};

export function BookingStatusPill({ status, className }: { status: BookingStatus; className?: string }) {
  const meta = STATUS_META[status];

  return (
    <span
      className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold', className)}
      style={{ background: meta.bg, color: meta.fg }}
    >
      <span
        className={cn('h-2 w-2 rounded-full', status === 'requested' ? 'animate-pulse' : '')}
        style={{
          background: meta.dot,
          boxShadow: status === 'requested' ? '0 0 0 4px rgba(199,127,42,0.06)' : undefined,
        }}
        aria-hidden="true"
      />
      {meta.label}
    </span>
  );
}
