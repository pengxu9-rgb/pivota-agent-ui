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
 * still post the first photo. An empty collection shows an explicit empty
 * state and the "Add your picture" action, without a fake count or filler.
 */

import type { MediaItem } from '../types';
import { dedupeCustomerMedia, customerMediaSourceLabel } from '../state/customerMedia';

const TILE = 90;

export function BeautyCustomerPhotos({
  photos,
  totalLabel,
  onViewAll,
  onShare,
  onPhotoClick,
  addLabel = 'Add your picture',
}: {
  photos: MediaItem[];
  totalLabel?: string | number | null;
  onViewAll?: () => void;
  onShare?: () => void;
  onPhotoClick?: (index: number) => void;
  addLabel?: string;
}) {
  const available = dedupeCustomerMedia(photos || []);
  const tiles = available.slice(0, 8);
  const parsedTotal = totalLabel == null ? null : Number(totalLabel);
  const total = parsedTotal != null && Number.isInteger(parsedTotal) && parsedTotal >= available.length ? parsedTotal : null;
  const overflow = Math.max(0, available.length - tiles.length);

  return (
    <section className="mt-3.5">
      <div className="mb-2.5 flex items-baseline justify-between px-4">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Customer photos
          </span>
          {available.length > 0 ? (
            <span className="text-[11px] font-medium text-muted-foreground tabular-nums">· {total == null ? `${available.length} available` : total}</span>
          ) : null}
        </div>
        {tiles.length > 1 ? <span className="text-[11px] font-medium text-muted-foreground">swipe →</span> : null}
      </div>

      <div
        className="flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{
          scrollSnapType: 'x proximity',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {tiles.map((item, i) => (
          <button
            key={`${item.url}-${i}`}
            type="button"
            onClick={() => onPhotoClick?.(i)}
            aria-label={`${customerMediaSourceLabel(item)} ${i + 1}`}
            data-media-role={item.role || item.source_kind}
            className="relative flex-shrink-0 overflow-hidden rounded-md bg-[var(--paper-muted,#F4F4F2)]"
            style={{ width: TILE, height: TILE, scrollSnapAlign: 'start' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {item.type === 'video' ? (
              <video src={item.url} poster={item.thumbnail_url} muted preload="metadata" className="h-full w-full object-cover" />
            ) : <img src={item.thumbnail_url || item.url} alt={item.alt_text || ''} loading="lazy" className="h-full w-full object-cover" />}
          </button>
        ))}
        {overflow > 0 ? (
          <button
            type="button"
            onClick={onViewAll}
            aria-label={`View ${available.length} available customer photos`}
            className="flex flex-shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border bg-[var(--paper,#FAFAF8)] text-muted-foreground"
            style={{ width: TILE, height: TILE, scrollSnapAlign: 'start' }}
          >
            <div className="text-[18px] font-light leading-none tabular-nums">+{overflow}</div>
            <div className="text-[10px] font-semibold tracking-[0.02em]">View all</div>
          </button>
        ) : null}
      </div>

      {!available.length ? <p className="px-4 text-[13px] text-muted-foreground">No customer photos available yet.</p> : null}
      <div className="mt-2.5 flex gap-2 px-4">
        {onViewAll && available.length > 0 ? (
          <button
            type="button"
            onClick={onViewAll}
            className="flex-1 rounded-lg border border-border bg-white px-3 py-2.5 text-[12px] font-semibold text-foreground"
          >
            View {available.length} available {available.length === 1 ? 'photo' : 'photos'}
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
