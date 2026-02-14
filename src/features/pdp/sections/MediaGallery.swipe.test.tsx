/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaGallery } from './MediaGallery';

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

describe('MediaGallery swipe behavior', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('moves to next item on left swipe gesture', () => {
    const onSelect = vi.fn();
    render(
      <MediaGallery
        title="Product A"
        activeIndex={0}
        data={{
          items: [
            { type: 'image', url: 'https://example.com/1.jpg', alt_text: 'Hero 1' },
            { type: 'image', url: 'https://example.com/2.jpg', alt_text: 'Hero 2' },
            { type: 'image', url: 'https://example.com/3.jpg', alt_text: 'Hero 3' },
          ],
        }}
        onSelect={onSelect}
      />,
    );

    const heroImage = screen.getAllByAltText('Hero 1')[0] as HTMLElement;
    fireEvent.touchStart(heroImage, {
      touches: [{ clientX: 260, clientY: 90 }],
    });
    fireEvent.touchEnd(heroImage, {
      changedTouches: [{ clientX: 120, clientY: 88 }],
    });

    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('moves to previous item on right swipe gesture', () => {
    const onSelect = vi.fn();
    render(
      <MediaGallery
        title="Product B"
        activeIndex={1}
        data={{
          items: [
            { type: 'image', url: 'https://example.com/1.jpg', alt_text: 'Hero 1' },
            { type: 'image', url: 'https://example.com/2.jpg', alt_text: 'Hero 2' },
            { type: 'image', url: 'https://example.com/3.jpg', alt_text: 'Hero 3' },
          ],
        }}
        onSelect={onSelect}
      />,
    );

    const heroImage = screen.getAllByAltText('Hero 2')[0] as HTMLElement;
    fireEvent.touchStart(heroImage, {
      touches: [{ clientX: 120, clientY: 100 }],
    });
    fireEvent.touchEnd(heroImage, {
      changedTouches: [{ clientX: 260, clientY: 100 }],
    });

    expect(onSelect).toHaveBeenCalledWith(0);
  });
});
