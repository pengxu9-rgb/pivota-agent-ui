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

    const heroImage = screen.getByAltText('Adaptive product');
    const heroStage = heroImage.closest('button')?.parentElement;

    expect(heroImage).toHaveClass('object-contain', 'object-center', 'translate-x-[10%]', 'scale-[1.08]');
    expect(heroStage).toHaveStyle({ aspectRatio: '1 / 1' });
    expect(heroStage).toHaveClass('min-h-[480px]');
  });

  it('switches images with desktop arrows', () => {
    render(<BeautyDesktopGallery images={images} alt="Adaptive product" />);

    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next image' }));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByAltText('Adaptive product')).toHaveClass('scale-100');
    expect(screen.getByRole('button', { name: 'View image 2 of 3' })).toHaveClass('left-[76px]');

    fireEvent.click(screen.getByRole('button', { name: 'Previous image' }));
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    expect(screen.getByAltText('Adaptive product')).toHaveClass('translate-x-[10%]', 'scale-[1.08]');
  });

  it('bounds the desktop thumbnail rail to the main image stage', () => {
    render(
      <BeautyDesktopGallery
        images={Array.from({ length: 12 }, (_, idx) => `https://example.com/${idx + 1}.jpg`)}
        alt="Adaptive product"
      />,
    );

    const rail = screen.getByTestId('beauty-desktop-thumbnail-rail');
    const heroImage = screen.getByAltText('Adaptive product') as HTMLElement;
    const heroStage = heroImage.closest('button')?.parentElement;
    const previousArrow = screen.getByRole('button', { name: 'Previous image' });
    const nextArrow = screen.getByRole('button', { name: 'Next image' });

    expect(rail).toHaveClass('absolute', 'inset-y-3', 'left-3', 'overflow-y-auto');
    expect(heroStage).toHaveClass('overflow-hidden');
    expect(heroStage).not.toHaveClass('ml-[76px]');
    expect(heroStage?.parentElement).toContainElement(rail);
    expect(previousArrow).toHaveClass('left-[92px]', 'top-1/2');
    expect(nextArrow).toHaveClass('right-4', 'top-1/2');
    expect(screen.getAllByRole('button', { name: /^Select image/ })).toHaveLength(12);
  });
});
