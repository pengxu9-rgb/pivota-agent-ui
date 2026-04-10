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

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe('optimizeRecommendationImageUrl', () => {
  it('unwraps proxied Shopify URLs and adds width hints directly', () => {
    const out = optimizeRecommendationImageUrl(
      '/api/image-proxy?url=https%3A%2F%2Fcdn.shopify.com%2Fs%2Ffiles%2F1%2Ftest.jpg',
      420,
    );
    expect(out).toBe('https://cdn.shopify.com/s/files/1/test.jpg?width=420');
  });

  it('unwraps nested image-proxy URL once', () => {
    const nested = `/api/image-proxy?url=${encodeURIComponent(
      '/api/image-proxy?url=https%3A%2F%2Fcdn.shopify.com%2Fs%2Ffiles%2F1%2Fnested.jpg',
    )}`;
    const out = optimizeRecommendationImageUrl(nested, 512);
    expect(out).toBe('https://cdn.shopify.com/s/files/1/nested.jpg?width=512');
  });

  it('keeps non-proxy relative URLs unchanged', () => {
    const out = optimizeRecommendationImageUrl('/images/local-product.jpg');
    expect(out).toBe('/images/local-product.jpg');
  });

  it('removes stale Shopify version params and asset hash suffixes', () => {
    const out = optimizeRecommendationImageUrl(
      'https://cdn.shopify.com/s/files/1/0761/9690/5173/files/tf_sku_T1QT01_3000x3000_0_1cb1287f-acde-4d9e-8c24-aa58cf23e5d7.png?v=1774376799',
      360,
    );
    expect(out).toBe(
      'https://cdn.shopify.com/s/files/1/0761/9690/5173/files/tf_sku_T1QT01_3000x3000_0.png?width=360',
    );
  });

  it('canonicalizes known Tom Ford Shopify assets onto official Shopify files URLs', () => {
    const out = optimizeRecommendationImageUrl(
      'https://cdn.shopify.com/s/files/1/0761/9690/5173/files/tf_sku_T1QS01_2000x2000_1.jpg',
      360,
    );
    expect(out).toBe(
      'https://cdn.shopify.com/s/files/1/0761/9690/5173/files/tf_sku_T1QS01_2000x2000_1.jpg?width=360',
    );
  });

  it('normalizes encoded whitespace around underscores in Tom Ford asset names', () => {
    const out = optimizeRecommendationImageUrl(
      'https://sdcdn.io/tf/tf_sku_T2SS02%20_3000x3000_1.png?width=650px&height=750px',
      360,
    );
    expect(out).toBe(
      'https://cdn.shopify.com/s/files/1/0761/9690/5173/files/tf_sku_T2SS02_3000x3000_1.png?width=360',
    );
  });

  it('remaps known missing Tom Ford assets onto existing Shopify siblings', () => {
    const out = optimizeRecommendationImageUrl(
      'https://sdcdn.io/tf/tf_sku_T2SS02%20_3000x3000_0.png?width=650px&height=750px',
      360,
    );
    expect(out).toBe(
      'https://cdn.shopify.com/s/files/1/0761/9690/5173/files/tf_sku_T2SS02_3000x3000_1.png?width=360',
    );
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

    fireEvent.click(screen.getByRole('button', { name: /load more similar products/i }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('uses canonical product links for external seed recommendations', () => {
    render(<RecommendationsGrid data={data} visibleCount={2} />);

    const [firstLink] = screen.getAllByRole('link', { name: /product 1/i });
    const [secondLink] = screen.getAllByRole('link', { name: /product 2/i });

    expect(firstLink).toHaveAttribute('href', '/products/prod_1');
    expect(secondLink).toHaveAttribute('href', '/products/prod_2');
  });

  it('renders a mainline-only status note when provided', () => {
    render(
      <RecommendationsGrid
        data={data}
        visibleCount={2}
        statusNoteTitle="Mainline only"
        statusNote="Exact like-for-like matches were limited, so this section stays on the mainline instead of being padded with fallback results."
      />,
    );

    expect(screen.getByText('Mainline only')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Exact like-for-like matches were limited, so this section stays on the mainline instead of being padded with fallback results.',
      ),
    ).toBeInTheDocument();
  });
});
