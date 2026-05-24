/* eslint-disable @next/next/no-img-element */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BeautyMobileGallery } from './BeautyMobileGallery';

const images = [
  'https://example.com/square.jpg',
  'https://example.com/tall.jpg',
  'https://example.com/wide.jpg',
];

describe('BeautyMobileGallery', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the gallery image as contained media', () => {
    render(<BeautyMobileGallery images={images} alt="Adaptive product" />);

    expect(screen.getByAltText('Adaptive product')).toHaveClass('object-contain');
  });

  it('switches images with desktop arrows when reused by desktop shells', () => {
    render(<BeautyMobileGallery images={images} alt="Adaptive product" />);

    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next image' }));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Previous image' }));
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });
});
