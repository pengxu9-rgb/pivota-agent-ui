'use client';

import Image from 'next/image';
import { shouldUseUnoptimizedPdpImage } from '@/features/pdp/utils/pdpImageUrls';
import { cn } from '@/lib/utils';
import { ResponsiveSheet } from '@/features/pdp/components/ResponsiveSheet';

export type GenericColorOption = {
  value: string;
  label_image_url?: string;
  image_url?: string;
  swatch_hex?: string;
};

export function GenericColorSheet({
  open,
  onClose,
  options,
  selectedValue,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  options: GenericColorOption[];
  selectedValue: string | null;
  onSelect: (value: string) => void;
}) {
  const hasAnyPreview = options.some(
    (option) => Boolean(option.label_image_url || option.image_url || option.swatch_hex),
  );
  return (
    <ResponsiveSheet open={open} onClose={onClose} title={`Select Color (${options.length})`}>
      <div
        className={cn(
          'mt-2 grid gap-2 px-4 pb-4',
          hasAnyPreview ? 'grid-cols-4' : 'grid-cols-2',
        )}
      >
        {options.map((option) => {
          const isSelected = option.value === selectedValue;
          const imageUrl = option.label_image_url || option.image_url;
          const hasPreview = Boolean(imageUrl) || Boolean(option.swatch_hex);
          return (
            <button
              key={option.value}
              onClick={() => {
                onSelect(option.value);
                onClose();
              }}
              className={cn(
                'flex flex-col items-center gap-1.5 p-2 rounded-xl border text-center transition-colors bg-white',
                isSelected
                  ? 'border-[color:var(--accent-600)] ring-1 ring-[color:var(--accent-600)]'
                  : 'border-border hover:border-muted-foreground/40',
                hasPreview ? '' : 'justify-center min-h-[56px]',
              )}
            >
              {hasPreview ? (
                <div className="relative h-14 w-14 rounded-lg overflow-hidden bg-muted">
                  {imageUrl ? (
                    <Image
                      src={imageUrl}
                      alt={option.value}
                      fill
                      className="object-cover"
                      sizes="56px"
                      loading="lazy"
                      unoptimized={shouldUseUnoptimizedPdpImage(imageUrl)}
                    />
                  ) : option.swatch_hex ? (
                    <span className="absolute inset-0" style={{ backgroundColor: option.swatch_hex }} />
                  ) : null}
                </div>
              ) : null}

              <span
                className={cn(
                  'w-full truncate',
                  hasPreview
                    ? 'text-[11px] text-muted-foreground'
                    : 'text-[13px] font-medium text-foreground',
                )}
              >
                {option.value}
              </span>
            </button>
          );
        })}
      </div>
    </ResponsiveSheet>
  );
}
