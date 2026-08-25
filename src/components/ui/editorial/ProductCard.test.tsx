/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

afterEach(() => cleanup());

describe('editorial ProductCard image fallback', () => {
  it('swaps to the placeholder when the image fails to load', () => {
    // Without an onError handler this card rendered the browser's broken-image glyph:
    // it was the only product card missing the fallback every sibling has.
    render(<ProductCard image="/api/image-proxy?url=https%3A%2F%2Fdead.test%2Fx.png" title="Serum" />);

    const img = screen.getByAltText('Serum') as HTMLImageElement;
    expect(img.getAttribute('src')).toContain('/api/image-proxy');

    fireEvent.error(img);

    expect(screen.getByAltText('Serum').getAttribute('src')).toBe('/placeholder.svg');
  });

  it('does not loop when the placeholder itself fails', () => {
    render(<ProductCard image="/placeholder.svg" title="Serum" />);

    const img = screen.getByAltText('Serum') as HTMLImageElement;
    fireEvent.error(img);

    expect(screen.getByAltText('Serum').getAttribute('src')).toBe('/placeholder.svg');
  });

  it('picks up a changed image prop after an earlier failure', () => {
    const { rerender } = render(<ProductCard image="https://dead.test/a.png" title="Serum" />);

    fireEvent.error(screen.getByAltText('Serum'));
    expect(screen.getByAltText('Serum').getAttribute('src')).toBe('/placeholder.svg');

    rerender(<ProductCard image="https://cdn.shopify.com/s/files/1/0001/b.png" title="Serum" />);
    expect(screen.getByAltText('Serum').getAttribute('src')).toBe(
      'https://cdn.shopify.com/s/files/1/0001/b.png',
    );
  });
});
