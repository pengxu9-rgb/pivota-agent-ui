import { describe, expect, it } from 'vitest';

import { getDistinctProductDetailMediaItems } from './detailMedia';
import type { DetailSection, MediaItem } from '@/features/pdp/types';

describe('getDistinctProductDetailMediaItems', () => {
  it('drops explicit detail images when they duplicate gallery images', () => {
    const displayedMediaItems: MediaItem[] = [
      {
        type: 'image',
        url: 'https://sdcdn.io/tf/pdp-detail.jpg?width=1200&quality=90',
      },
    ];
    const sections: DetailSection[] = [
      {
        heading: 'Product Details',
        content_type: 'text',
        content: 'Texture and label details.',
        media_urls: [
          'https://sdcdn.io/tf/pdp-detail.jpg?w=640&q=80',
          'https://sdcdn.io/tf/ingredients-panel.jpg',
        ],
      },
    ];

    const result = getDistinctProductDetailMediaItems({
      sections,
      displayedMediaItems,
      productImageUrl: 'https://sdcdn.io/tf/hero.jpg',
    });

    expect(result.map((item) => item.url)).toEqual([
      'https://sdcdn.io/tf/ingredients-panel.jpg',
    ]);
    expect(result[0]?.source).toBe('product_detail');
  });

  it('drops product fallback duplicates when no gallery items are present', () => {
    const sections: DetailSection[] = [
      {
        heading: 'Overview',
        content_type: 'text',
        content: 'Overview copy.',
        media_urls: [
          'https://sdcdn.io/tf/hero.jpg?height=900',
          'https://sdcdn.io/tf/texture.jpg',
        ],
      },
    ];

    const result = getDistinctProductDetailMediaItems({
      sections,
      displayedMediaItems: [],
      productImageUrl: 'https://sdcdn.io/tf/hero.jpg',
    });

    expect(result.map((item) => item.url)).toEqual([
      'https://sdcdn.io/tf/texture.jpg',
    ]);
  });

  it('keeps distinct how-to-use media as detail media', () => {
    const result = getDistinctProductDetailMediaItems({
      sections: [],
      howToUse: {
        title: 'How to apply',
        steps: ['Apply evenly.'],
        image_urls: ['https://sdcdn.io/tf/application-step.jpg'],
      },
      displayedMediaItems: [
        { type: 'image', url: 'https://sdcdn.io/tf/hero.jpg' },
      ],
      productImageUrl: 'https://sdcdn.io/tf/hero.jpg',
    });

    expect(result).toEqual([
      expect.objectContaining({
        type: 'image',
        url: 'https://sdcdn.io/tf/application-step.jpg',
        alt_text: 'How to apply',
      }),
    ]);
  });
});
