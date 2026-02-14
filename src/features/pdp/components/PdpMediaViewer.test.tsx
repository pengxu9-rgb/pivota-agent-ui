/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PdpMediaViewer } from './PdpMediaViewer';

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; unoptimized?: boolean }) => {
    const { fill: _fill, unoptimized: _unoptimized, alt, ...rest } = props;
    return <img {...rest} alt={typeof alt === 'string' ? alt : ''} />;
  },
}));

const officialItems = [
  { type: 'image' as const, url: 'https://example.com/o-1.jpg' },
  { type: 'image' as const, url: 'https://example.com/o-2.jpg' },
  { type: 'image' as const, url: 'https://example.com/o-3.jpg' },
];

const ugcItems = [
  { type: 'image' as const, url: 'https://example.com/u-1.jpg' },
  { type: 'image' as const, url: 'https://example.com/u-2.jpg' },
  { type: 'image' as const, url: 'https://example.com/u-3.jpg' },
];

function renderViewer(
  overrides: Partial<React.ComponentProps<typeof PdpMediaViewer>> = {},
) {
  const onClose = vi.fn();
  const onSwipe = vi.fn();
  const onOpenGrid = vi.fn();
  const onCloseWithState = vi.fn();
  const onIndexChange = vi.fn();

  const utils = render(
    <PdpMediaViewer
      isOpen
      initialIndex={0}
      officialItems={officialItems}
      ugcItems={ugcItems}
      defaultMode="official"
      onClose={onClose}
      onSwipe={onSwipe}
      onOpenGrid={onOpenGrid}
      onCloseWithState={onCloseWithState}
      onIndexChange={onIndexChange}
      {...overrides}
    />,
  );

  return {
    ...utils,
    onClose,
    onSwipe,
    onOpenGrid,
    onCloseWithState,
    onIndexChange,
  };
}

describe('PdpMediaViewer', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  });

  it('starts from provided initial index', () => {
    renderViewer({ initialIndex: 1, defaultMode: 'official' });
    expect(screen.getByTestId('viewer-counter')).toHaveTextContent('2/3');
  });

  it('supports official next navigation and emits swipe payload', () => {
    const { onSwipe } = renderViewer({ initialIndex: 1, defaultMode: 'official' });
    fireEvent.click(screen.getByLabelText('Next official media'));

    expect(screen.getByTestId('viewer-counter')).toHaveTextContent('3/3');
    expect(onSwipe).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'official',
        fromIndex: 1,
        toIndex: 2,
        direction: 'next',
      }),
    );
  });

  it('updates ugc index on vertical paging scroll and emits swipe payload', () => {
    const { onSwipe } = renderViewer({ defaultMode: 'ugc', initialIndex: 0 });
    const container = screen.getByTestId('ugc-scroll-container');
    Object.defineProperty(container, 'clientHeight', { value: 640, configurable: true });
    Object.defineProperty(container, 'scrollTop', { value: 640, configurable: true, writable: true });

    fireEvent.scroll(container);

    expect(screen.getByTestId('viewer-counter')).toHaveTextContent('2/3');
    expect(onSwipe).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'ugc',
        fromIndex: 0,
        toIndex: 1,
        direction: 'next',
      }),
    );
  });

  it('locks and restores body scrolling on open/close', () => {
    const { rerender } = render(
      <PdpMediaViewer
        isOpen
        initialIndex={0}
        officialItems={officialItems}
        ugcItems={ugcItems}
        defaultMode="official"
        onClose={() => {}}
      />,
    );

    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <PdpMediaViewer
        isOpen={false}
        initialIndex={0}
        officialItems={officialItems}
        ugcItems={ugcItems}
        defaultMode="official"
        onClose={() => {}}
      />,
    );

    expect(document.body.style.overflow).toBe('');
  });

  it('switches mode and applies keyboard navigation for ugc', () => {
    renderViewer({ defaultMode: 'official', initialIndex: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Buyer Show' }));
    fireEvent.keyDown(window, { key: 'ArrowDown' });

    expect(screen.getByTestId('viewer-counter')).toHaveTextContent('2/3');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('viewer-counter')).toHaveTextContent('2/3');
  });
});
