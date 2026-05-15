import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Editorial-redesign button.
 *
 *  - Pill radius (all sizes), 1px hairline on `ghost`.
 *  - `default` = ink-filled (primary CTA).
 *  - `accent` = terracotta — reserved for the dominant CTA on a screen
 *    (e.g. "Start with Aurora" on Cart). Use sparingly per the handoff.
 *  - `ghost` = transparent + hairline border, ink text.
 *
 *  Sizes follow the handoff: 32 / 44 / 52px tall.
 */
const button = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-full font-editorial-sans font-medium',
    'transition-colors transition-opacity',
    'disabled:opacity-50 disabled:pointer-events-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'bg-ink text-paper hover:bg-ink-2',
        accent: 'bg-terracotta text-paper hover:bg-terracotta-ink',
        ghost: 'border border-hairline bg-transparent text-ink hover:bg-paper-2',
      },
      size: {
        sm: 'h-8 px-4 text-[12px]',
        md: 'h-11 px-5 text-[13px]',
        lg: 'h-[52px] px-7 text-[14px]',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, size, className, asChild = false, type, ...rest }, ref) => {
    const Comp = (asChild ? Slot : 'button') as React.ElementType;
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : type || 'button'}
        className={cn(button({ variant, size }), className)}
        {...rest}
      />
    );
  },
);
Button.displayName = 'Button';

/**
 * Round 36px icon button. Hover surface is `hairline-2` so the icon is
 * the focus, not a chrome ring.
 */
const iconButton = cva(
  [
    'inline-flex items-center justify-center rounded-full text-ink transition-colors',
    'hover:bg-hairline-2 disabled:opacity-50 disabled:pointer-events-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
  ].join(' '),
  {
    variants: {
      size: {
        sm: 'h-8 w-8',
        md: 'h-9 w-9',
        lg: 'h-11 w-11',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButton> {
  /** Required for screen readers — icon buttons have no visible label. */
  label: string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size, className, label, type, children, ...rest }, ref) => (
    <button
      ref={ref}
      type={type || 'button'}
      aria-label={label}
      className={cn(iconButton({ size }), className)}
      {...rest}
    >
      {children}
    </button>
  ),
);
IconButton.displayName = 'IconButton';
