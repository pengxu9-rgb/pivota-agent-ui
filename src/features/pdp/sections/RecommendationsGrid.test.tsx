/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RecommendationsGrid, optimizeRecommendationImageUrl } from './RecommendationsGrid';

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

describe('optimizeRecommendationImageUrl', () => {
  it('adds width hint to proxied image URLs', () => {
    const out = optimizeRecommendationImageUrl(
      '/api/image-proxy?url=https%3A%2F%2Fcdn.shopify.com%2Fs%2Ffiles%2F1%2Ftest.jpg',
      420,
    );
    const parsed = new URL(out, 'http://localhost');
    expect(parsed.pathname).toBe('/api/image-proxy');
    expect(parsed.searchParams.get('w')).toBe('420');
    const inner = new URL(parsed.searchParams.get('url') || '');
    expect(inner.toString()).toBe('https://cdn.shopify.com/s/files/1/test.jpg?width=420');
  });

  it('unwraps nested image-proxy URL once', () => {
    const nested = `/api/image-proxy?url=${encodeURIComponent(
      '/api/image-proxy?url=https%3A%2F%2Fcdn.shopify.com%2Fs%2Ffiles%2F1%2Fnested.jpg',
    )}`;
    const out = optimizeRecommendationImageUrl(nested, 512);
    const parsed = new URL(out, 'http://localhost');
    expect(parsed.pathname).toBe('/api/image-proxy');
    const inner = new URL(parsed.searchParams.get('url') || '');
    expect(inner.toString()).toBe('https://cdn.shopify.com/s/files/1/nested.jpg?width=512');
    expect(parsed.searchParams.get('w')).toBe('512');
  });

  it('keeps non-proxy relative URLs unchanged', () => {
    const out = optimizeRecommendationImageUrl('/images/local-product.jpg');
    expect(out).toBe('/images/local-product.jpg');
  });
});

describe('RecommendationsGrid', () => {
  const data = {
    strategy: 'related_products',
    items: Array.from({ length: 10 }).map((_, idx) => ({
      product_id: `prod_${idx + 1}`,
      merchant_id: 'external_seed',
      title: `Product ${idx + 1}`,
      image_url: `https://example.com/p_${idx + 1}.jpg`,
      price: { amount: 99 + idx, currency: 'USD' },
    })),
  };

  it('renders only visibleCount items and triggers open/load callbacks', () => {
    const onOpenAll = vi.fn();
    const onLoadMore = vi.fn();

    render(
      <RecommendationsGrid
        data={data}
        visibleCount={6}
        canLoadMore
        isLoadingMore={false}
        onOpenAll={onOpenAll}
        onLoadMore={onLoadMore}
      />,
    );

    expect(screen.getByText('Product 1')).toBeInTheDocument();
    expect(screen.getByText('Product 6')).toBeInTheDocument();
    expect(screen.queryByText('Product 7')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /view all/i }));
    expect(onOpenAll).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /load more recommendations/i }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});
