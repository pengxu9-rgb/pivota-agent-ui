import * as React from 'react';
import { cn } from '@/lib/utils';
import { Mono, Headline } from './Type';
import { Pill } from './Chip';

/**
 * Cart / brand merchant strip:
 * italic-serif monogram circle · house name · meta line · count pill.
 * `monogram` defaults to the first letter of `name` if not supplied.
 */
export function MerchantHeader({
  name,
  monogram,
  meta,
  itemCount,
  className,
}: {
  name: string;
  monogram?: string;
  meta?: React.ReactNode;
  itemCount?: number;
  className?: string;
}) {
  const initials = (monogram || name.charAt(0)).slice(0, 2).toUpperCase();

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span
        aria-hidden="true"
        className={cn(
          'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full',
          'border border-hairline bg-paper-2 font-editorial-serif italic text-ink',
        )}
      >
        {initials}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Headline as="div" size={15} className="leading-tight">
          {name}
        </Headline>
        {meta ? <Mono className="text-ink-muted normal-case tracking-[0.04em]">{meta}</Mono> : null}
      </div>
      {typeof itemCount === 'number' ? (
        <Pill className="flex-shrink-0">
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </Pill>
      ) : null}
    </div>
  );
}
