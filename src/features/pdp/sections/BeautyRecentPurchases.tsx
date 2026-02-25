'use client';

import { useEffect, useState } from 'react';

export function BeautyRecentPurchases({
  items,
  showEmpty = false,
}: {
  items: Array<{ user_label: string; variant_label?: string; time_label?: string }>;
  showEmpty?: boolean;
}) {
  const normalizedItems = Array.isArray(items)
    ? items.filter((item) => String(item?.user_label || '').trim())
    : [];
  const hasItems = normalizedItems.length > 0;

  const DEFAULT_VISIBLE = 3;
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setExpanded(false);
  }, [normalizedItems.length]);

  if (!hasItems && !showEmpty) return null;

  const displayItems = expanded ? normalizedItems : normalizedItems.slice(0, DEFAULT_VISIBLE);
  const displayCount = normalizedItems.length;
  const canToggle = normalizedItems.length > DEFAULT_VISIBLE;

  return (
    <div className="mt-4 px-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Recent Purchases ({displayCount})</h3>
        {canToggle ? (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {expanded ? 'Collapse' : 'View all →'}
          </button>
        ) : null}
      </div>
      {hasItems ? (
        <div className="space-y-1">
          {displayItems.map((purchase, idx) => (
            <div key={`${purchase.user_label}-${idx}`} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-full bg-gradient-to-br from-pink-400 to-rose-500" />
                <span className="text-muted-foreground">{purchase.user_label}</span>
                {purchase.variant_label ? <span>bought {purchase.variant_label}</span> : null}
              </div>
              {purchase.time_label ? (
                <span className="text-xs text-muted-foreground">{purchase.time_label}</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card px-3 py-3 text-xs text-muted-foreground">
          No recent activity yet.
        </div>
      )}
    </div>
  );
}
