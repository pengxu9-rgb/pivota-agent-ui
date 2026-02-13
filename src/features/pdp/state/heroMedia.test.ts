import { describe, expect, it } from 'vitest';
import { getStableGalleryItems, resolveHeroMediaUrl } from './heroMedia';

describe('heroMedia helpers', () => {
  it('keeps gallery sequence stable (copy only)', () => {
    const source = [
      { type: 'image' as const, url: 'https://a.example/1.jpg' },
      { type: 'image' as const, url: 'https://a.example/2.jpg' },
    ];
    const stable = getStableGalleryItems(source);

    expect(stable).toEqual(source);
    expect(stable).not.toBe(source);
  });

  it('uses selected variant image for hero only at index 0', () => {
    const gallery = [
      { type: 'image' as const, url: 'https://a.example/gallery-1.jpg' },
      { type: 'image' as const, url: 'https://a.example/gallery-2.jpg' },
    ];

    const heroAtZero = resolveHeroMediaUrl({
      activeMediaIndex: 0,
      selectedVariantImageUrl: 'https://a.example/variant-red.jpg',
      galleryItems: gallery,
      fallbackUrl: 'https://a.example/fallback.jpg',
    });

    const heroAtOne = resolveHeroMediaUrl({
      activeMediaIndex: 1,
      selectedVariantImageUrl: 'https://a.example/variant-red.jpg',
      galleryItems: gallery,
      fallbackUrl: 'https://a.example/fallback.jpg',
    });

    expect(heroAtZero).toBe('https://a.example/variant-red.jpg');
    expect(heroAtOne).toBe('https://a.example/gallery-2.jpg');
  });
});
