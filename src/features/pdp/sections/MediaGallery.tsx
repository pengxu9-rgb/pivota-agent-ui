import Image from 'next/image';
import { Play } from 'lucide-react';
import type { MediaGalleryData } from '@/features/pdp/types';
import { cn } from '@/lib/utils';

export function MediaGallery({
  data,
  title,
  fallbackUrl,
  aspectClass = 'aspect-[6/5]',
  fit = 'object-cover',
}: {
  data?: MediaGalleryData | null;
  title: string;
  fallbackUrl?: string;
  aspectClass?: string;
  fit?: 'object-cover' | 'object-contain';
}) {
  const items = data?.items || [];
  const hero = items[0];
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
        <div className="absolute top-3 right-3 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white">
          1/{items.length}
        </div>
      ) : null}
      {items.length ? (
        <div className="absolute bottom-3 left-3 right-3 flex gap-2 overflow-x-auto">
          {items.slice(0, 6).map((item, idx) => (
            <div
              key={`${item.url}-${idx}`}
              className={cn(
                'relative h-12 w-12 rounded-lg overflow-hidden ring-1',
                idx === 0 ? 'ring-white/70' : 'ring-white/30',
              )}
            >
              <Image src={item.url} alt={item.alt_text || `Media ${idx + 1}`} fill className="object-cover" unoptimized />
              {item.type === 'video' ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Play className="h-3 w-3 text-white" fill="white" />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
