import { useRef } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Grid3X3, Play } from 'lucide-react';
import type { MediaGalleryData } from '@/features/pdp/types';
import { cn } from '@/lib/utils';

export function MediaGallery({
  data,
  title,
  fallbackUrl,
  heroUrlOverride,
  activeIndex,
  onSelect,
  onOpenAll,
  onHeroSwipe,
  aspectClass = 'aspect-[6/5]',
  fit = 'object-cover',
}: {
  data?: MediaGalleryData | null;
  title: string;
  fallbackUrl?: string;
  heroUrlOverride?: string;
  activeIndex?: number;
  onSelect?: (index: number) => void;
  onOpenAll?: () => void;
  onHeroSwipe?: (payload: {
    fromIndex: number;
    toIndex: number;
    direction: 'prev' | 'next';
  }) => void;
  aspectClass?: string;
  fit?: 'object-cover' | 'object-contain';
}) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const items = data?.items || [];
  const clampedIndex =
    typeof activeIndex === 'number' && activeIndex >= 0 && activeIndex < items.length
      ? activeIndex
      : 0;
  const hero = items[clampedIndex];
  const heroUrl = heroUrlOverride || hero?.url || fallbackUrl;
  const isContain = fit === 'object-contain';

  const applyHeroSwipe = (direction: 'prev' | 'next') => {
    if (!items.length || !onSelect) return;
    const delta = direction === 'next' ? 1 : -1;
    const toIndex = Math.min(
      Math.max(clampedIndex + delta, 0),
      Math.max(items.length - 1, 0),
    );
    if (toIndex === clampedIndex) return;
    onSelect(toIndex);
    onHeroSwipe?.({
      fromIndex: clampedIndex,
      toIndex,
      direction,
    });
  };

  const canGoPrev = clampedIndex > 0;
  const canGoNext = clampedIndex < items.length - 1;

  return (
    <div className="lg:flex lg:flex-row lg:gap-3">
      {items.length > 1 ? (
        <div className="hidden lg:flex lg:flex-col lg:gap-2 lg:w-16 lg:shrink-0 lg:max-h-[500px] lg:overflow-y-auto lg:py-1 lg:scrollbar-thin">
          {items.map((item, idx) => (
            <button
              key={`dt-${item.url}-${idx}`}
              type="button"
              onClick={() => onSelect?.(idx)}
              className={cn(
                'relative h-16 w-16 rounded-lg overflow-hidden border-2 transition flex-shrink-0',
                idx === clampedIndex
                  ? 'border-primary ring-2 ring-primary/30'
                  : 'border-border hover:border-muted-foreground/50',
              )}
              aria-label={`Select media ${idx + 1}`}
            >
              <Image
                src={item.url}
                alt=""
                fill
                className="object-cover"
                sizes="64px"
              />
              {item.type === 'video' ? (
                <div className="absolute inset-0 flex items-center justify-center bg-foreground/20">
                  <Play className="h-3.5 w-3.5 text-white" fill="white" />
                </div>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="lg:flex-1 lg:min-w-0">
        <div className="relative">
          <div
            className={cn(
              'relative touch-pan-y lg:rounded-xl lg:overflow-hidden',
              aspectClass,
              'lg:aspect-square',
              isContain ? 'bg-muted/30' : 'bg-black/5',
            )}
            onTouchStart={(event) => {
              const touch = event.touches[0];
              if (!touch) return;
              touchStartRef.current = { x: touch.clientX, y: touch.clientY };
            }}
            onTouchEnd={(event) => {
              const start = touchStartRef.current;
              const touch = event.changedTouches[0];
              touchStartRef.current = null;
              if (!start || !touch || items.length <= 1) return;
              const deltaX = touch.clientX - start.x;
              const deltaY = touch.clientY - start.y;
              if (Math.abs(deltaX) < 36 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
              applyHeroSwipe(deltaX < 0 ? 'next' : 'prev');
            }}
          >
            {heroUrl ? (
              <Image
                src={heroUrl}
                alt={hero?.alt_text || title}
                fill
                className={fit}
                sizes="(max-width: 768px) 100vw, (max-width: 1024px) 100vw, 600px"
                priority
                fetchPriority="high"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                No media
              </div>
            )}
          </div>

          {items.length > 1 ? (
            <>
              <button
                type="button"
                onClick={() => applyHeroSwipe('prev')}
                disabled={!canGoPrev}
                className={cn(
                  'hidden lg:flex absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-full bg-white/90 border border-border shadow-sm transition-opacity',
                  canGoPrev ? 'opacity-100 hover:bg-white' : 'opacity-0 pointer-events-none',
                )}
                aria-label="Previous image"
              >
                <ChevronLeft className="h-5 w-5 text-foreground" />
              </button>
              <button
                type="button"
                onClick={() => applyHeroSwipe('next')}
                disabled={!canGoNext}
                className={cn(
                  'hidden lg:flex absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-full bg-white/90 border border-border shadow-sm transition-opacity',
                  canGoNext ? 'opacity-100 hover:bg-white' : 'opacity-0 pointer-events-none',
                )}
                aria-label="Next image"
              >
                <ChevronRight className="h-5 w-5 text-foreground" />
              </button>
            </>
          ) : null}

          {items.length ? (
            <div className="absolute top-3 right-3 rounded-full bg-foreground/60 px-2 py-0.5 text-[10px] text-white lg:hidden">
              {Math.min(clampedIndex + 1, items.length)}/{items.length}
            </div>
          ) : null}
        </div>

        {items.length ? (
          <div className="mt-2 px-3 overflow-x-auto lg:hidden">
            <div className="flex gap-2 pb-1">
              {items.slice(0, 5).map((item, idx) => (
                <button
                  key={`${item.url}-${idx}`}
                  type="button"
                  onClick={() => onSelect?.(idx)}
                  className={cn(
                    'relative h-12 w-12 rounded-md overflow-hidden border transition flex-shrink-0',
                    idx === clampedIndex ? 'border-primary ring-2 ring-primary/40' : 'border-border',
                  )}
                  aria-label={`View media ${idx + 1}`}
                >
                  <Image
                    src={item.url}
                    alt={item.alt_text || `Media ${idx + 1}`}
                    fill
                    className="object-cover"
                    sizes="48px"
                  />
                  {item.type === 'video' ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-foreground/20">
                      <Play className="h-3 w-3 text-white" fill="white" />
                    </div>
                  ) : null}
                </button>
              ))}
              {onOpenAll ? (
                <button
                  type="button"
                  onClick={() => onOpenAll()}
                  className="flex h-12 w-12 flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-border bg-muted/40 text-muted-foreground transition hover:bg-muted/60"
                  aria-label="View all media"
                >
                  <Grid3X3 className="h-4 w-4" />
                  <span className="text-[9px] leading-none">
                    {items.length > 5 ? `+${items.length - 5}` : 'All'}
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
