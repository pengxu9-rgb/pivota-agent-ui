'use client';

import { useRef, useState } from 'react';

/**
 * Full-bleed swipe gallery for the Beauty mobile PDP.
 * Faithful to redesign/pivota-pdp.jsx → Gallery:
 *   cream vertical-gradient backdrop, horizontal scroll-snap strip, a
 *   bottom-right "{i} / {n}" blurred counter chip, and a centered dot
 *   indicator (the active dot is an elongated pill).
 *
 * Aspect ratio is 4/3 rather than the design's near-square 20/21 so more
 * of the product info sits above the fold on first paint (owner request).
 */
export function BeautyMobileGallery({
  images,
  alt,
  onOpenViewer,
}: {
  images: string[];
  alt: string;
  onOpenViewer?: (index: number) => void;
}) {
  const [idx, setIdx] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);
  if (!images.length) return null;

  return (
    <div
      className="relative"
      style={{ background: 'linear-gradient(180deg, #F5EFE7 0%, #ECE2D3 100%)' }}
    >
      <div
        ref={ref}
        onScroll={(e) => {
          const w = e.currentTarget.clientWidth || 1;
          setIdx(Math.round(e.currentTarget.scrollLeft / w));
        }}
        className="flex w-full snap-x snap-mandatory overflow-x-auto aspect-[4/3] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((src, i) => (
          <button
            key={`${src}-${i}`}
            type="button"
            onClick={() => onOpenViewer?.(i)}
            className="relative block shrink-0 basis-full snap-start"
            aria-label={`View image ${i + 1} of ${images.length}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={i === 0 ? alt : ''} loading={i === 0 ? 'eager' : 'lazy'} className="block h-full w-full object-cover" />
          </button>
        ))}
      </div>

      {/* Counter chip — bottom-right */}
      <div className="absolute bottom-3.5 right-3.5 rounded-full bg-[rgba(20,20,20,0.55)] px-2 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
        {Math.min(idx + 1, images.length)} / {images.length}
      </div>

      {/* Dot indicator — centered, active dot elongates */}
      {images.length > 1 ? (
        <div className="absolute bottom-3.5 left-1/2 flex -translate-x-1/2 gap-[5px]">
          {images.map((_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="h-[5px] rounded-full transition-all duration-200"
              style={{
                width: i === idx ? 16 : 5,
                background: i === idx ? 'hsl(var(--foreground))' : 'rgba(20,20,20,0.3)',
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
