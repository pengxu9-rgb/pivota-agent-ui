/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PdpContainer } from './PdpContainer';
import type { PDPPayload } from '@/features/pdp/types';

const findSimilarProductsMock = vi.fn();

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

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock('@/lib/api', () => ({
  findSimilarProducts: (...args: any[]) => findSimilarProductsMock(...args),
  listQuestions: vi.fn(async () => ({ items: [] })),
  postQuestion: vi.fn(async () => ({ question_id: 1 })),
}));

vi.mock('sonner', () => ({
  toast: {
    message: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function buildSimilar(count: number) {
  return Array.from({ length: count }).map((_, index) => ({
    product_id: `prod_${index + 1}`,
    merchant_id: 'external_seed',
    title: `Product ${index + 1}`,
    image_url: `https://example.com/p_${index + 1}.jpg`,
    price: { amount: 99 + index, currency: 'USD' },
  }));
}

const payload: PDPPayload = {
  schema_version: '1.0.0',
  page_type: 'product_detail',
  tracking: {
    page_request_id: 'pr_test_reco',
    entry_point: 'agent',
  },
  product: {
    product_id: 'P_SIMILAR_001',
    merchant_id: 'external_seed',
    title: 'Similar Test Product',
    default_variant_id: 'V001',
    variants: [
      {
        variant_id: 'V001',
        title: 'Default',
        price: { current: { amount: 12.35, currency: 'USD' } },
        availability: { in_stock: true, available_quantity: 12 },
      },
    ],
    price: { current: { amount: 12.35, currency: 'USD' } },
    availability: { in_stock: true, available_quantity: 12 },
  },
  modules: [
    {
      module_id: 'm_media',
      type: 'media_gallery',
      priority: 100,
      data: { items: [{ type: 'image', url: 'https://example.com/hero.jpg' }] },
    },
    {
      module_id: 'm_price',
      type: 'price_promo',
      priority: 90,
      data: { price: { amount: 12.35, currency: 'USD' }, promotions: [] },
    },
    {
      module_id: 'm_details',
      type: 'product_details',
      priority: 70,
      data: { sections: [] },
    },
    {
      module_id: 'm_recs',
      type: 'recommendations',
      priority: 20,
      data: {
        strategy: 'related_products',
        items: buildSimilar(6),
      },
    },
  ],
  actions: [
    { action_type: 'add_to_cart', label: 'Add to Cart', priority: 20, target: {} },
    { action_type: 'buy_now', label: 'Buy Now', priority: 10, target: {} },
  ],
};

describe('PdpContainer recommendations interactions', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    findSimilarProductsMock.mockReset();
  });

  it('loads more recommendations in-page', async () => {
    findSimilarProductsMock.mockResolvedValue({
      strategy: 'related_products',
      products: buildSimilar(12).slice(6),
      has_more: false,
    });

    render(
      <PdpContainer
        payload={payload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /load more recommendations/i }));

    await waitFor(() => {
      expect(findSimilarProductsMock).toHaveBeenCalled();
    });

    expect(findSimilarProductsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: 'P_SIMILAR_001',
        merchant_id: 'external_seed',
        limit: 6,
        exclude_items: expect.arrayContaining([
          expect.objectContaining({ product_id: 'prod_1', merchant_id: 'external_seed', title: 'Product 1' }),
          expect.objectContaining({ product_id: 'prod_6', merchant_id: 'external_seed', title: 'Product 6' }),
        ]),
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('Product 12')).toBeInTheDocument();
    });
  });

  it('opens View all sheet and fetches more than first fold', async () => {
    findSimilarProductsMock.mockResolvedValue({
      strategy: 'related_products',
      products: buildSimilar(12).slice(6),
      has_more: false,
    });

    render(
      <PdpContainer
        payload={payload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /view all/i }));

    expect(screen.getByText(/all recommendations/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(findSimilarProductsMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getAllByText('Product 12').length).toBeGreaterThan(0);
    });
  });

  it('keeps the sheet load-more CTA pinned outside the scroll body', async () => {
    findSimilarProductsMock.mockResolvedValue({
      strategy: 'related_products',
      products: buildSimilar(12).slice(6),
      has_more: false,
    });

    render(
      <PdpContainer
        payload={payload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /view all/i }));

    const footer = await screen.findByTestId('responsive-sheet-footer');
    const body = screen.getByTestId('responsive-sheet-body');
    const loadMoreButton = within(footer).getByRole('button');

    expect(footer).toContainElement(loadMoreButton);
    expect(body).not.toContainElement(loadMoreButton);
  });

  it('shows low-confidence hint and stops misleading load-more when backend underfills', async () => {
    findSimilarProductsMock.mockResolvedValue({
      strategy: 'related_products',
      products: buildSimilar(6),
      metadata: {
        low_confidence: true,
        similar_confidence: 'low',
        low_confidence_reason_codes: ['UNDERFILL_FOR_QUALITY'],
      },
    });

    render(
      <PdpContainer
        payload={payload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /load more recommendations/i }));

    await waitFor(() => {
      expect(findSimilarProductsMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText('Showing the best matches available for now.')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /load more recommendations/i })).not.toBeInTheDocument();
    });
  });

  it('deduplicates repeated recommendation titles from the same merchant', async () => {
    const duplicatePayload: PDPPayload = {
      ...payload,
      modules: payload.modules.map((module) =>
        module.type !== 'recommendations'
          ? module
          : {
              ...module,
              data: {
                strategy: 'related_products',
                items: [
                  {
                    product_id: 'ext_rose_prick_30',
                    merchant_id: 'external_seed',
                    title: 'Rose Prick Eau de Parfum',
                    image_url: 'https://example.com/rose-prick-30.jpg',
                    price: { amount: 180, currency: 'USD' },
                  },
                  {
                    product_id: 'ext_rose_prick_50',
                    merchant_id: 'external_seed',
                    title: 'Rose Prick Eau de Parfum',
                    image_url: 'https://example.com/rose-prick-50.jpg',
                    price: { amount: 182, currency: 'USD' },
                  },
                  {
                    product_id: 'ext_electric_cherry_30',
                    merchant_id: 'external_seed',
                    title: 'Electric Cherry Eau de Parfum',
                    image_url: 'https://example.com/electric-cherry-30.jpg',
                    price: { amount: 175, currency: 'USD' },
                  },
                ],
              },
            },
      ),
    };

    render(
      <PdpContainer
        payload={duplicatePayload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Rose Prick Eau de Parfum')).toHaveLength(1);
    });
    expect(screen.getAllByText('Electric Cherry Eau de Parfum')).toHaveLength(1);
  });

  it('backfills deduped first-fold recommendations back to six visible items', async () => {
    findSimilarProductsMock.mockResolvedValue({
      strategy: 'related_products',
      products: buildSimilar(9).slice(3),
      has_more: true,
    });

    const underfilledPayload: PDPPayload = {
      ...payload,
      modules: payload.modules.map((module) =>
        module.type !== 'recommendations'
          ? module
          : {
              ...module,
              data: {
                strategy: 'related_products',
                items: [
                  { product_id: 'dup_1a', merchant_id: 'external_seed', title: 'Product 1', image_url: 'https://example.com/dup_1a.jpg', price: { amount: 99, currency: 'USD' } },
                  { product_id: 'dup_1b', merchant_id: 'external_seed', title: 'Product 1', image_url: 'https://example.com/dup_1b.jpg', price: { amount: 99, currency: 'USD' } },
                  { product_id: 'dup_2a', merchant_id: 'external_seed', title: 'Product 2', image_url: 'https://example.com/dup_2a.jpg', price: { amount: 100, currency: 'USD' } },
                  { product_id: 'dup_2b', merchant_id: 'external_seed', title: 'Product 2', image_url: 'https://example.com/dup_2b.jpg', price: { amount: 100, currency: 'USD' } },
                  { product_id: 'dup_3a', merchant_id: 'external_seed', title: 'Product 3', image_url: 'https://example.com/dup_3a.jpg', price: { amount: 101, currency: 'USD' } },
                  { product_id: 'dup_3b', merchant_id: 'external_seed', title: 'Product 3', image_url: 'https://example.com/dup_3b.jpg', price: { amount: 101, currency: 'USD' } },
                ],
              },
            },
      ),
    };

    render(
      <PdpContainer
        payload={underfilledPayload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    await waitFor(() => {
      expect(findSimilarProductsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          product_id: 'P_SIMILAR_001',
          merchant_id: 'external_seed',
          limit: 6,
          exclude_items: expect.arrayContaining([
            expect.objectContaining({ product_id: 'dup_1a', merchant_id: 'external_seed', title: 'Product 1' }),
            expect.objectContaining({ product_id: 'dup_2a', merchant_id: 'external_seed', title: 'Product 2' }),
            expect.objectContaining({ product_id: 'dup_3a', merchant_id: 'external_seed', title: 'Product 3' }),
          ]),
          timeout_ms: 7000,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Product 6')).toBeInTheDocument();
    });
  });

  it('renders recommendations from a raw similar module when adapter normalization drifts', async () => {
    const similarOnlyPayload: PDPPayload = {
      ...payload,
      modules: payload.modules.map((module) =>
        module.type === 'recommendations'
          ? {
              ...module,
              type: 'similar' as any,
              data: {
                strategy: 'related_products',
                items: buildSimilar(2),
              },
            }
          : module,
      ),
      x_recommendations_state: 'ready',
    };

    render(
      <PdpContainer
        payload={similarOnlyPayload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    expect(screen.getByText('You May Also Like')).toBeInTheDocument();
    expect(screen.getByText('Product 1')).toBeInTheDocument();
    expect(screen.getByText('Product 2')).toBeInTheDocument();
  });
});
