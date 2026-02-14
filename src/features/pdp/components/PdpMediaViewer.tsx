'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Grid3X3, Play, X } from 'lucide-react';
import type { MediaItem } from '@/features/pdp/types';
import { cn } from '@/lib/utils';

type ViewerMode = 'official' | 'ugc';
type SwipeDirection = 'next' | 'prev';

const SWIPE_THRESHOLD_PX = 36;

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.floor(index), 0), length - 1);
}

export function PdpMediaViewer({
  isOpen,
  initialIndex,
  officialItems,
  ugcItems,
  defaultMode,
  onClose,
  onSwipe,
  onCloseWithState,
  onOpenGrid,
  onIndexChange,
  officialSource = 'official',
  ugcSource = 'ugc',
}: {
  isOpen: boolean;
  initialIndex: number;
  officialItems: MediaItem[];
  ugcItems: MediaItem[];
  defaultMode: ViewerMode;
  onClose: () => void;
  onSwipe?: (payload: {
    mode: ViewerMode;
    source: string;
    fromIndex: number;
    toIndex: number;
    direction: SwipeDirection;
  }) => void;
  onCloseWithState?: (payload: { mode: ViewerMode; source: string; index: number }) => void;
  onOpenGrid?: (payload: { mode: ViewerMode; source: string }) => void;
  onIndexChange?: (payload: { mode: ViewerMode; index: number }) => void;
  officialSource?: string;
  ugcSource?: string;
}) {
  const [mode, setMode] = useState<ViewerMode>(defaultMode);
  const [officialIndex, setOfficialIndex] = useState(0);
  const [ugcIndex, setUgcIndex] = useState(0);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const ugcScrollRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const ugcIndexRef = useRef(0);
  const programmaticUgcScrollRef = useRef(false);

  const sourceByMode = useMemo(
    () => ({ official: officialSource, ugc: ugcSource }),
    [officialSource, ugcSource],
  );

  const activeItems = mode === 'official' ? officialItems : ugcItems;
  const activeIndex = mode === 'official' ? officialIndex : ugcIndex;

  const setOfficialIndexTracked = useCallback(
    (nextIndex: number, direction: SwipeDirection) => {
      setOfficialIndex((prev) => {
        const clamped = clampIndex(nextIndex, officialItems.length);
        if (clamped === prev) return prev;
        onSwipe?.({
          mode: 'official',
          source: sourceByMode.official,
          fromIndex: prev,
          toIndex: clamped,
          direction,
        });
        onIndexChange?.({ mode: 'official', index: clamped });
        return clamped;
      });
    },
    [officialItems.length, onIndexChange, onSwipe, sourceByMode.official],
  );

  const scrollToUgcIndex = useCallback((nextIndex: number, behavior: ScrollBehavior) => {
    const container = ugcScrollRef.current;
    if (!container) return;
    const height = container.clientHeight || window.innerHeight || 1;
    const top = clampIndex(nextIndex, ugcItems.length) * height;
    programmaticUgcScrollRef.current = true;
    try {
      container.scrollTo({ top, behavior });
    } catch {
      container.scrollTop = top;
    }
    window.setTimeout(() => {
      programmaticUgcScrollRef.current = false;
    }, 220);
  }, [ugcItems.length]);

  const setUgcIndexTracked = useCallback(
    (nextIndex: number, direction: SwipeDirection) => {
      setUgcIndex((prev) => {
        const clamped = clampIndex(nextIndex, ugcItems.length);
        if (clamped === prev) return prev;
        onSwipe?.({
          mode: 'ugc',
          source: sourceByMode.ugc,
          fromIndex: prev,
          toIndex: clamped,
          direction,
        });
        onIndexChange?.({ mode: 'ugc', index: clamped });
        return clamped;
      });
    },
    [onIndexChange, onSwipe, sourceByMode.ugc, ugcItems.length],
  );

  useEffect(() => {
    ugcIndexRef.current = ugcIndex;
  }, [ugcIndex]);

  useEffect(() => {
    if (!isOpen) return;
    setMode(defaultMode);
    setChromeVisible(true);
    setShowGrid(false);

    setOfficialIndex((prev) =>
      defaultMode === 'official'
        ? clampIndex(initialIndex, officialItems.length)
        : clampIndex(prev, officialItems.length),
    );
    setUgcIndex((prev) =>
      defaultMode === 'ugc'
        ? clampIndex(initialIndex, ugcItems.length)
        : clampIndex(prev, ugcItems.length),
    );
  }, [
    defaultMode,
    initialIndex,
    isOpen,
    officialItems.length,
    ugcItems.length,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    if (typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;

    try {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
    } catch {
      // ignore measurement failures
    }

    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (mode !== 'ugc') return;
    const raf = window.requestAnimationFrame(() => {
      scrollToUgcIndex(ugcIndexRef.current, 'auto');
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isOpen, mode, scrollToUgcIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const closeBtn = closeButtonRef.current;
    closeBtn?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseWithState?.({
          mode,
          source: sourceByMode[mode],
          index: activeIndex,
        });
        onClose();
        return;
      }

      if (mode === 'official') {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          setOfficialIndexTracked(officialIndex + 1, 'next');
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          setOfficialIndexTracked(officialIndex - 1, 'prev');
        }
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const next = clampIndex(ugcIndex + 1, ugcItems.length);
        if (next !== ugcIndex) {
          setUgcIndexTracked(next, 'next');
          scrollToUgcIndex(next, 'smooth');
        }
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        const next = clampIndex(ugcIndex - 1, ugcItems.length);
        if (next !== ugcIndex) {
          setUgcIndexTracked(next, 'prev');
          scrollToUgcIndex(next, 'smooth');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    activeIndex,
    isOpen,
    mode,
    officialIndex,
    onClose,
    onCloseWithState,
    scrollToUgcIndex,
    setOfficialIndexTracked,
    setUgcIndexTracked,
    sourceByMode,
    ugcIndex,
    ugcItems.length,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const preloadItems = activeItems;
    if (!preloadItems.length) return;
    const indices = [activeIndex - 1, activeIndex, activeIndex + 1]
      .map((idx) => clampIndex(idx, preloadItems.length))
      .filter((idx, i, arr) => arr.indexOf(idx) === i);

    indices.forEach((idx) => {
      const src = preloadItems[idx]?.url;
      if (!src) return;
      const img = new window.Image();
      img.src = src;
    });
  }, [activeIndex, activeItems, isOpen]);

  const closeViewer = () => {
    onCloseWithState?.({
      mode,
      source: sourceByMode[mode],
      index: activeIndex,
    });
    onClose();
  };

  const renderImage = (item: MediaItem, imageAlt: string, sizes = '100vw') => (
    <>
      <Image src={item.url} alt={imageAlt} fill className="object-contain" sizes={sizes} loading="lazy" />
      {item.type === 'video' ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/25">
          <Play className="h-10 w-10 text-white drop-shadow-lg" fill="white" fillOpacity={0.35} />
        </div>
      ) : null}
    </>
  );

  const officialContent = officialItems.length ? (
    <div className="relative h-full w-full">
      <div
        className="absolute inset-0"
        onTouchStart={(event) => {
          const touch = event.touches[0];
          if (!touch) return;
          touchStartRef.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={(event) => {
          const start = touchStartRef.current;
          const touch = event.changedTouches[0];
          touchStartRef.current = null;
          if (!start || !touch) return;
          const deltaX = touch.clientX - start.x;
          const deltaY = touch.clientY - start.y;
          if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaX) <= Math.abs(deltaY)) return;
          if (deltaX < 0) {
            setOfficialIndexTracked(officialIndex + 1, 'next');
          } else {
            setOfficialIndexTracked(officialIndex - 1, 'prev');
          }
        }}
      />

      <button
        type="button"
        className="absolute inset-0 z-[1]"
        onClick={() => setChromeVisible((prev) => !prev)}
        aria-label="Toggle viewer controls"
      />

      <div className="absolute inset-0">
        {renderImage(
          officialItems[officialIndex],
          officialItems[officialIndex]?.alt_text || `Official media ${officialIndex + 1}`,
          '100vw',
        )}
      </div>

      {chromeVisible ? (
        <>
          <button
            type="button"
            aria-label="Previous official media"
            onClick={() => setOfficialIndexTracked(officialIndex - 1, 'prev')}
            className={cn(
              'absolute left-3 top-1/2 z-[2] hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-black/60 md:flex',
              officialIndex <= 0 ? 'pointer-events-none opacity-30' : 'opacity-100',
            )}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Next official media"
            onClick={() => setOfficialIndexTracked(officialIndex + 1, 'next')}
            className={cn(
              'absolute right-3 top-1/2 z-[2] hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-black/60 md:flex',
              officialIndex >= officialItems.length - 1 ? 'pointer-events-none opacity-30' : 'opacity-100',
            )}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      ) : null}
    </div>
  ) : (
    <div className="flex h-full items-center justify-center text-sm text-white/80">No official media</div>
  );

  const ugcContent = ugcItems.length ? (
    <div
      ref={ugcScrollRef}
      data-testid="ugc-scroll-container"
      className="h-full w-full overflow-y-auto overscroll-contain snap-y snap-mandatory"
      onScroll={(event) => {
        const container = event.currentTarget;
        const height = container.clientHeight || 1;
        const next = clampIndex(Math.round(container.scrollTop / height), ugcItems.length);
        const prev = ugcIndexRef.current;
        if (next === prev) return;
        ugcIndexRef.current = next;
        setUgcIndex(next);
        onIndexChange?.({ mode: 'ugc', index: next });
        if (!programmaticUgcScrollRef.current) {
          onSwipe?.({
            mode: 'ugc',
            source: sourceByMode.ugc,
            fromIndex: prev,
            toIndex: next,
            direction: next > prev ? 'next' : 'prev',
          });
        }
      }}
    >
      {ugcItems.map((item, idx) => (
        <div key={`${item.url}-${idx}`} className="relative h-[100dvh] w-full snap-start bg-black">
          <button
            type="button"
            className="absolute inset-0 z-[1]"
            onClick={() => setChromeVisible((prev) => !prev)}
            aria-label="Toggle viewer controls"
          />
          <div className="absolute inset-0">
            {renderImage(item, item.alt_text || `Buyer media ${idx + 1}`)}
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div className="flex h-full items-center justify-center text-sm text-white/80">No buyer media</div>
  );

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[2147483647] bg-black text-white">
      <div className="relative h-full w-full">
        {mode === 'official' ? officialContent : ugcContent}

        {chromeVisible ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[3]">
            <div className="pointer-events-auto mx-auto flex w-full max-w-3xl items-center gap-2 bg-gradient-to-b from-black/80 to-transparent px-3 pb-4 pt-4">
              <div className="flex items-center rounded-full bg-black/35 p-1">
                <button
                  type="button"
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-semibold transition',
                    mode === 'official' ? 'bg-white text-black' : 'text-white/85',
                  )}
                  onClick={() => setMode('official')}
                >
                  Official
                </button>
                <button
                  type="button"
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-semibold transition',
                    mode === 'ugc' ? 'bg-white text-black' : 'text-white/85',
                  )}
                  onClick={() => setMode('ugc')}
                >
                  Buyer Show
                </button>
              </div>

              <span data-testid="viewer-counter" className="ml-1 text-xs text-white/90">
                {activeItems.length ? `${activeIndex + 1}/${activeItems.length}` : '0/0'}
              </span>

              <button
                type="button"
                className="ml-auto flex h-8 items-center gap-1 rounded-full bg-black/45 px-3 text-xs text-white transition hover:bg-black/60"
                onClick={() => {
                  setShowGrid(true);
                  onOpenGrid?.({ mode, source: sourceByMode[mode] });
                }}
                aria-label="Open grid"
              >
                <Grid3X3 className="h-3.5 w-3.5" />
                <span>Grid</span>
              </button>

              <button
                ref={closeButtonRef}
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-black/45 transition hover:bg-black/60"
                onClick={closeViewer}
                aria-label="Close viewer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}

        {showGrid ? (
          <>
            <button
              type="button"
              className="absolute inset-0 z-[4] bg-black/50"
              onClick={() => setShowGrid(false)}
              aria-label="Close grid panel"
            />
            <div className="absolute bottom-0 left-0 right-0 z-[5] h-[62vh] rounded-t-2xl border border-white/10 bg-zinc-950/95 px-4 pb-4 pt-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold">
                  {mode === 'official' ? 'Official media' : 'Buyer media'} ({activeItems.length})
                </div>
                <button
                  type="button"
                  onClick={() => setShowGrid(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10"
                  aria-label="Close grid"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="h-[calc(62vh-72px)] overflow-y-auto">
                <div className="grid grid-cols-3 gap-2">
                  {activeItems.map((item, idx) => (
                    <button
                      type="button"
                      key={`${item.url}-grid-${idx}`}
                      className={cn(
                        'relative aspect-square overflow-hidden rounded-lg border transition',
                        idx === activeIndex
                          ? 'border-white ring-2 ring-white/40'
                          : 'border-white/20 hover:border-white/60',
                      )}
                      onClick={() => {
                        if (mode === 'official') {
                          setOfficialIndex(idx);
                          onIndexChange?.({ mode: 'official', index: idx });
                        } else {
                          setUgcIndex(idx);
                          onIndexChange?.({ mode: 'ugc', index: idx });
                          scrollToUgcIndex(idx, 'auto');
                        }
                        setShowGrid(false);
                      }}
                      aria-label={`Open ${mode} media ${idx + 1}`}
                      >
                      <Image
                        src={item.url}
                        alt={item.alt_text || ''}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 33vw, 220px"
                      />
                      {item.type === 'video' ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                          <Play className="h-6 w-6 text-white" fill="white" fillOpacity={0.35} />
                        </div>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
