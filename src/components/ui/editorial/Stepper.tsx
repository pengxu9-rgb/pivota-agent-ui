'use client';

import * as React from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Mono } from './Type';

/**
 * 4-step order tracker (Placed → Packed → Shipped → Delivered).
 *  - Steps before `current` render as filled ink dots.
 *  - The `current` step is filled + ringed.
 *  - Later steps are paper-2 with a hairline border.
 *  - The connecting line fills proportionally up to `current`.
 */
export function TrackStepper({
  steps,
  current,
  className,
}: {
  steps: string[];
  /** Zero-based index. */
  current: number;
  className?: string;
}) {
  if (!steps.length) return null;
  const clamped = Math.max(0, Math.min(steps.length - 1, current));
  const fillPct = steps.length > 1 ? (clamped / (steps.length - 1)) * 100 : 0;

  return (
    <div className={cn('flex w-full flex-col gap-2', className)}>
      <div className="relative">
        <div className="absolute left-2 right-2 top-1/2 h-px -translate-y-1/2 bg-hairline" />
        <div
          className="absolute left-2 top-1/2 h-px -translate-y-1/2 bg-ink"
          style={{ width: `calc((100% - 1rem) * ${fillPct / 100})` }}
        />
        <ol className="relative flex items-center justify-between">
          {steps.map((label, i) => {
            const passed = i < clamped;
            const isCurrent = i === clamped;
            return (
              <li
                key={label}
                aria-current={isCurrent ? 'step' : undefined}
                className="relative flex items-center justify-center"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex h-3 w-3 items-center justify-center rounded-full',
                    passed || isCurrent ? 'bg-ink' : 'border border-hairline bg-paper-2',
                    isCurrent &&
                      'ring-2 ring-ink ring-offset-2 ring-offset-paper',
                  )}
                />
              </li>
            );
          })}
        </ol>
      </div>
      <ol className="flex items-center justify-between">
        {steps.map((label, i) => (
          <li key={label} className="text-center">
            <Mono
              className={cn(
                'normal-case tracking-[0.06em]',
                i <= clamped ? 'text-ink' : 'text-ink-muted',
              )}
            >
              {label}
            </Mono>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Pill qty stepper — minus / number / plus. Controlled. Disables
 * decrement at `min` and increment at `max`.
 */
export function QtyStepper({
  value,
  onChange,
  min = 1,
  max,
  disabled = false,
  className,
  size = 'md',
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(typeof max === 'number' ? Math.min(max, value + 1) : value + 1);
  const decDisabled = disabled || value <= min;
  const incDisabled = disabled || (typeof max === 'number' && value >= max);

  const dim = size === 'sm' ? 'h-7 min-w-[22px]' : 'h-8 min-w-[26px]';

  return (
    <div
      className={cn(
        'inline-flex flex-shrink-0 items-center overflow-hidden rounded-full border border-hairline bg-surface',
        className,
      )}
    >
      <button
        type="button"
        onClick={dec}
        disabled={decDisabled}
        aria-label="Decrease quantity"
        className={cn(
          'flex items-center justify-center text-ink disabled:opacity-30',
          size === 'sm' ? 'h-7 w-7' : 'h-8 w-8',
        )}
      >
        <Minus size={14} strokeWidth={1.75} />
      </button>
      <div
        aria-live="polite"
        className={cn(
          'text-center font-editorial-sans text-[13px] font-medium text-ink',
          dim,
        )}
      >
        {value}
      </div>
      <button
        type="button"
        onClick={inc}
        disabled={incDisabled}
        aria-label="Increase quantity"
        className={cn(
          'flex items-center justify-center text-ink disabled:opacity-30',
          size === 'sm' ? 'h-7 w-7' : 'h-8 w-8',
        )}
      >
        <Plus size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}
