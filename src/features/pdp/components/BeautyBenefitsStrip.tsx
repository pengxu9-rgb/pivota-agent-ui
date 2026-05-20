'use client';

import type { ReactNode } from 'react';

/**
 * 4-up benefits strip for the Beauty mobile PDP.
 * Faithful to redesign/pivota-pdp.jsx → BenefitsStrip:
 *   teal-tinted (--accent-50 / #EAF7F3) rounded-xl bar, p-1, four flex-1 cells,
 *   each: 18px icon over a 10px semibold label, dark-teal (--accent-800).
 *
 * Prop-driven: accepts benefit labels (or {label, icon}) and infers an icon
 * when one isn't supplied. Renders nothing when there are no benefits.
 */

type BenefitInput = string | { label: string; icon?: 'drop' | 'sun' | 'leaf' | 'sprout' };

const DROP: ReactNode = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
  </svg>
);
const SUN: ReactNode = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);
const LEAF: ReactNode = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 9-9h6v6c0 5-4 10-8 10z" />
    <path d="M2 22l8-8" />
  </svg>
);
const SPROUT: ReactNode = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 22V11M7 11C7 7 4 4 1 4c0 4 3 7 6 7zM7 11c0-4 3-7 6-7 0 4-3 7-6 7zM12 22h2" />
  </svg>
);

const ICON_BY_KEY: Record<string, ReactNode> = { drop: DROP, sun: SUN, leaf: LEAF, sprout: SPROUT };

function inferIcon(label: string): ReactNode {
  const l = label.toLowerCase();
  if (/hydrat|moistur|dew|water|hyaluronic/.test(l)) return DROP;
  if (/spf|sun|uv|broad spectrum/.test(l)) return SUN;
  if (/vegan|clean|cruelty|plant|botanical/.test(l)) return SPROUT;
  return LEAF;
}

export function BeautyBenefitsStrip({ benefits }: { benefits: BenefitInput[] }) {
  if (!benefits?.length) return null;
  const items = benefits.slice(0, 4).map((b) => {
    if (typeof b === 'string') return { label: b, icon: inferIcon(b) };
    return { label: b.label, icon: b.icon ? ICON_BY_KEY[b.icon] ?? inferIcon(b.label) : inferIcon(b.label) };
  });

  return (
    <div className="mx-4 mt-2.5">
      <div className="flex gap-0 rounded-xl bg-[var(--accent-50)] p-1">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex flex-1 flex-col items-center gap-[5px] px-1 py-2.5 text-[color:var(--accent-800)]"
          >
            <span aria-hidden="true">{item.icon}</span>
            <div className="text-[10px] font-semibold tracking-[0.02em]">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
