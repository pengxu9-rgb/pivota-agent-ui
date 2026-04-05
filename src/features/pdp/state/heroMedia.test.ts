import { describe, expect, it } from 'vitest';
import { getStableGalleryItems, resolveHeroMediaUrl } from './heroMedia';
import { unwrapPdpImageProxyTarget } from '@/features/pdp/utils/pdpImageUrls';

describe('heroMedia helpers', () => {
  it('keeps gallery sequence stable when no variant previews are available', () => {
    const source = [
      { type: 'image' as const, url: 'https://a.example/1.jpg' },
      { type: 'image' as const, url: 'https://a.example/2.jpg' },
    ];
    const stable = getStableGalleryItems({ items: source });

    expect(stable.map((item) => unwrapPdpImageProxyTarget(item.url))).toEqual(
      source.map((item) => item.url),
    );
    expect(stable).not.toBe(source);
  });

  it('frontloads selected and sibling variant images into the official gallery', () => {
    const gallery = getStableGalleryItems({
      items: [
        { type: 'image' as const, url: 'https://a.example/gallery-hero.jpg' },
        { type: 'image' as const, url: 'https://a.example/detail.jpg' },
      ],
      variants: [
        { variant_id: 'blue', title: 'Blue', image_url: 'https://a.example/variant-blue.jpg' },
        { variant_id: 'red', title: 'Red', image_url: 'https://a.example/variant-red.jpg' },
        { variant_id: 'hero', title: 'Hero', image_url: 'https://a.example/gallery-hero.jpg' },
      ] as any,
      selectedVariantId: 'red',
    });

    expect(gallery.map((item) => unwrapPdpImageProxyTarget(item.url))).toEqual([
      'https://a.example/variant-red.jpg',
      'https://a.example/variant-blue.jpg',
      'https://a.example/gallery-hero.jpg',
      'https://a.example/detail.jpg',
    ]);
  });

  it('uses the merged gallery ordering for the hero image', () => {
    const gallery = [
      { type: 'image' as const, url: 'https://a.example/variant-red.jpg' },
      { type: 'image' as const, url: 'https://a.example/gallery-hero.jpg' },
      { type: 'image' as const, url: 'https://a.example/detail.jpg' },
    ];

    const heroAtZero = resolveHeroMediaUrl({
      activeMediaIndex: 0,
      galleryItems: gallery,
      fallbackUrl: 'https://a.example/fallback.jpg',
    });

    const heroAtTwo = resolveHeroMediaUrl({
      activeMediaIndex: 2,
      galleryItems: gallery,
      fallbackUrl: 'https://a.example/fallback.jpg',
    });

    expect(unwrapPdpImageProxyTarget(heroAtZero)).toBe('https://a.example/variant-red.jpg');
    expect(unwrapPdpImageProxyTarget(heroAtTwo)).toBe('https://a.example/detail.jpg');
  });
});
