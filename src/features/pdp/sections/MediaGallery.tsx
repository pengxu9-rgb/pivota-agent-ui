import Image from 'next/image';
import { Play } from 'lucide-react';
import type { MediaGalleryData } from '@/features/pdp/types';
import { cn } from '@/lib/utils';

export function MediaGallery({
  data,
  title,
  fallbackUrl,
  activeIndex,
  onSelect,
  aspectClass = 'aspect-[6/5]',
  fit = 'object-cover',
}: {
  data?: MediaGalleryData | null;
  title: string;
  fallbackUrl?: string;
  activeIndex?: number;
  onSelect?: (index: number) => void;
  aspectClass?: string;
  fit?: 'object-cover' | 'object-contain';
}) {
  const items = data?.items || [];
  const clampedIndex =
    typeof activeIndex === 'number' && activeIndex >= 0 && activeIndex < items.length
      ? activeIndex
      : 0;
  const hero = items[clampedIndex];
  const heroUrl = hero?.url || fallbackUrl;
  const isContain = fit === 'object-contain';

  return (
    <div className="relative">
      <div className={cn('relative', aspectClass, isContain ? 'bg-muted/30' : 'bg-black/5')}>
        {heroUrl ? (
          <Image src={heroUrl} alt={hero?.alt_text || title} fill className={fit} unoptimized />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            No media
          </div>
        )}
      </div>
      {items.length ? (
        <div className="absolute top-3 right-3 rounded-full bg-foreground/60 px-2 py-0.5 text-[10px] text-white">
          {Math.min(clampedIndex + 1, items.length)}/{items.length}
        </div>
      ) : null}
      {items.length ? (
        <div className="absolute bottom-3 left-3 right-3 flex gap-1.5">
          {items.slice(0, 4).map((item, idx) => (
            <button
              key={`${item.url}-${idx}`}
              type="button"
              onClick={() => onSelect?.(idx)}
              className={cn(
                'relative h-12 w-12 rounded-md overflow-hidden ring-2 transition',
                idx === clampedIndex ? 'ring-white' : 'ring-transparent',
              )}
            >
              <Image
                src={item.url}
                alt={item.alt_text || `Media ${idx + 1}`}
                fill
                className="object-cover"
                unoptimized
              />
              {item.type === 'video' ? (
                <div className="absolute inset-0 flex items-center justify-center bg-foreground/30">
                  <Play className="h-3 w-3 text-white" fill="white" />
                </div>
              ) : null}
            </button>
          ))}
          {items.length > 4 ? (
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-foreground/60 text-white text-xs font-medium">
              +{items.length - 4}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
