'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { PhotoPlaceholder } from './PhotoPlaceholder';
import type { ServiceType } from '@/features/services/lib/types';

type Props = {
  photos?: string[];
  providerName: string;
  serviceType: ServiceType;
  className?: string;
};

export function ProviderHero({ photos = [], providerName, serviceType, className }: Props) {
  const [active, setActive] = useState(0);
  const visiblePhotos = photos.filter(Boolean).slice(0, 6);
  const photo = visiblePhotos[active] || '';

  return (
    <div className={cn('relative h-[280px] overflow-hidden bg-[var(--pv-paper-muted)] md:h-[480px] md:rounded-[var(--pv-radius-lg)]', className)}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="h-full w-full object-cover" />
      ) : (
        <>
          <PhotoPlaceholder
            service_type={serviceType}
            provider_initial={providerName}
            className="h-full w-full"
          />
          <span className="absolute bottom-4 left-4 rounded-full bg-[rgba(0,0,0,0.32)] px-2.5 py-1 text-[10.5px] font-semibold text-white backdrop-blur-md">
            Photos coming soon
          </span>
        </>
      )}
      {visiblePhotos.length > 1 ? (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5">
          {visiblePhotos.map((item, index) => (
            <button
              key={item}
              type="button"
              aria-label={`Show photo ${index + 1}`}
              onClick={() => setActive(index)}
              className={cn(
                'h-1.5 rounded-full transition-all',
                index === active ? 'w-5 bg-white' : 'w-1.5 bg-white/55',
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
