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
});
