import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BeautyReviewsSection } from './BeautyReviewsSection';
import { ReviewsPreview } from './ReviewsPreview';

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

const baseReviewsData = {
  scale: 5,
  rating: 4.6,
  review_count: 8,
  preview_items: [],
};

describe('Reviews text rendering', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders title and snippet in ReviewsPreview', () => {
    render(
      <ReviewsPreview
        data={{
          ...baseReviewsData,
          preview_items: [
            {
              review_id: 'r_1',
              rating: 5,
              title: 'Great product title',
              text_snippet: 'Body summary text',
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('Great product title')).toBeInTheDocument();
    expect(screen.getByText('Body summary text')).toBeInTheDocument();
  });

  it('shows fallback text when title and snippet are both empty in BeautyReviewsSection', () => {
    render(
      <BeautyReviewsSection
        data={{
          ...baseReviewsData,
          preview_items: [
            {
              review_id: 'r_2',
              rating: 4,
              title: '',
              text_snippet: '',
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('No written details provided.')).toBeInTheDocument();
  });

  it('does not render an empty filter rail placeholder', () => {
    render(
      <BeautyReviewsSection
        data={{
          ...baseReviewsData,
          filter_chips: [],
        }}
        showEmpty
      />,
    );

    expect(screen.queryByText('No filters yet')).not.toBeInTheDocument();
  });

  it('renders brand card as a link when brandHref is provided', () => {
    render(
      <BeautyReviewsSection
        data={{
          ...baseReviewsData,
          brand_card: {
            name: 'Tom Ford Beauty',
            subtitle: 'Fragrance and makeup',
          },
        }}
        brandHref="/brands/tom-ford?name=Tom%20Ford"
      />,
    );

    const link = screen.getByRole('link', { name: /Tom Ford Beauty/i });
    expect(link).toHaveAttribute('href', '/brands/tom-ford?name=Tom%20Ford');
    expect(screen.getByText('Explore the full collection')).toBeInTheDocument();
    expect(screen.queryByText('Fragrance and makeup')).not.toBeInTheDocument();
  });

  it('renders review scope label and tabs when product-line aggregation is present', () => {
    render(
      <BeautyReviewsSection
        data={{
          ...baseReviewsData,
          scope_label: 'Based on product-line reviews (42)',
          tabs: [
            { id: 'product_line', label: 'Product line', count: 42, default: true },
            { id: 'exact_item', label: 'Exact item', count: 12, default: false },
          ],
        }}
      />,
    );

    expect(screen.getByText('Based on product-line reviews (42)')).toBeInTheDocument();
    expect(screen.getByText('Product line (42)')).toBeInTheDocument();
    expect(screen.getByText('Exact item (12)')).toBeInTheDocument();
  });

  it('invokes scope selection when a non-default review scope tab is clicked', () => {
    const onSelectScope = vi.fn();

    render(
      <BeautyReviewsSection
        data={{
          ...baseReviewsData,
          scope_label: 'Based on product-line reviews (42)',
          tabs: [
            { id: 'product_line', label: 'Product line', count: 42, default: true },
            { id: 'exact_item', label: 'Exact item', count: 12, default: false },
          ],
        }}
        onSelectScope={onSelectScope}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Exact item (12)' }));
    expect(onSelectScope).toHaveBeenCalledWith('exact_item');
  });
});
