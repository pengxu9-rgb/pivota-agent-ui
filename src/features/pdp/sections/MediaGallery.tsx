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

  return (
    <div className="relative">
      <div className={`relative ${aspectClass} bg-black/5`}>
        {heroUrl ? (
          <Image src={heroUrl} alt={hero?.alt_text || title} fill className={fit} unoptimized />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            No media
          </div>
        )}
      </div>
      {items.length ? (
        <div className="absolute top-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white">
          {Math.min(clampedIndex + 1, items.length)}/{items.length}
        </div>
      ) : null}
      {items.length ? (
        <div className="absolute bottom-2 left-2 right-2 flex gap-2 overflow-x-auto">
          {items.slice(0, 6).map((item, idx) => (
            <button
              key={`${item.url}-${idx}`}
              type="button"
              onClick={() => onSelect?.(idx)}
              className={cn(
                'relative h-10 w-10 rounded-lg overflow-hidden ring-1 transition',
                idx === clampedIndex ? 'ring-white/80' : 'ring-white/30 hover:ring-white/60',
              )}
            >
              <Image src={item.url} alt={item.alt_text || `Media ${idx + 1}`} fill className="object-cover" unoptimized />
              {item.type === 'video' ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Play className="h-3 w-3 text-white" fill="white" />
                </div>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
