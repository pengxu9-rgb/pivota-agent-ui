import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * "Why this" insight block — the signature editorial pattern.
 * 1.5px terracotta left rule, `surface-2` background, `pv-label` lead
 * (defaults to "Why this") followed by body copy. Used for AI reasoning
 * after recommendations and as a generic explainer surface.
 */
export function InsightBlock({
  label = 'Why this',
  children,
  className,
}: {
  label?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border-l-[1.5px] border-terracotta bg-surface-2 px-4 py-3',
        className,
      )}
    >
      <div className="pv-label" style={{ color: 'var(--terracotta-ink)' }}>
        {label}
      </div>
      <div className="pv-body mt-1.5">{children}</div>
    </div>
  );
}
