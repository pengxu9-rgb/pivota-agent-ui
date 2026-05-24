'use client';

import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

function clampImageIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}

/**
 * Full-bleed swipe gallery for the Beauty mobile PDP.
 * Faithful to redesign/pivota-pdp.jsx → Gallery:
 *   cream vertical-gradient backdrop, horizontal scroll-snap strip, a
 *   bottom-right "{i} / {n}" blurred counter chip, and a centered dot
 *   indicator (the active dot is an elongated pill).
 *
 * Mobile keeps the portrait swipe stage. Desktop shells reuse this component
 * as a primary PDP image module, so the stage becomes square to keep square
 * and tall merchant assets visually comparable without shrinking the product.
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

  const goToIndex = (nextIndex: number) => {
    const clamped = clampImageIndex(nextIndex, images.length);
    setIdx(clamped);

    const container = ref.current;
    if (!container) return;
    const left = clamped * (container.clientWidth || 1);
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ left, behavior: 'smooth' });
    } else {
      container.scrollLeft = left;
    }
  };

  const canGoPrev = idx > 0;
  const canGoNext = idx < images.length - 1;

  return (
    <div
      className="relative overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #F5EFE7 0%, #ECE2D3 100%)' }}
    >
      <div
        ref={ref}
        onScroll={(e) => {
          const w = e.currentTarget.clientWidth || 1;
          setIdx(clampImageIndex(Math.round(e.currentTarget.scrollLeft / w), images.length));
        }}
        className="flex w-full snap-x snap-mandatory overflow-x-auto aspect-[4/5] lg:aspect-square lg:min-h-[480px] lg:max-h-[calc(100vh-132px)] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
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
            <img
              src={src}
              alt={i === 0 ? alt : ''}
              loading={i === 0 ? 'eager' : 'lazy'}
              className={cn(
                'block h-full w-full object-contain object-center transition-transform duration-200',
                i === 0 ? 'lg:scale-[1.08]' : 'lg:scale-100',
              )}
            />
          </button>
        ))}
      </div>

      {images.length > 1 ? (
        <>
          <button
            type="button"
            onClick={() => goToIndex(idx - 1)}
            disabled={!canGoPrev}
            aria-label="Previous image"
            className={cn(
              'absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/90 text-foreground shadow-lg backdrop-blur-sm transition-all duration-150 lg:flex',
              canGoPrev
                ? 'opacity-100 hover:scale-105 hover:bg-white'
                : 'pointer-events-none opacity-0',
            )}
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={() => goToIndex(idx + 1)}
            disabled={!canGoNext}
            aria-label="Next image"
            className={cn(
              'absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/90 text-foreground shadow-lg backdrop-blur-sm transition-all duration-150 lg:flex',
              canGoNext
                ? 'opacity-100 hover:scale-105 hover:bg-white'
                : 'pointer-events-none opacity-0',
            )}
          >
            <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </>
      ) : null}

      {/* Counter chip — bottom-right, glass + tabular nums (handoff §3c) */}
      <div className="absolute bottom-3 right-3 rounded-full bg-[rgba(20,20,20,0.55)] px-[9px] py-1 text-[11px] font-semibold text-white tabular-nums backdrop-blur-sm">
        {Math.min(idx + 1, images.length)} / {images.length}
      </div>

      {/* Dot indicator — centered, active dot widens to 18px (handoff §3c) */}
      {images.length > 1 ? (
        <div className="absolute bottom-3.5 left-1/2 flex -translate-x-1/2 gap-1">
          {images.map((_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="h-[5px] rounded-full transition-all duration-200"
              style={{
                width: i === idx ? 18 : 5,
                background: i === idx ? 'hsl(var(--foreground))' : 'rgba(20,20,20,0.28)',
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
