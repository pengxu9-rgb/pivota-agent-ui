'use client';

/**
 * Customer photos (UGC) grid for the Beauty mobile PDP.
 *
 * Two behaviour changes vs the original:
 *  1) Renders even when `photos` is empty — so a shopper on a freshly-
 *     launched product can still add the first photo from the PDP.
 *  2) The first tile is always the "+ Add your photo" upload affordance,
 *     in front of any existing photos. Clicking it fires `onShare` (the
 *     same handler that the old text "Share yours +" link used).
 *
 * Visuals otherwise faithful to redesign/pivota-pdp-extras.jsx →
 * CustomerPhotos: "Customer Photos (N)" heading + "View all" action,
 * 3-column gap-1 grid of square photo tiles, rounded as a group.
 */

export function BeautyCustomerPhotos({
  photos,
  totalLabel,
  onViewAll,
  onShare,
  onPhotoClick,
  addLabel = 'Add your photo',
}: {
  photos: string[];
  totalLabel?: string | number | null;
  onViewAll?: () => void;
  onShare?: () => void;
  onPhotoClick?: (index: number) => void;
  addLabel?: string;
}) {
  const tiles = photos?.slice(0, 8) ?? [];
  const isEmpty = tiles.length === 0;

  return (
    <div className="mt-2.5 px-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-foreground">
          Customer Photos{totalLabel != null ? ` (${totalLabel})` : ''}
        </h3>
        {onViewAll && !isEmpty ? (
          <button
            type="button"
            onClick={onViewAll}
            className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
          >
            View all →
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-1 overflow-hidden rounded-xl">
        {/* Always-on "Add your photo" upload tile, in front of any existing photos.
            Wired to the existing onShare handler so we don't need a new prop. */}
        <button
          type="button"
          onClick={onShare}
          aria-label={addLabel}
          className="relative flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border-[1.5px] border-dashed border-primary bg-primary/10 p-2 text-primary"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-primary bg-white text-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </span>
          <span className="text-center text-[11px] font-semibold leading-tight text-primary">
            {addLabel}
          </span>
        </button>
        {tiles.map((src, i) => (
          <button
            key={`${src}-${i}`}
            type="button"
            onClick={() => onPhotoClick?.(i)}
            className="relative aspect-square overflow-hidden bg-[#F4F4F2]"
            aria-label={`Customer photo ${i + 1}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
