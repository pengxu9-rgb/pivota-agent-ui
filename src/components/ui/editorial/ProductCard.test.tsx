/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProductCard } from './ProductCard';

vi.mock('next/image', () => ({
  default: (
    props: React.ImgHTMLAttributes<HTMLImageElement> & {
      fill?: boolean;
      unoptimized?: boolean;
    },
  ) => {
    const { fill: _fill, unoptimized: _unoptimized, alt, ...rest } = props;
    return <img {...rest} alt={typeof alt === 'string' ? alt : ''} />;
  },
}));

describe('ProductCard price guard', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders a card with a positive price label', () => {
    render(
      <ProductCard
        image="/placeholder.svg"
        imageAlt="Serum"
        title="Barrier Serum"
        priceLabel="$28"
      />,
    );

    expect(screen.getByText('Barrier Serum')).toBeInTheDocument();
    expect(screen.getByText('$28')).toBeInTheDocument();
  });

  it('does not render when price is missing or zero', () => {
    const { rerender } = render(
      <ProductCard
        image="/placeholder.svg"
        imageAlt="Serum"
        title="No Price Serum"
        priceLabel=""
      />,
    );

    expect(screen.queryByText('No Price Serum')).not.toBeInTheDocument();

    rerender(
      <ProductCard
        image="/placeholder.svg"
        imageAlt="Serum"
        title="Zero Price Serum"
        priceLabel="$0"
      />,
    );

    expect(screen.queryByText('Zero Price Serum')).not.toBeInTheDocument();
  });
});
