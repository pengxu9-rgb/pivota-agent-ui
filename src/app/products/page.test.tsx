import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProductsPage from './page';

const sendMessageMock = vi.fn();
const getShoppingDiscoveryFeedMock = vi.fn();
const getBrowseHistoryMock = vi.fn();
const readLocalBrowseHistoryMock = vi.fn();
const mergeDiscoveryRecentViewsMock = vi.fn();
const openCartMock = vi.fn();

let authUser: { id: string } | null = null;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('framer-motion', () => {
  const Motion = new Proxy(
    {},
    {
      get: () => {
        return ({
          children,
          initial: _initial,
          animate: _animate,
          exit: _exit,
          transition: _transition,
          ...props
        }: React.HTMLAttributes<HTMLDivElement> & {
          initial?: unknown;
          animate?: unknown;
          exit?: unknown;
          transition?: unknown;
        }) => <div {...props}>{children}</div>;
      },
    },
  );

  return {
    motion: Motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock('@/components/product/ProductCard', () => ({
  default: ({ title }: { title: string }) => <div data-testid="product-card">{title}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({
    children,
    onClick,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/store/cartStore', () => ({
  useCartStore: (
    selector?: (state: { items: Array<{ quantity: number }>; open: typeof openCartMock }) => unknown,
  ) => {
    const state = { items: [], open: openCartMock };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector?: (state: { user: { id: string } | null }) => unknown) => {
    const state = { user: authUser };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('@/lib/api', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
  getShoppingDiscoveryFeed: (...args: unknown[]) => getShoppingDiscoveryFeedMock(...args),
  getBrowseHistory: (...args: unknown[]) => getBrowseHistoryMock(...args),
}));

vi.mock('@/lib/browseHistoryStorage', () => ({
  readLocalBrowseHistory: (...args: unknown[]) => readLocalBrowseHistoryMock(...args),
  mergeDiscoveryRecentViews: (...args: unknown[]) => mergeDiscoveryRecentViewsMock(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('ProductsPage', () => {
  beforeEach(() => {
    authUser = { id: 'user_123' };
    readLocalBrowseHistoryMock.mockReturnValue([
      { product_id: 'local_prod', merchant_id: 'local_merch', title: 'Local product' },
    ]);
    mergeDiscoveryRecentViewsMock.mockImplementation(
      ({
        accountItems = [],
        localItems = [],
        limit = 50,
      }: {
        accountItems?: unknown[];
        localItems?: unknown[];
        limit?: number;
      }) => [...accountItems, ...localItems].slice(0, limit),
    );
    getShoppingDiscoveryFeedMock.mockResolvedValue({
      products: [
        {
          product_id: 'prod_1',
          merchant_id: 'merch_1',
          title: 'Instant Product',
          description: 'Curated discovery result',
          price: 24,
          currency: 'USD',
          image_url: '/placeholder.svg',
        },
      ],
      metadata: { has_more: false },
      page_info: { page: 1, page_size: 1, total: 1, has_more: false },
    });
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    sendMessageMock.mockReset();
    getShoppingDiscoveryFeedMock.mockReset();
    getBrowseHistoryMock.mockReset();
    readLocalBrowseHistoryMock.mockReset();
    mergeDiscoveryRecentViewsMock.mockReset();
    openCartMock.mockReset();
  });

  it('loads browse discovery before remote history resolves and does not replay when it arrives', async () => {
    const remoteHistory = deferred<{ items: Array<{ product_id: string; merchant_id: string }>; total: number }>();
    getBrowseHistoryMock.mockReturnValue(remoteHistory.promise);

    render(<ProductsPage />);

    await waitFor(() => {
      expect(getShoppingDiscoveryFeedMock).toHaveBeenCalledWith(
        expect.objectContaining({
          surface: 'browse_products',
          userId: 'user_123',
          recentViews: [expect.objectContaining({ product_id: 'local_prod' })],
        }),
      );
    });

    expect(getBrowseHistoryMock).toHaveBeenCalledWith(50);
    expect(await screen.findByText('Instant Product')).toBeInTheDocument();
    expect(getShoppingDiscoveryFeedMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      remoteHistory.resolve({
        items: [{ product_id: 'remote_prod', merchant_id: 'remote_merch' }],
        total: 1,
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mergeDiscoveryRecentViewsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          accountItems: [expect.objectContaining({ product_id: 'remote_prod' })],
          localItems: [expect.objectContaining({ product_id: 'local_prod' })],
          limit: 50,
        }),
      );
    });

    expect(getShoppingDiscoveryFeedMock).toHaveBeenCalledTimes(1);
  });
});
