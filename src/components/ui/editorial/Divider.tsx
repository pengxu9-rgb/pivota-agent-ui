import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * 1px hairline divider — the editorial-redesign default separator.
 * `strong` swaps the colour to solid ink (used as the top-rule on stat
 * bands and merchant cards). `orientation="vertical"` for inline use.
 */
export function HairlineDivider({
  strong = false,
  orientation = 'horizontal',
  className,
}: {
  strong?: boolean;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        orientation === 'vertical' ? 'h-full w-px' : 'h-px w-full',
        strong ? 'bg-ink' : 'bg-hairline',
        className,
      )}
    />
  );
}
