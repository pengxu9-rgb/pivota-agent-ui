import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Mono-uppercase pill, 28px tall. Used for filter chips, follow-up
 * prompt chips, "new" tags, etc. Default sits on the paper; `active` is
 * ink-filled; `accent` is the terracotta soft-fill.
 */
const chip = cva(
  [
    'inline-flex flex-shrink-0 items-center justify-center rounded-full px-3 py-1',
    'font-editorial-mono text-[10px] font-medium uppercase tracking-[0.12em]',
    'transition-colors disabled:opacity-50 disabled:pointer-events-none',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'border border-hairline bg-transparent text-ink-muted hover:border-ink/30 hover:text-ink',
        active: 'border border-transparent bg-ink text-paper',
        accent: 'border border-transparent bg-terracotta-bg text-terracotta-ink',
      },
      size: {
        sm: 'h-6 px-2.5 text-[9px]',
        md: 'h-7 px-3',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

export interface ChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof chip> {}

export const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ variant, size, className, type = 'button', ...rest }, ref) => (
    <button ref={ref} type={type} className={cn(chip({ variant, size }), className)} {...rest} />
  ),
);
Chip.displayName = 'Chip';

/**
 * Status pill (non-interactive by default). Sage = in-stock / shipped;
 * accent = terracotta highlight for "new"/promo states; default neutral.
 */
const pill = cva(
  [
    'inline-flex items-center justify-center rounded-full px-2 py-[3px]',
    'font-editorial-mono text-[9px] font-medium uppercase tracking-[0.08em]',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'bg-paper-2 text-ink-2',
        sage: 'bg-sage-bg text-sage',
        accent: 'bg-terracotta-bg text-terracotta-ink',
        /**
         * Promo / deal treatment — matches the editorial mock's badge
         * intent: white-translucent surface with ink text and a hairline
         * for definition. Reads on any product image without dominating
         * the card. (Earlier solid-terracotta brick was visually too loud.)
         */
        promo:
          'bg-white/95 text-ink border border-hairline backdrop-blur-sm',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface PillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pill> {}

export const Pill = React.forwardRef<HTMLSpanElement, PillProps>(
  ({ variant, className, ...rest }, ref) => (
    <span ref={ref} className={cn(pill({ variant }), className)} {...rest} />
  ),
);
Pill.displayName = 'Pill';
