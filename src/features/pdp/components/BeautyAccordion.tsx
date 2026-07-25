'use client';

import { useId, useState } from 'react';

/**
 * Accordion row for the Beauty mobile PDP detail group.
 * Faithful to redesign/pivota-pdp.jsx → Accordion:
 *   1px bottom hairline, a full-width 16/18 padded header (14px semibold
 *   title + optional faint count) with a chevron that rotates 0→90° on
 *   open, and 0/18/16 padded content.
 *
 * The body is ALWAYS in the DOM and collapsed with the `hidden` attribute
 * rather than being conditionally mounted. It used to be `{open ? … : null}`,
 * which meant a closed section's text existed only in the client flight
 * payload — so a crawler fetching the SSR HTML saw the header and nothing
 * else. That silently withheld Description / Ingredients / How to use from
 * every non-JS reader (GPTBot, ClaudeBot, Googlebot's HTML pass): the
 * mixsoon Bean Essence PDP served 624 readable chars while holding 726
 * chars of description it never rendered.
 *
 * This is not cloaking — the markup a crawler receives is exactly the markup
 * a browser receives, and one click reveals it.
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
  const panelId = `${useId()}-panel`;
  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
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
      <div id={panelId} hidden={!open} className="px-4 pb-4">
        {children}
      </div>
    </div>
  );
}
