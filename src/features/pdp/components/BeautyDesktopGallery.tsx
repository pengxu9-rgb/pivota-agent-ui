'use client';

import { useState } from 'react';

/**
 * Desktop gallery for the Beauty PDP.
 * Layout: vertical thumbnail strip on the left, large main image on the right.
 * Clicking a thumbnail swaps the main image. Clicking the main image opens the
 * fullscreen viewer. Active thumbnail is highlighted with a foreground ring.
 */
export function BeautyDesktopGallery({
  images,
  alt,
  onOpenViewer,
}: {
  images: string[];
  alt: string;
  onOpenViewer?: (index: number) => void;
}) {
  const [idx, setIdx] = useState(0);
  if (!images.length) return null;

  return (
    <div
      className="flex gap-0 overflow-hidden rounded-2xl border border-border"
      style={{ background: 'linear-gradient(180deg, #F5EFE7 0%, #ECE2D3 100%)' }}
    >
      {/* Left thumbnail strip — only shown when there are multiple images */}
      {images.length > 1 ? (
        <div
          className="flex flex-col gap-1.5 overflow-y-auto p-2.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{ width: 76 }}
        >
          {images.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Select image ${i + 1}`}
              aria-current={i === idx ? 'true' : undefined}
              className="flex-shrink-0 overflow-hidden rounded-lg transition-all duration-150"
              style={{
                width: 56,
                height: 70,
                outline: i === idx ? '1.5px solid hsl(var(--foreground))' : '1.5px solid transparent',
                outlineOffset: 1,
                opacity: i === idx ? 1 : 0.5,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}

      {/* Main image — fills remaining space, portrait 4/5 ratio */}
      <button
        type="button"
        onClick={() => onOpenViewer?.(idx)}
        className="relative flex-1 overflow-hidden"
        style={{ aspectRatio: '4 / 5' }}
        aria-label={`View image ${idx + 1} of ${images.length}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[idx]}
          alt={alt}
          loading="eager"
          className="h-full w-full object-cover transition-opacity duration-200"
        />
        {/* Counter chip */}
        <div className="absolute bottom-3 right-3 rounded-full bg-[rgba(20,20,20,0.55)] px-[9px] py-1 text-[11px] font-semibold text-white tabular-nums backdrop-blur-sm">
          {idx + 1} / {images.length}
        </div>
      </button>
    </div>
  );
}
