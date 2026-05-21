/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BeautyDetailsSection } from './BeautyDetailsSection';
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
  product_id: 'p_1',
  title: 'Barrier Cream',
  description: 'A cushiony moisturizer for dry skin.',
  image_url: 'https://sdcdn.io/tf/hero.jpg',
  default_variant_id: 'v_1',
  variants: [],
};

const galleryMedia: MediaGalleryData = {
  items: [
    { type: 'image', url: 'https://sdcdn.io/tf/hero.jpg' },
    { type: 'image', url: 'https://sdcdn.io/tf/lifestyle.jpg' },
  ],
};

describe('BeautyDetailsSection detail media', () => {
  it('does not recycle gallery images inside product details', () => {
    const data: ProductDetailsData = {
      sections: [
        {
          heading: 'Description',
          content_type: 'text',
          content: 'Barrier-first hydration in a soft cream texture.',
        },
      ],
    };

    render(
      <BeautyDetailsSection
        data={data}
        product={product}
        media={galleryMedia}
        displayedMediaItems={galleryMedia.items}
        showDetailMedia
      />,
    );

    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(screen.getByText('Barrier Cream')).toBeInTheDocument();
  });

  it('renders explicit detail media when it is distinct from gallery media', () => {
    const data: ProductDetailsData = {
      sections: [
        {
          heading: 'Description',
          content_type: 'text',
          content: 'Barrier-first hydration in a soft cream texture.',
          media_urls: ['https://sdcdn.io/tf/texture-detail.jpg'],
        },
      ],
    };

    render(
      <BeautyDetailsSection
        data={data}
        product={product}
        media={galleryMedia}
        displayedMediaItems={galleryMedia.items}
        showDetailMedia
      />,
    );

    expect(screen.getByAltText('Description')).toHaveAttribute(
      'src',
      'https://sdcdn.io/tf/texture-detail.jpg',
    );
    expect(screen.queryByRole('img', { name: 'Barrier Cream' })).not.toBeInTheDocument();
  });
});
