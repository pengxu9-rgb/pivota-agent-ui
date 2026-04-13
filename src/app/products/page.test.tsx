import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProductsPage from './page';

const getShoppingDiscoveryFeedMock = vi.fn();
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
    openCartMock.mockReset();
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
});
