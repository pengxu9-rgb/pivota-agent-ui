'use client';

import type { ReactNode } from 'react';

type Benefit = { label: string; icon?: ReactNode };

const DROP = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
  </svg>
);

const SUN = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

const LEAF = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 9-9h6v6c0 5-4 10-8 10z" />
    <path d="M2 22l8-8" />
  </svg>
);

const SPARK = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6L12 2z" />
  </svg>
);

const ICON_FOR = (label: string): ReactNode => {
  const lower = label.toLowerCase();
  if (/hydrat|moistur|water|dew/.test(lower)) return DROP;
  if (/spf|sun|uv/.test(lower)) return SUN;
  if (/vegan|clean|natural|mineral|plant|botanical/.test(lower)) return LEAF;
  return SPARK;
};

export function BeautyBenefitsStrip({ benefits }: { benefits: string[] | Benefit[] }) {
  if (!benefits?.length) return null;
  const normalized: Benefit[] = (benefits as Array<string | Benefit>).slice(0, 4).map((b) =>
    typeof b === 'string' ? { label: b, icon: ICON_FOR(b) } : { ...b, icon: b.icon ?? ICON_FOR(b.label) },
  );

  return (
    <div className="mx-2.5 mt-4 sm:mx-3 lg:mx-0">
      <div className="flex gap-0 rounded-xl bg-primary/10 p-1">
        {normalized.map((b) => (
          <div
            key={b.label}
            className="flex flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[color:var(--accent-800)]"
          >
            <span aria-hidden="true" className="text-[color:var(--accent-700)]">
              {b.icon}
            </span>
            <div className="text-[10px] font-semibold tracking-[0.02em] text-[color:var(--accent-800)]">
              {b.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
