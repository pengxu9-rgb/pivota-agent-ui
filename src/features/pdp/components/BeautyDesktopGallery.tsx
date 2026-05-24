'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

function clampImageIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}

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

  const selectIndex = (nextIndex: number) => {
    setIdx(clampImageIndex(nextIndex, images.length));
  };
  const canGoPrev = idx > 0;
  const canGoNext = idx < images.length - 1;

  return (
    <div
      className="relative isolate overflow-hidden rounded-2xl border border-border"
      style={{ background: 'linear-gradient(180deg, #F5EFE7 0%, #ECE2D3 100%)' }}
    >
      {/* Left thumbnail strip — only shown when there are multiple images */}
      {images.length > 1 ? (
        <div
          data-testid="beauty-desktop-thumbnail-rail"
          className="absolute inset-y-3 left-3 z-20 flex w-16 flex-col gap-1.5 overflow-y-auto rounded-xl bg-white/65 p-1.5 shadow-sm backdrop-blur-md [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {images.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() => selectIndex(i)}
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

      {/* Main image — fixed stage, intrinsic image preserved inside it. */}
      <div
        className="relative min-h-[480px] overflow-hidden lg:max-h-[calc(100vh-132px)]"
        style={{ aspectRatio: '1 / 1' }}
      >
        <button
          type="button"
          onClick={() => onOpenViewer?.(idx)}
          className={cn('absolute inset-0 block', images.length > 1 && idx > 0 ? 'left-[76px]' : '')}
          aria-label={`View image ${idx + 1} of ${images.length}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[idx]}
            alt={alt}
            loading="eager"
            className={cn(
              'h-full w-full object-contain object-center transition-transform duration-200',
              idx === 0 ? 'scale-[1.08]' : 'scale-100',
            )}
          />
        </button>

        {/* Counter chip */}
        <div className="absolute bottom-3 right-3 z-30 rounded-full bg-[rgba(20,20,20,0.55)] px-[9px] py-1 text-[11px] font-semibold text-white tabular-nums backdrop-blur-sm">
          {idx + 1} / {images.length}
        </div>
      </div>

      {images.length > 1 ? (
        <>
          <button
            type="button"
            onClick={() => selectIndex(idx - 1)}
            disabled={!canGoPrev}
            aria-label="Previous image"
            className={cn(
              'absolute left-[92px] top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/90 text-foreground shadow-lg backdrop-blur-md transition-all duration-150',
              canGoPrev
                ? 'opacity-100 hover:scale-105 hover:bg-white'
                : 'pointer-events-none opacity-0',
            )}
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={() => selectIndex(idx + 1)}
            disabled={!canGoNext}
            aria-label="Next image"
            className={cn(
              'absolute right-4 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/90 text-foreground shadow-lg backdrop-blur-md transition-all duration-150',
              canGoNext
                ? 'opacity-100 hover:scale-105 hover:bg-white'
                : 'pointer-events-none opacity-0',
            )}
          >
            <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </>
      ) : null}
    </div>
  );
}
