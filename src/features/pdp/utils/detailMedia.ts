import type { DetailSection, HowToUseData, MediaItem } from '@/features/pdp/types';
import {
  buildPdpImageDedupeKey,
  normalizePdpImageUrl,
} from '@/features/pdp/utils/pdpImageUrls';

type DetailMediaCandidate = {
  url: unknown;
  altText?: string;
};

function mediaKey(value: unknown): string | null {
  const normalized = normalizePdpImageUrl(value);
  if (!normalized) return null;
  return buildPdpImageDedupeKey(normalized) || normalized;
}

function pushMediaCandidate(
  candidates: DetailMediaCandidate[],
  value: unknown,
  altText?: string,
) {
  if (!value) return;
  if (typeof value === 'string') {
    candidates.push({ url: value, altText });
    return;
  }
  if (typeof value !== 'object' || Array.isArray(value)) return;
  const item = value as Record<string, unknown>;
  candidates.push({
    url: item.url || item.image_url || item.src,
    altText:
      String(item.alt_text || item.alt || altText || '').trim() ||
      undefined,
  });
}

function pushMediaList(
  candidates: DetailMediaCandidate[],
  values: unknown,
  altText?: string,
) {
  if (!Array.isArray(values)) return;
  values.forEach((value) => pushMediaCandidate(candidates, value, altText));
}

function collectSectionMediaCandidates(sections: DetailSection[]): DetailMediaCandidate[] {
  const candidates: DetailMediaCandidate[] = [];
  sections.forEach((section) => {
    const altText = String(section.heading || '').trim() || undefined;
    pushMediaList(candidates, section.media_urls, altText);
    pushMediaList(candidates, section.image_urls, altText);
    pushMediaList(candidates, section.media, altText);
  });
  return candidates;
}

function collectHowToUseMediaCandidates(howToUse?: HowToUseData | null): DetailMediaCandidate[] {
  if (!howToUse) return [];
  const altText = String(howToUse.title || 'How to use').trim();
  const candidates: DetailMediaCandidate[] = [];
  pushMediaList(candidates, howToUse.media_urls, altText);
  pushMediaList(candidates, howToUse.image_urls, altText);
  pushMediaList(candidates, howToUse.media, altText);
  return candidates;
}

export function getDistinctProductDetailMediaItems({
  sections,
  howToUse,
  displayedMediaItems,
  productImageUrl,
  maxItems = 2,
}: {
  sections: DetailSection[];
  howToUse?: HowToUseData | null;
  displayedMediaItems?: MediaItem[] | null;
  productImageUrl?: string | null;
  maxItems?: number;
}): MediaItem[] {
  const blockedKeys = new Set<string>();
  const addBlockedUrl = (value: unknown) => {
    const key = mediaKey(value);
    if (key) blockedKeys.add(key);
  };

  (displayedMediaItems || []).forEach((item) => addBlockedUrl(item?.url));
  addBlockedUrl(productImageUrl);

  const selected: MediaItem[] = [];
  const selectedKeys = new Set<string>();
  const candidates = [
    ...collectSectionMediaCandidates(sections),
    ...collectHowToUseMediaCandidates(howToUse),
  ];

  for (const candidate of candidates) {
    const normalizedUrl = normalizePdpImageUrl(candidate.url);
    if (!normalizedUrl) continue;
    const key = mediaKey(normalizedUrl);
    if (!key || blockedKeys.has(key) || selectedKeys.has(key)) continue;
    selectedKeys.add(key);
    selected.push({
      type: 'image',
      url: normalizedUrl,
      alt_text: candidate.altText,
      source: 'product_detail',
    });
    if (selected.length >= maxItems) break;
  }

  return selected;
}
