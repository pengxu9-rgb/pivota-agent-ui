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

  it('preserves the requested hero aspect ratio on desktop', () => {
    render(
      <MediaGallery
        title="Product C"
        aspectClass="aspect-[6/5]"
        data={{
          items: [
            { type: 'image', url: 'https://example.com/1.jpg', alt_text: 'Hero 1' },
          ],
        }}
      />,
    );

    const heroImage = screen.getAllByAltText('Hero 1')[0] as HTMLElement;
    const heroFrame = heroImage.parentElement?.parentElement;

    expect(heroFrame).toHaveClass('aspect-[6/5]');
    expect(heroFrame).not.toHaveClass('lg:aspect-square');
  });

  it('keeps product-line preview images as bounded artboard chrome on desktop', () => {
    render(
      <MediaGallery
        title="Product D"
        aspectClass="aspect-square"
        data={{
          items: [
            { type: 'image', url: 'https://example.com/1.jpg', alt_text: 'Hero 1' },
          ],
          preview_scope: 'product_line',
          preview_items: Array.from({ length: 12 }, (_, idx) => ({
            type: 'image',
            url: `https://example.com/preview-${idx + 1}.jpg`,
            alt_text: `Preview ${idx + 1}`,
            product_id: `preview_${idx + 1}`,
          })),
        }}
      />,
    );

    const heroImage = screen.getAllByAltText('Hero 1')[0] as HTMLElement;
    const frame = screen.getByTestId('media-gallery-frame');
    const heroStage = screen.getByTestId('media-gallery-hero-stage');
    const safeFrame = screen.getByTestId('media-gallery-hero-safe-frame');
    const sideRail = screen.getByTestId('media-gallery-side-rail');
    const previewRail = screen.getByTestId('product-line-preview-rail');

    expect(frame).toHaveClass('relative', 'isolate');
    expect(heroStage).toContainElement(heroImage);
    expect(heroStage).toContainElement(safeFrame);
    expect(safeFrame).toHaveClass('left-0', 'right-0', 'lg:left-[96px]', 'lg:right-6', 'overflow-hidden');
    expect(sideRail).toHaveClass('lg:absolute', 'lg:inset-y-3', 'lg:left-3', 'lg:w-[68px]', 'lg:overflow-hidden');
    expect(sideRail.firstElementChild).toHaveClass('lg:h-full', 'lg:overflow-y-auto');
    expect(sideRail).toContainElement(previewRail);
    expect(sideRail).not.toContainElement(heroImage);
    expect(heroStage).not.toContainElement(sideRail);
    expect(screen.getByRole('button', { name: 'View product-line item 1' })).toHaveClass('lg:h-14', 'lg:w-14');
    expect(previewRail.querySelector('.overflow-x-auto')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^View product-line item/ })).toHaveLength(12);
  });

  it('keeps the desktop media thumbnail rail as bounded chrome outside the hero safe frame', () => {
    render(
      <MediaGallery
        title="Product E"
        aspectClass="aspect-square"
        data={{
          items: Array.from({ length: 12 }, (_, idx) => ({
            type: 'image',
            url: `https://example.com/media-${idx + 1}.jpg`,
            alt_text: `Hero ${idx + 1}`,
          })),
        }}
      />,
    );

    const heroImage = screen.getAllByAltText('Hero 1')[0] as HTMLElement;
    const frame = screen.getByTestId('media-gallery-frame');
    const heroStage = screen.getByTestId('media-gallery-hero-stage');
    const safeFrame = screen.getByTestId('media-gallery-hero-safe-frame');
    const sideRail = screen.getByTestId('media-gallery-side-rail');
    const thumbnailRail = screen.getByTestId('media-gallery-thumbnail-rail');
    const previousArrow = screen.getByRole('button', { name: 'Previous image' });
    const nextArrow = screen.getByRole('button', { name: 'Next image' });

    expect(frame).toHaveClass('relative', 'isolate');
    expect(heroStage).toContainElement(heroImage);
    expect(heroStage).toContainElement(safeFrame);
    expect(safeFrame).toHaveClass('left-0', 'right-0', 'lg:left-[96px]', 'lg:right-6', 'overflow-hidden');
    expect(sideRail).toHaveClass('lg:absolute', 'lg:inset-y-3', 'lg:left-3', 'lg:w-[68px]', 'lg:overflow-hidden');
    expect(sideRail.firstElementChild).toHaveClass('lg:h-full', 'lg:overflow-y-auto');
    expect(sideRail).toContainElement(thumbnailRail);
    expect(heroStage).not.toContainElement(sideRail);
    expect(sideRail).not.toContainElement(heroImage);
    expect(previousArrow.parentElement).toBe(heroStage);
    expect(nextArrow.parentElement).toBe(heroStage);
    expect(previousArrow).toHaveClass('left-[96px]', 'top-1/2');
    expect(nextArrow).toHaveClass('right-4', 'top-1/2');
    expect(screen.getByRole('button', { name: 'Select media 1' })).toHaveClass('h-14', 'w-14');
    expect(screen.getAllByRole('button', { name: /^Select media/ })).toHaveLength(12);
  });

  it('uses a rail-aware safe frame for primary contained media without translate hacks', () => {
    render(
      <MediaGallery
        title="Product G"
        aspectClass="aspect-square"
        fit="object-contain"
        data={{
          items: [
            { type: 'image', url: 'https://example.com/media-1.jpg', alt_text: 'Hero 1' },
            { type: 'image', url: 'https://example.com/media-2.jpg', alt_text: 'Hero 2' },
          ],
        }}
      />,
    );

    const heroImage = screen.getAllByAltText('Hero 1')[0] as HTMLElement;
    const safeFrame = screen.getByTestId('media-gallery-hero-safe-frame');

    expect(heroImage).toHaveClass('object-contain', 'lg:scale-[1.06]');
    expect(heroImage).not.toHaveClass('lg:translate-x-[8%]');
    expect(safeFrame).toHaveClass('lg:left-[96px]', 'lg:right-6');
    expect(heroImage.parentElement).toBe(safeFrame);
  });

  it('keeps secondary contained media centered inside the same rail-aware safe frame', () => {
    render(
      <MediaGallery
        title="Product F"
        aspectClass="aspect-square"
        fit="object-contain"
        activeIndex={1}
        data={{
          items: [
            { type: 'image', url: 'https://example.com/media-1.jpg', alt_text: 'Hero 1' },
            { type: 'image', url: 'https://example.com/media-2.jpg', alt_text: 'Hero 2' },
          ],
        }}
      />,
    );

    const heroImage = screen.getAllByAltText('Hero 2')[0] as HTMLElement;
    const safeFrame = screen.getByTestId('media-gallery-hero-safe-frame');
    const heroFrame = safeFrame.parentElement;

    expect(heroImage).toHaveClass('object-contain', 'lg:scale-100');
    expect(heroImage).not.toHaveClass('lg:translate-x-[8%]');
    expect(safeFrame).toHaveClass('left-0', 'right-0', 'lg:left-[96px]', 'lg:right-6');
    expect(heroFrame).toHaveClass('aspect-square');
    expect(heroFrame).not.toHaveClass('lg:ml-[76px]');
  });
});
