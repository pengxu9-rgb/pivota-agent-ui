/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GenericDetailsSection } from './GenericDetailsSection';
import type { MediaGalleryData, Product, ProductDetailsData } from '@/features/pdp/types';

vi.mock('next/image', () => ({
  default: (
    props: React.ImgHTMLAttributes<HTMLImageElement> & {
      fill?: boolean;
      unoptimized?: boolean;
      priority?: boolean;
      fetchPriority?: string;
    },
  ) => {
    const {
      fill: _fill,
      unoptimized: _unoptimized,
      priority: _priority,
      fetchPriority: _fetchPriority,
      alt,
      ...rest
    } = props;
    return <img {...rest} alt={typeof alt === 'string' ? alt : ''} />;
  },
}));

const product: Product = {
  product_id: 'p_generic_1',
  title: 'Soft Knit Set',
  description: 'Soft brushed knit with relaxed fit.',
  image_url: 'https://sdcdn.io/tf/generic-hero.jpg',
  default_variant_id: 'v_1',
  variants: [],
};

const galleryMedia: MediaGalleryData = {
  items: [
    { type: 'image', url: 'https://sdcdn.io/tf/generic-hero.jpg' },
    { type: 'image', url: 'https://sdcdn.io/tf/generic-lifestyle.jpg' },
  ],
};

describe('GenericDetailsSection detail media', () => {
  it('does not render gallery media as product detail images', () => {
    const data: ProductDetailsData = {
      sections: [
        {
          heading: 'Product Details',
          content_type: 'text',
          content: 'Relaxed lounge fit.',
        },
      ],
    };

    const { container } = render(
      <GenericDetailsSection
        data={data}
        product={product}
        media={galleryMedia}
        displayedMediaItems={galleryMedia.items}
      />,
    );

    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('renders explicit detail media when it is distinct from the gallery', () => {
    const data: ProductDetailsData = {
      sections: [
        {
          heading: 'Product Details',
          content_type: 'text',
          content: 'Relaxed lounge fit.',
          media_urls: ['https://sdcdn.io/tf/fabric-detail.jpg'],
        },
      ],
    };

    const { container } = render(
      <GenericDetailsSection
        data={data}
        product={product}
        media={galleryMedia}
        displayedMediaItems={galleryMedia.items}
      />,
    );

    expect(container.querySelector('img[src="https://sdcdn.io/tf/fabric-detail.jpg"]')).not.toBeNull();
  });
});
