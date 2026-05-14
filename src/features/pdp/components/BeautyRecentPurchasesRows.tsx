'use client';

import { useState } from 'react';

/**
 * Recent-purchases social-proof rows for the Beauty mobile PDP.
 * Faithful to redesign/pivota-pdp-extras.jsx → RecentPurchases:
 *   "Recent Purchases (N)" heading + "View all →" toggle, then rows of
 *   22px gradient avatar + "{user} bought {variant}" + relative time.
 *   Collapsed to 3 rows by default.
 */

export type BeautyPurchase = { user: string; variant: string; time: string };

export function BeautyRecentPurchasesRows({
  items,
  totalLabel,
}: {
  items: BeautyPurchase[];
  totalLabel?: string | number | null;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!items?.length) return null;
  const visible = expanded ? items : items.slice(0, 3);

  return (
    <div className="mt-[18px] px-3.5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-foreground">
          Recent Purchases{totalLabel != null ? ` (${totalLabel})` : ''}
        </h3>
        {items.length > 3 ? (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-[12px] font-medium text-muted-foreground"
          >
            {expanded ? 'Collapse' : 'View all →'}
          </button>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        {visible.map((p, i) => (
          <div key={`${p.user}-${i}`} className="flex items-center justify-between text-[12px]">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-[22px] w-[22px] flex-shrink-0 rounded-full"
                style={{ background: 'linear-gradient(135deg, #F472B6, #E11D48)' }}
              />
              <span className="text-muted-foreground">{p.user}</span>
              <span className="text-foreground">bought {p.variant}</span>
            </div>
            <span className="flex-shrink-0 text-muted-foreground">{p.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
