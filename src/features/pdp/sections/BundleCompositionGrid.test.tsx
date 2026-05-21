/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BundleCompositionGrid } from './BundleCompositionGrid';
import type { BundleCompositionData } from '@/features/pdp/types';

const routerPushMock = vi.fn();

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

vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _prefetch, ...rest }: any) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

const baseData: BundleCompositionData = {
  strategy: 'bundle_components',
  total_count: 3,
  items: [
    {
      product_id: 'ext_a',
      merchant_id: 'external_seed',
      title: 'Glycolic Acid 7% Exfoliating Toner',
      brand: { name: 'the ordinary' },
      image_url: 'https://example.com/glycolic.png',
      canonical_url: 'https://theordinary.com/glycolic',
      price: { amount: 13.5, currency: 'USD' },
      component_role: 'toner',
      size_label: '30ml',
      source_quality_status: 'ready',
    },
    {
      product_id: 'ext_b',
      merchant_id: 'external_seed',
      title: 'Niacinamide 10% + Zinc 1%',
      brand: { name: 'the ordinary' },
      image_url: 'https://example.com/niacinamide.png',
      price: { amount: 6, currency: 'USD' },
      component_role: 'serum',
      source_quality_status: 'ready',
    },
    {
      product_id: 'ext_c',
      merchant_id: 'external_seed',
      title: 'Hyaluronic Acid 2% + B5',
      source_quality_status: 'partial',
    },
  ],
};

describe('BundleCompositionGrid', () => {
  beforeEach(() => {
    routerPushMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the heading and item count', () => {
    render(<BundleCompositionGrid data={baseData} />);
    expect(screen.getByText("What's in the set")).toBeInTheDocument();
    expect(screen.getByText('3 items')).toBeInTheDocument();
  });

  it('renders all items with their titles', () => {
    render(<BundleCompositionGrid data={baseData} />);
    expect(screen.getByText('Glycolic Acid 7% Exfoliating Toner')).toBeInTheDocument();
    expect(screen.getByText('Niacinamide 10% + Zinc 1%')).toBeInTheDocument();
    expect(screen.getByText('Hyaluronic Acid 2% + B5')).toBeInTheDocument();
  });

  it('formats price when present', () => {
    render(<BundleCompositionGrid data={baseData} />);
    expect(screen.getByText('$13.50')).toBeInTheDocument();
    expect(screen.getByText('$6.00')).toBeInTheDocument();
  });

  it('renders size and role badges when present', () => {
    render(<BundleCompositionGrid data={baseData} />);
    expect(screen.getByText('30ml')).toBeInTheDocument();
    expect(screen.getAllByText('toner').length).toBeGreaterThan(0);
    expect(screen.getAllByText('serum').length).toBeGreaterThan(0);
  });

  it('returns null when there are no items', () => {
    const { container } = render(
      <BundleCompositionGrid data={{ strategy: 'bundle_components', items: [] }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('fires onItemClick and routes via Next router on left click', () => {
    const onItemClick = vi.fn();
    render(<BundleCompositionGrid data={baseData} onItemClick={onItemClick} />);
    const links = screen.getAllByRole('link');
    fireEvent.click(links[0], { button: 0 });
    expect(onItemClick).toHaveBeenCalledWith(baseData.items[0], 0);
    expect(routerPushMock).toHaveBeenCalledTimes(1);
  });

  it('honors a custom heading', () => {
    render(<BundleCompositionGrid data={baseData} heading="Bundle includes" />);
    expect(screen.getByText('Bundle includes')).toBeInTheDocument();
  });
});
