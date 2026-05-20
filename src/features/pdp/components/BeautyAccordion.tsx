'use client';

import { useState } from 'react';

/**
 * Accordion row for the Beauty mobile PDP detail group.
 * Faithful to redesign/pivota-pdp.jsx → Accordion:
 *   1px bottom hairline, a full-width 16/18 padded header (14px semibold
 *   title + optional faint count) with a chevron that rotates 0→90° on
 *   open, and 0/18/16 padded content.
 */
export function BeautyAccordion({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: string | number | null;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-4"
      >
        <span className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
          {title}
          {count != null ? (
            <span className="text-[12px] font-medium text-[hsl(0_0%_60%)]">({count})</span>
          ) : null}
        </span>
        <span
          aria-hidden="true"
          className="text-muted-foreground transition-transform duration-200"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
      </button>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </div>
  );
}
