'use client';

/**
 * Customer photos (UGC) grid for the Beauty mobile PDP.
 * Faithful to redesign/pivota-pdp-extras.jsx → CustomerPhotos:
 *   "Customer Photos (N)" heading + "View all" / "Share yours +" actions,
 *   then a 3-column gap-1 grid of square photo tiles, rounded as a group.
 */

export function BeautyCustomerPhotos({
  photos,
  totalLabel,
  onViewAll,
  onShare,
  onPhotoClick,
}: {
  photos: string[];
  totalLabel?: string | number | null;
  onViewAll?: () => void;
  onShare?: () => void;
  onPhotoClick?: (index: number) => void;
}) {
  if (!photos?.length) return null;
  const tiles = photos.slice(0, 9);

  return (
    <div className="mt-4 px-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-foreground">
          Customer Photos{totalLabel != null ? ` (${totalLabel})` : ''}
        </h3>
        <div className="flex items-center gap-3">
          {onViewAll ? (
            <button type="button" onClick={onViewAll} className="text-[12px] font-medium text-muted-foreground">
              View all
            </button>
          ) : null}
          {onShare ? (
            <button type="button" onClick={onShare} className="text-[12px] font-medium text-primary">
              Share yours +
            </button>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 overflow-hidden rounded-xl">
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
