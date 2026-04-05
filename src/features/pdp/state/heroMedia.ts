import type { MediaItem, Variant } from '../types';
import {
  buildPdpImageDedupeKey,
  normalizePdpImageUrl,
} from '@/features/pdp/utils/pdpImageUrls';

function dedupeKeyForMediaUrl(url: string | null | undefined): string {
  return buildPdpImageDedupeKey(url) || String(url || '').trim();
}

function normalizeGalleryMediaItem(item: MediaItem): MediaItem | null {
  if (!item || typeof item !== 'object') return null;
  const url = normalizePdpImageUrl(item.url) || String(item.url || '').trim();
  if (!url) return null;
  return {
    ...item,
    url,
  };
}

function buildVariantPreviewItems(
  variants: Variant[] | null | undefined,
  selectedVariantId?: string | null,
): MediaItem[] {
  const orderedVariants = Array.isArray(variants) ? [...variants] : [];
  if (!orderedVariants.length) return [];

  const selectedIndex = orderedVariants.findIndex(
    (variant) => variant.variant_id === selectedVariantId,
  );
  if (selectedIndex > 0) {
    const [selectedVariant] = orderedVariants.splice(selectedIndex, 1);
    orderedVariants.unshift(selectedVariant);
  }

  const previewItems: MediaItem[] = [];
  const seen = new Set<string>();
  for (const variant of orderedVariants) {
    const url = normalizePdpImageUrl(variant.image_url) || String(variant.image_url || '').trim();
    const dedupeKey = dedupeKeyForMediaUrl(url);
    if (!url || !dedupeKey || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    previewItems.push({
      type: 'image',
      url,
      alt_text: variant.title || '',
      source: 'variant',
    });
  }
  return previewItems;
}

export function getStableGalleryItems(args: {
  items: MediaItem[] | null | undefined;
  variants?: Variant[] | null | undefined;
  selectedVariantId?: string | null;
}): MediaItem[] {
  const seen = new Set<string>();
  const merged: MediaItem[] = [];

  const pushUnique = (item: MediaItem | null) => {
    if (!item) return;
    if (String(item.type || '').trim().toLowerCase() === 'video') {
      merged.push(item);
      return;
    }
    const dedupeKey = dedupeKeyForMediaUrl(item.url);
    if (!dedupeKey || seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    merged.push(item);
  };

  for (const item of buildVariantPreviewItems(args.variants, args.selectedVariantId)) {
    pushUnique(item);
  }
  for (const item of Array.isArray(args.items) ? args.items : []) {
    pushUnique(normalizeGalleryMediaItem(item));
  }

  return merged;
}

export function resolveHeroMediaUrl(args: {
  activeMediaIndex: number;
  galleryItems: MediaItem[];
  fallbackUrl?: string | null;
}): string {
  const activeIndex =
    Number.isFinite(args.activeMediaIndex) && args.activeMediaIndex >= 0
      ? Math.floor(args.activeMediaIndex)
      : 0;
  const galleryUrl = args.galleryItems[activeIndex]?.url;
  if (galleryUrl) return galleryUrl;
  return args.fallbackUrl || '';
}
