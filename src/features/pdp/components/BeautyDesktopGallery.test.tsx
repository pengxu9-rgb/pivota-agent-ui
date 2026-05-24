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

    expect(screen.getByAltText('Adaptive product')).toHaveClass('object-contain');
  });

  it('switches images with desktop arrows', () => {
    render(<BeautyDesktopGallery images={images} alt="Adaptive product" />);

    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next image' }));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Previous image' }));
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
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

    expect(rail).toHaveClass('absolute', 'inset-y-0', 'overflow-y-auto');
    expect(heroStage).toHaveClass('ml-[76px]', 'overflow-hidden');
    expect(heroStage?.parentElement).toContainElement(rail);
    expect(screen.getAllByRole('button', { name: /^Select image/ })).toHaveLength(12);
  });
});
