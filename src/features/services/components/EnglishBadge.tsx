import { Check, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EnglishFriendlySignal } from '@/features/services/lib/types';

type Props = {
  state: EnglishFriendlySignal;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
};

const SIZE_CLASSES = {
  xs: 'gap-1.5 px-[7px] py-[3px] text-[11px]',
  sm: 'gap-1.5 px-2 py-1 text-[12px]',
  md: 'gap-2 px-2.5 py-1.5 text-[13px]',
};

const ICON_SIZE = {
  xs: 12,
  sm: 13,
  md: 14,
};

export function EnglishBadge({ state, size = 'sm', className }: Props) {
  if (state === 'unknown') return null;

  const explicit = state === 'explicit';
  const Icon = explicit ? Check : Globe;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-semibold leading-none',
        SIZE_CLASSES[size],
        explicit
          ? 'bg-[var(--pv-teal-bg)] text-[var(--pv-teal-icon)]'
          : 'border border-dashed border-[var(--pv-border-strong)] bg-transparent text-[var(--pv-ink-60)]',
        className,
      )}
    >
      <Icon size={ICON_SIZE[size]} strokeWidth={2.3} aria-hidden="true" />
      {explicit ? 'English-friendly' : 'English likely'}
    </span>
  );
}
