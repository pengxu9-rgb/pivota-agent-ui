import type { MediaItem } from '../types';

export function getStableGalleryItems(items: MediaItem[] | null | undefined): MediaItem[] {
  return Array.isArray(items) ? [...items] : [];
}

export function resolveHeroMediaUrl(args: {
  activeMediaIndex: number;
  selectedVariantImageUrl?: string | null;
  galleryItems: MediaItem[];
  fallbackUrl?: string | null;
}): string {
  const activeIndex =
    Number.isFinite(args.activeMediaIndex) && args.activeMediaIndex >= 0
      ? Math.floor(args.activeMediaIndex)
      : 0;
  if (activeIndex === 0 && args.selectedVariantImageUrl) {
    return args.selectedVariantImageUrl;
  }
  const galleryUrl = args.galleryItems[activeIndex]?.url;
  if (galleryUrl) return galleryUrl;
  return args.fallbackUrl || '';
}

