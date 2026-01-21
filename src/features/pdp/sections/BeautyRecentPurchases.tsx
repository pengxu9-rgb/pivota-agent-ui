'use client';

export function BeautyRecentPurchases({
  items,
  showEmpty = false,
}: {
  items: Array<{ user_label: string; variant_label?: string; time_label?: string }>;
  showEmpty?: boolean;
}) {
  if (!items.length && !showEmpty) return null;

  return (
    <div className="mt-6 px-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Recent Purchases</h3>
        <button className="text-xs text-muted-foreground">View all →</button>
      </div>
      {items.length ? (
        <div className="space-y-2">
          {items.slice(0, 3).map((purchase, idx) => (
            <div key={`${purchase.user_label}-${idx}`} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-gradient-to-br from-pink-400 to-rose-500" />
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
