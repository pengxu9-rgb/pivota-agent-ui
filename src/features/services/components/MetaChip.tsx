import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  icon: ReactNode;
  children: ReactNode;
  className?: string;
};

export function MetaChip({ icon, children, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-medium leading-none text-[var(--pv-ink-60)]',
        className,
      )}
    >
      <span className="inline-flex h-3.5 w-3.5 items-center justify-center" aria-hidden="true">
        {icon}
      </span>
      {children}
    </span>
  );
}
