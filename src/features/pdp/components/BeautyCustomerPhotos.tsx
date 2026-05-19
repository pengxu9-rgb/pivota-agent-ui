'use client';

/**
 * Customer photos (UGC) strip for the Beauty mobile PDP — Brand Kit v2.0.
 *
 * Handoff §3g: swipe + tap. The strip is a horizontal scroll-snap row of
 * 90×90 tappable photo buttons that opens an existing lightbox/UGC route.
 * After the last photo a dashed "+N View all" peek tile invites the user
 * to drill in. The "See all" + "Add your picture" actions sit BELOW the
 * strip (read first, act second — handoff §3f).
 *
 * Renders unconditionally so a shopper on a freshly-launched product can
 * still post the first photo — the strip collapses to just the +N tile +
 * the "Add your picture" outline button when no photos exist yet.
 */

const TILE = 90;

function asCount(value: string | number | null | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function BeautyCustomerPhotos({
  photos,
  totalLabel,
  onViewAll,
  onShare,
  onPhotoClick,
  addLabel = 'Add your picture',
}: {
  photos: string[];
  totalLabel?: string | number | null;
  onViewAll?: () => void;
  onShare?: () => void;
  onPhotoClick?: (index: number) => void;
  addLabel?: string;
}) {
  const tiles = photos?.slice(0, 8) ?? [];
  const total = asCount(totalLabel, tiles.length);
  const overflow = Math.max(0, total - tiles.length);

  return (
    <section className="mt-3.5">
      <div className="mb-2.5 flex items-baseline justify-between px-4">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Customer photos
          </span>
          {total > 0 ? (
            <span className="text-[11px] font-medium text-muted-foreground tabular-nums">· {total}</span>
          ) : null}
        </div>
        {onShare ? (
          <button
            type="button"
            onClick={onShare}
            className="text-[11px] font-semibold text-primary"
          >
            + Add your photo
          </button>
        ) : null}
      </div>

      <div
        className="flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{
          scrollSnapType: 'x proximity',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {tiles.map((src, i) => (
          <button
            key={`${src}-${i}`}
            type="button"
            onClick={() => onPhotoClick?.(i)}
            aria-label={`Customer photo ${i + 1}`}
            className="relative flex-shrink-0 overflow-hidden rounded-md bg-[var(--paper-muted,#F4F4F2)]"
            style={{ width: TILE, height: TILE, scrollSnapAlign: 'start' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
          </button>
        ))}
        {overflow > 0 || tiles.length === 0 ? (
          <button
            type="button"
            onClick={onViewAll || onShare}
            aria-label={overflow > 0 ? `View all ${total} photos` : addLabel}
            className="flex flex-shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border bg-[var(--paper,#FAFAF8)] text-muted-foreground"
            style={{ width: TILE, height: TILE, scrollSnapAlign: 'start' }}
          >
            {overflow > 0 ? (
              <>
                <div className="text-[18px] font-light leading-none tabular-nums">+{overflow}</div>
                <div className="text-[10px] font-semibold tracking-[0.02em]">View all</div>
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <div className="text-[10px] font-semibold tracking-[0.02em]">Add yours</div>
              </>
            )}
          </button>
        ) : null}
      </div>

      <div className="mt-2.5 flex gap-2 px-4">
        {onViewAll ? (
          <button
            type="button"
            onClick={onViewAll}
            className="flex-1 rounded-lg border border-border bg-white px-3 py-2.5 text-[12px] font-semibold text-foreground"
          >
            See all {total > 0 ? `${total} photos` : 'photos'}
          </button>
        ) : null}
        {onShare ? (
          <button
            type="button"
            onClick={onShare}
            className="flex-1 rounded-lg border border-border bg-transparent px-3 py-2.5 text-[12px] font-semibold text-foreground"
          >
            {addLabel}
          </button>
        ) : null}
      </div>
    </section>
  );
}
