import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Editorial-redesign type primitives. Wraps the `pv-*` utility classes
 * from globals.css so pages compose with components instead of raw
 * strings.
 */

type AsProp<E extends React.ElementType> = { as?: E };
type WithChildren = { children: React.ReactNode };

/** pv-label preceded by an 18px ink rule — section/card lead marker. */
export function Eyebrow({ children, className }: WithChildren & { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span aria-hidden="true" className="h-px w-[18px] bg-ink" />
      <span className="pv-label">{children}</span>
    </div>
  );
}

/** pv-label only — for inline microlabels / mono tags. */
export function Mono({
  children,
  className,
  ...rest
}: WithChildren & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn('pv-label', className)} {...rest}>
      {children}
    </span>
  );
}

/**
 * Page H1 / hero. Newsreader 400, scales 40–80px. Passing `size` pins
 * the font-size in px and matches the optical-size axis.
 */
export function DisplayHeading<E extends React.ElementType = 'h1'>({
  children,
  as,
  size,
  className,
  ...rest
}: AsProp<E> &
  WithChildren & {
    size?: number;
    className?: string;
  } & Omit<React.ComponentPropsWithoutRef<E>, 'children' | 'className'>) {
  const Comp = (as || 'h1') as React.ElementType;
  const style = size
    ? { fontSize: `${size}px`, fontVariationSettings: `"opsz" ${size}` }
    : undefined;
  return (
    <Comp className={cn('pv-display', className)} style={style} {...rest}>
      {children}
    </Comp>
  );
}

/** Section H2 / AI greeting. Newsreader 400, scales 24–40px. */
export function Headline<E extends React.ElementType = 'h2'>({
  children,
  as,
  size,
  className,
  ...rest
}: AsProp<E> &
  WithChildren & {
    size?: number;
    className?: string;
  } & Omit<React.ComponentPropsWithoutRef<E>, 'children' | 'className'>) {
  const Comp = (as || 'h2') as React.ElementType;
  const style = size
    ? { fontSize: `${size}px`, fontVariationSettings: `"opsz" ${size}` }
    : undefined;
  return (
    <Comp className={cn('pv-headline', className)} style={style} {...rest}>
      {children}
    </Comp>
  );
}

/** Product titles / card heads. Newsreader 400, scales 14–22px. */
export function Title<E extends React.ElementType = 'h3'>({
  children,
  as,
  size,
  className,
  ...rest
}: AsProp<E> &
  WithChildren & {
    size?: number;
    className?: string;
  } & Omit<React.ComponentPropsWithoutRef<E>, 'children' | 'className'>) {
  const Comp = (as || 'h3') as React.ElementType;
  const style = size
    ? { fontSize: `${size}px`, fontVariationSettings: `"opsz" ${size}` }
    : undefined;
  return (
    <Comp className={cn('pv-title', className)} style={style} {...rest}>
      {children}
    </Comp>
  );
}

/**
 * Tabular numerics — prices, stats, order IDs. Newsreader with
 * tnum + lnum. Optional `$`/currency prefix is rendered inline so the
 * digits stay tabular-aligned across stacked rows.
 */
export function Num({
  value,
  prefix,
  className,
  size,
  ...rest
}: {
  value: React.ReactNode;
  prefix?: React.ReactNode;
  className?: string;
  size?: number;
} & React.HTMLAttributes<HTMLSpanElement>) {
  const style = size ? { fontSize: `${size}px` } : undefined;
  return (
    <span className={cn('pv-num inline-flex items-baseline', className)} style={style} {...rest}>
      {prefix != null ? <span className="pv-num">{prefix}</span> : null}
      <span className="pv-num">{value}</span>
    </span>
  );
}
