import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProductsPage from './ProductsBrowseClient';

const getShoppingDiscoveryFeedMock = vi.fn();
const getMerchantProductsFeedMock = vi.fn();
const openCartMock = vi.fn();
let cartItems: Array<{ quantity: number }> = [];
let intersectionCallback: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null;

vi.mock('framer-motion', () => ({
  motion: {
    section: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
      <section {...props}>{children}</section>
    ),
  },
}));

vi.mock('@/lib/api', () => ({
  getShoppingDiscoveryFeed: (...args: unknown[]) => getShoppingDiscoveryFeedMock(...args),
  getMerchantProductsFeed: (...args: unknown[]) => getMerchantProductsFeedMock(...args),
}));

vi.mock('@/components/catalog/CatalogProductCard', () => ({
  CatalogProductCard: ({ product }: { product: { title: string } }) => <div>{product.title}</div>,
  CatalogProductSkeleton: () => <div data-testid="catalog-product-skeleton" />,
}));

vi.mock('@/store/cartStore', () => ({
  useCartStore: (selector?: (state: { items: Array<{ quantity: number }>; open: typeof openCartMock }) => unknown) => {
    const state = {
      items: cartItems,
      open: openCartMock,
    };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe('ProductsPage', () => {
  beforeEach(() => {
    cartItems = [];
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
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    getShoppingDiscoveryFeedMock.mockReset();
    getMerchantProductsFeedMock.mockReset();
    openCartMock.mockReset();
    window.history.pushState({}, '', '/products');
  });

  it('keeps the first browse request on the lighter limit with an explicit timeout budget', async () => {
    getShoppingDiscoveryFeedMock.mockResolvedValue({
      products: [
        {
          product_id: 'prod_1',
          merchant_id: 'merch_1',
          title: 'Barrier Serum',
        },
      ],
      cursor_info: {
        next_cursor: 'cursor_2',
        has_next_page: true,
      },
      page_info: {
        page: 1,
        page_size: 1,
        has_more: true,
      },
    });

    render(<ProductsPage />);

    await waitFor(() => {
      expect(getShoppingDiscoveryFeedMock).toHaveBeenCalledWith(
        expect.objectContaining({
          surface: 'browse_products',
          cursor: null,
          limit: 24,
          timeout_ms: 15000,
          recentViews: [],
          recentQueries: [],
        }),
      );
    });

    expect(screen.getByText('Barrier Serum')).toBeInTheDocument();
  });

  it('uses a denser follow-up page size for infinite scroll after the first page renders', async () => {
    getShoppingDiscoveryFeedMock
      .mockResolvedValueOnce({
        products: [
          {
            product_id: 'prod_1',
            merchant_id: 'merch_1',
            title: 'Barrier Serum',
          },
        ],
        cursor_info: {
          next_cursor: 'cursor_2',
          has_next_page: true,
        },
        page_info: {
          page: 1,
          page_size: 1,
          has_more: true,
        },
      })
      .mockResolvedValueOnce({
        products: [
          {
            product_id: 'prod_2',
            merchant_id: 'merch_1',
            title: 'Cloud Cream',
          },
        ],
        cursor_info: {
          next_cursor: null,
          has_next_page: false,
        },
        page_info: {
          page: 2,
          page_size: 1,
          has_more: false,
        },
      });

    render(<ProductsPage />);

    await waitFor(() => {
      expect(getShoppingDiscoveryFeedMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          cursor: null,
          limit: 24,
          timeout_ms: 15000,
        }),
      );
    });

    await act(async () => {
      intersectionCallback?.([{ isIntersecting: true }]);
    });

    await waitFor(() => {
      expect(getShoppingDiscoveryFeedMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          cursor: 'cursor_2',
          limit: 36,
          timeout_ms: 15000,
        }),
      );
    });

    expect(screen.getByText('Cloud Cream')).toBeInTheDocument();
  });

  it('does not start duplicate load-more requests while the same cursor is in flight', async () => {
    let resolveSecondPage: ((value: unknown) => void) | null = null;

    getShoppingDiscoveryFeedMock
      .mockResolvedValueOnce({
        products: [
          {
            product_id: 'prod_1',
            merchant_id: 'merch_1',
            title: 'Barrier Serum',
          },
        ],
        cursor_info: {
          next_cursor: 'cursor_2',
          has_next_page: true,
        },
        page_info: {
          page: 1,
          page_size: 1,
          has_more: true,
        },
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecondPage = resolve;
          }),
      );

    render(<ProductsPage />);

    await waitFor(() => {
      expect(getShoppingDiscoveryFeedMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('Barrier Serum')).toBeInTheDocument();

    await act(async () => {
      intersectionCallback?.([{ isIntersecting: true }]);
      intersectionCallback?.([{ isIntersecting: true }]);
    });

    expect(getShoppingDiscoveryFeedMock).toHaveBeenCalledTimes(2);
    expect(getShoppingDiscoveryFeedMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        cursor: 'cursor_2',
        limit: 36,
        timeout_ms: 15000,
      }),
    );

    await act(async () => {
      resolveSecondPage?.({
        products: [
          {
            product_id: 'prod_2',
            merchant_id: 'merch_1',
            title: 'Cloud Cream',
          },
        ],
        cursor_info: {
          next_cursor: null,
          has_next_page: false,
        },
        page_info: {
          page: 2,
          page_size: 1,
          has_more: false,
        },
      });
    });

    expect(screen.getByText('Cloud Cream')).toBeInTheDocument();
  });

  it('uses merchant-scoped catalog data when merchant_id is present', async () => {
    window.history.pushState({}, '', '/products?merchant_id=merch_shop');
    getMerchantProductsFeedMock.mockResolvedValue({
      products: [
        {
          product_id: 'prod_shop',
          merchant_id: 'merch_shop',
          title: 'Shopify Serum',
        },
      ],
      cursor_info: {
        next_cursor: 'page:2',
        has_next_page: true,
      },
      page_info: {
        page: 1,
        page_size: 1,
        has_more: true,
      },
    });

    render(<ProductsPage />);

    await waitFor(() => {
      expect(getMerchantProductsFeedMock).toHaveBeenCalledWith(
        expect.objectContaining({
          merchant_id: 'merch_shop',
          page: 1,
          limit: 24,
          timeout_ms: 15000,
        }),
      );
    });

    expect(getShoppingDiscoveryFeedMock).not.toHaveBeenCalled();
    expect(screen.getByText('Merchant products')).toBeInTheDocument();
    expect(screen.getByText('Shopify Serum')).toBeInTheDocument();
  });
});
