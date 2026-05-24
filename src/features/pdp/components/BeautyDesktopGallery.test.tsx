/* eslint-disable @next/next/no-img-element */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BeautyDesktopGallery } from './BeautyDesktopGallery';

const images = [
  'https://example.com/square.jpg',
  'https://example.com/tall.jpg',
  'https://example.com/wide.jpg',
];

describe('BeautyDesktopGallery', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the main image as contained media', () => {
    render(<BeautyDesktopGallery images={images} alt="Adaptive product" />);

    const frame = screen.getByTestId('beauty-desktop-gallery-frame');
    const heroImage = screen.getByAltText('Adaptive product');
    const heroStage = screen.getByTestId('beauty-desktop-hero-stage');

    expect(frame).toHaveClass('relative', 'isolate', 'mx-auto', 'w-full', 'max-w-[calc(100vh-96px)]', 'overflow-hidden');
    expect(heroImage).toHaveClass('object-contain', 'object-center', 'scale-[1.08]');
    expect(heroImage).not.toHaveClass('translate-x-[10%]');
    expect(heroStage).toHaveStyle({ aspectRatio: '1 / 1' });
    expect(heroStage).toHaveClass('min-h-[480px]', 'overflow-hidden');
    expect(screen.getByRole('button', { name: 'View image 1 of 3' })).toHaveClass('left-[96px]', 'right-6');
  });

  it('switches images with desktop arrows', () => {
    render(<BeautyDesktopGallery images={images} alt="Adaptive product" />);

    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next image' }));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByAltText('Adaptive product')).toHaveClass('scale-100');
    expect(screen.getByRole('button', { name: 'View image 2 of 3' })).toHaveClass('left-[96px]', 'right-6');

    fireEvent.click(screen.getByRole('button', { name: 'Previous image' }));
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    expect(screen.getByAltText('Adaptive product')).toHaveClass('scale-[1.08]');
    expect(screen.getByAltText('Adaptive product')).not.toHaveClass('translate-x-[10%]');
  });

  it('keeps the thumbnail rail as bounded chrome outside the hero safe frame', () => {
    render(
      <BeautyDesktopGallery
        images={Array.from({ length: 12 }, (_, idx) => `https://example.com/${idx + 1}.jpg`)}
        alt="Adaptive product"
      />,
    );

    const frame = screen.getByTestId('beauty-desktop-gallery-frame');
    const rail = screen.getByTestId('beauty-desktop-thumbnail-rail');
    const heroImage = screen.getByAltText('Adaptive product') as HTMLElement;
    const heroStage = screen.getByTestId('beauty-desktop-hero-stage');
    const previousArrow = screen.getByRole('button', { name: 'Previous image' });
    const nextArrow = screen.getByRole('button', { name: 'Next image' });

    const heroButton = screen.getByRole('button', { name: 'View image 1 of 12' });

    expect(frame).toHaveClass('relative', 'isolate', 'mx-auto', 'w-full', 'max-w-[calc(100vh-96px)]', 'overflow-hidden');
    expect(rail).toHaveClass('absolute', 'inset-y-3', 'left-3', 'w-[68px]', 'overflow-hidden');
    expect(rail.firstElementChild).toHaveClass('h-full', 'overflow-y-auto');
    expect(heroStage).toHaveClass('overflow-hidden');
    expect(heroStage).toContainElement(heroImage);
    expect(heroStage).not.toContainElement(rail);
    expect(rail).not.toContainElement(heroImage);
    expect(heroButton.parentElement).toBe(heroStage);
    expect(heroButton).toHaveClass('left-[96px]', 'right-6', 'overflow-hidden');
    expect(previousArrow.parentElement).toBe(heroStage);
    expect(nextArrow.parentElement).toBe(heroStage);
    expect(previousArrow).toHaveClass('left-[96px]', 'top-1/2');
    expect(nextArrow).toHaveClass('right-4', 'top-1/2');
    expect(screen.getAllByRole('button', { name: /^Select image/ })).toHaveLength(12);
  });
});
