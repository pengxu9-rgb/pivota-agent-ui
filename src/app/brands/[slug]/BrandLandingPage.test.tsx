import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandLandingPage } from './BrandLandingPage';

const getBrandDiscoveryFeedMock = vi.fn();
const getBrowseHistoryMock = vi.fn();
let authUser: { id: string } | null = null;

let intersectionCallback: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null;

vi.mock('@/lib/api', () => ({
  getBrandDiscoveryFeed: (...args: unknown[]) => getBrandDiscoveryFeedMock(...args),
  getBrowseHistory: (...args: unknown[]) => getBrowseHistoryMock(...args),
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector?: (state: { user: { id: string } | null }) => unknown) => {
    const state = { user: authUser };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/components/product/ProductCard', () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

describe('BrandLandingPage', () => {
  beforeEach(() => {
    authUser = null;
    intersectionCallback = null;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: typeof intersectionCallback) {
          intersectionCallback = cb as any;
        }
        observe() {}
        disconnect() {}
      },
    );
    getBrowseHistoryMock.mockResolvedValue({ items: [], total: 0 });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    getBrandDiscoveryFeedMock.mockReset();
    getBrowseHistoryMock.mockReset();
  });

  it('loads popular products by default and resets to page 1 for brand search', async () => {
    getBrandDiscoveryFeedMock.mockResolvedValue({
      products: [
        {
          product_id: 'prod_1',
          merchant_id: 'merch_1',
          title: 'Rose Prick Eau de Parfum',
          description: 'Fragrance',
          price: 395,
          currency: 'USD',
          image_url: 'https://example.com/1.jpg',
          in_stock: true,
        },
      ],
      metadata: { has_more: false },
      query_text: '',
      page_info: { page: 1, page_size: 1, total: 1, has_more: false },
    });

    render(
      <BrandLandingPage
        slug="tom-ford"
        initialBrandName="Tom Ford"
        initialReturnUrl="/products/ext_123"
      />,
    );

    await waitFor(() => {
      expect(getBrandDiscoveryFeedMock).toHaveBeenCalledWith(
        expect.objectContaining({
          brandName: 'Tom Ford',
          sort: 'popular',
          page: 1,
        }),
      );
    });
    expect(screen.getByText('Rose Prick Eau de Parfum')).toBeInTheDocument();
    expect(getBrowseHistoryMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('Search within Tom Ford'), {
      target: { value: 'cherry' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(getBrandDiscoveryFeedMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          brandName: 'Tom Ford',
          query: 'cherry',
          sort: 'popular',
          page: 1,
        }),
      );
    });
  });

  it('hydrates remote browse history only for authenticated users', async () => {
    authUser = { id: 'user_123' };
    getBrandDiscoveryFeedMock.mockResolvedValue({
      products: [],
      metadata: { has_more: false },
      query_text: '',
      page_info: { page: 1, page_size: 0, total: 0, has_more: false },
    });

    render(
      <BrandLandingPage
        slug="tom-ford"
        initialBrandName="Tom Ford"
        initialReturnUrl="/products/ext_123"
      />,
    );

    await waitFor(() => {
      expect(getBrowseHistoryMock).toHaveBeenCalledWith(40);
    });
  });

  it('switches sort and dedupes products when loading more pages', async () => {
    getBrandDiscoveryFeedMock
      .mockResolvedValueOnce({
        products: [
          {
            product_id: 'prod_1',
            merchant_id: 'merch_1',
            title: 'Bitter Peach',
            description: 'Fragrance',
            price: 420,
            currency: 'USD',
            image_url: 'https://example.com/1.jpg',
            in_stock: true,
          },
        ],
        metadata: { has_more: true },
        query_text: '',
        page_info: { page: 1, page_size: 1, total: 3, has_more: true },
      })
      .mockResolvedValueOnce({
        products: [
          {
            product_id: 'prod_1',
            merchant_id: 'merch_1',
            title: 'Bitter Peach',
            description: 'Fragrance',
            price: 420,
            currency: 'USD',
            image_url: 'https://example.com/1.jpg',
            in_stock: true,
          },
          {
            product_id: 'prod_2',
            merchant_id: 'merch_2',
            title: 'Electric Cherry',
            description: 'Fragrance',
            price: 395,
            currency: 'USD',
            image_url: 'https://example.com/2.jpg',
            in_stock: true,
          },
        ],
        metadata: { has_more: false },
        query_text: '',
        page_info: { page: 2, page_size: 2, total: 2, has_more: false },
      })
      .mockResolvedValueOnce({
        products: [
          {
            product_id: 'prod_3',
            merchant_id: 'merch_3',
            title: 'Lost Cherry',
            description: 'Fragrance',
            price: 550,
            currency: 'USD',
            image_url: 'https://example.com/3.jpg',
            in_stock: true,
          },
        ],
        metadata: { has_more: false },
        query_text: '',
        page_info: { page: 1, page_size: 1, total: 1, has_more: false },
      });

    render(
      <BrandLandingPage
        slug="tom-ford"
        initialBrandName="Tom Ford"
        initialReturnUrl="/products/ext_123"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Bitter Peach')).toBeInTheDocument();
    });

    await act(async () => {
      intersectionCallback?.([{ isIntersecting: true }]);
    });

    await waitFor(() => {
      expect(screen.getByText('Electric Cherry')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Bitter Peach')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Price: High to Low' }));

    await waitFor(() => {
      expect(getBrandDiscoveryFeedMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          sort: 'price_desc',
          page: 1,
        }),
      );
    });
    expect(screen.getByText('Lost Cherry')).toBeInTheDocument();
  });
});
