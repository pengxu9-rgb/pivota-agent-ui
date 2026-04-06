import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandLandingPage } from './BrandLandingPage';

const getBrandDiscoveryFeedMock = vi.fn();
const getBrowseHistoryMock = vi.fn();
const addItemMock = vi.fn();
const openCartMock = vi.fn();
const pushMock = vi.fn();
const replaceMock = vi.fn();
let authUser: { id: string } | null = null;
let cartItems: Array<{ quantity: number }> = [];

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

vi.mock('@/store/cartStore', () => ({
  useCartStore: (selector?: (state: {
    items: Array<{ quantity: number }>;
    addItem: typeof addItemMock;
    open: typeof openCartMock;
  }) => unknown) => {
    const state = {
      items: cartItems,
      addItem: addItemMock,
      open: openCartMock,
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
  usePathname: () => '/brands/tom-ford',
}));

vi.mock('next/image', () => ({
  default: ({
    alt,
    fill: _fill,
    unoptimized: _unoptimized,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean;
    unoptimized?: boolean;
  }) => <img alt={alt || ''} {...props} />,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
  },
}));

describe('BrandLandingPage', () => {
  beforeEach(() => {
    authUser = null;
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
    getBrowseHistoryMock.mockResolvedValue({ items: [], total: 0 });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    getBrandDiscoveryFeedMock.mockReset();
    getBrowseHistoryMock.mockReset();
    addItemMock.mockReset();
    openCartMock.mockReset();
    pushMock.mockReset();
    replaceMock.mockReset();
  });

  it('renders the new mobile-first shell and resets to page 1 for brand search', async () => {
    getBrandDiscoveryFeedMock.mockResolvedValue({
      products: [
        {
          product_id: 'prod_1',
          merchant_id: 'merch_1',
          title: 'Rose Prick Eau de Parfum',
          description: 'Fragrance',
          category: 'fragrance',
          price: 395,
          currency: 'USD',
          image_url: 'https://example.com/1.jpg',
          in_stock: true,
          tags: ['bestseller'],
          review_summary: { rating: 4.8, review_count: 128, scale: 5 },
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
    expect(screen.queryByText('Summer Glow Sale')).not.toBeInTheDocument();
    expect(screen.queryByText('Brand story')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Brand Home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open brand search' })).toBeInTheDocument();
    expect(getBrowseHistoryMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Open brand search' }));
    fireEvent.change(screen.getByPlaceholderText('Search Tom Ford products'), {
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

  it('switches sort, shows category chips, and dedupes products when loading more pages', async () => {
    getBrandDiscoveryFeedMock
      .mockResolvedValueOnce({
        products: [
          {
            product_id: 'prod_1',
            merchant_id: 'merch_1',
            title: 'Bitter Peach',
            description: 'Fragrance',
            category: 'fragrance',
            price: 420,
            currency: 'USD',
            image_url: 'https://example.com/1.jpg',
            in_stock: true,
            review_summary: { rating: 4.7, review_count: 88, scale: 5 },
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
            category: 'fragrance',
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
            category: 'fragrance',
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
            category: 'fragrance',
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

    expect(screen.getByRole('button', { name: /Fragrance/i })).toBeInTheDocument();

    await act(async () => {
      intersectionCallback?.([{ isIntersecting: true }]);
    });

    await waitFor(() => {
      expect(screen.getByText('Electric Cherry')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Bitter Peach')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
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

  it('requests real category scope when a brand category chip is selected', async () => {
    getBrandDiscoveryFeedMock
      .mockResolvedValueOnce({
        products: [
          {
            product_id: 'prod_1',
            merchant_id: 'merch_1',
            title: 'Gloss Bomb',
            description: 'Lip',
            category: 'lip',
            price: 22,
            currency: 'USD',
            image_url: 'https://example.com/1.jpg',
            in_stock: true,
          },
          {
            product_id: 'prod_2',
            merchant_id: 'merch_1',
            title: 'Soft Matte Foundation',
            description: 'Complexion',
            category: 'complexion',
            price: 39,
            currency: 'USD',
            image_url: 'https://example.com/2.jpg',
            in_stock: true,
          },
        ],
        metadata: {
          has_more: false,
          facets: {
            categories: [
              { value: 'Lip', count: 1 },
              { value: 'Complexion', count: 1 },
            ],
          },
        },
        query_text: '',
        page_info: { page: 1, page_size: 2, total: 2, has_more: false },
      })
      .mockResolvedValueOnce({
        products: [
          {
            product_id: 'prod_1',
            merchant_id: 'merch_1',
            title: 'Gloss Bomb',
            description: 'Lip',
            category: 'lip',
            price: 22,
            currency: 'USD',
            image_url: 'https://example.com/1.jpg',
            in_stock: true,
          },
        ],
        metadata: {
          has_more: false,
          facets: {
            categories: [
              { value: 'Lip', count: 1 },
              { value: 'Complexion', count: 1 },
            ],
          },
        },
        query_text: '',
        page_info: { page: 1, page_size: 1, total: 1, has_more: false },
      });

    render(
      <BrandLandingPage
        slug="fenty-beauty"
        initialBrandName="Fenty Beauty"
        initialReturnUrl="/products/ext_123"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Gloss Bomb')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Lip/i }));

    await waitFor(() => {
      expect(getBrandDiscoveryFeedMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          brandName: 'Fenty Beauty',
          category: 'Lip',
          page: 1,
        }),
      );
    });

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(
        expect.stringContaining('category=Lip'),
        { scroll: false },
      );
    });
  });

  it('shows the campaign banner only when real banner config is present', async () => {
    getBrandDiscoveryFeedMock.mockResolvedValue({
      products: [
        {
          product_id: 'prod_1',
          merchant_id: 'merch_1',
          title: 'Gloss Bomb Universal Lip Luminizer',
          description: 'Lip',
          category: 'lip',
          price: 21,
          currency: 'USD',
          image_url: 'https://example.com/1.jpg',
          in_stock: true,
        },
      ],
      metadata: {
        has_more: false,
        brand_campaign: {
          enabled: true,
          eyebrow: 'Summer Glow Sale',
          title: 'Summer Glow Sale',
          subtitle: 'Up to 30% off summer essentials',
          cta_label: 'Shop now',
          cta_href: '#brand-products',
        },
      },
      query_text: '',
      page_info: { page: 1, page_size: 1, total: 1, has_more: false },
    });

    render(
      <BrandLandingPage
        slug="fenty-beauty"
        initialBrandName="Fenty Beauty"
        initialReturnUrl="/products/ext_123"
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Summer Glow Sale')).toHaveLength(2);
    });

    expect(screen.getByText('Up to 30% off summer essentials')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Shop now' })).toBeInTheDocument();
  });

  it('shows brand story only when real brand story metadata is present', async () => {
    getBrandDiscoveryFeedMock.mockResolvedValue({
      products: [
        {
          product_id: 'prod_1',
          merchant_id: 'merch_1',
          title: 'Gloss Bomb Universal Lip Luminizer',
          description: 'Lip',
          category: 'lip',
          price: 21,
          currency: 'USD',
          image_url: 'https://example.com/1.jpg',
          in_stock: true,
        },
      ],
      metadata: {
        has_more: false,
        brand_story: {
          title: 'Brand story',
          quote: 'Beauty should be playful, expressive, and never feel like pressure.',
          author: 'Rihanna, founder',
        },
      },
      query_text: '',
      page_info: { page: 1, page_size: 1, total: 1, has_more: false },
    });

    render(
      <BrandLandingPage
        slug="fenty-beauty"
        initialBrandName="Fenty Beauty"
        initialReturnUrl="/products/ext_123"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Brand story')).toBeInTheDocument();
    });

    expect(
      screen.getByText('“Beauty should be playful, expressive, and never feel like pressure.”'),
    ).toBeInTheDocument();
    expect(screen.getByText('Rihanna, founder')).toBeInTheDocument();
  });
});
