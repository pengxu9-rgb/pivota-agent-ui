import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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

  it('preserves the current brand page as return url on product card links', async () => {
    window.history.replaceState({}, '', '/brands/tom-ford');

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

    const productLink = await screen.findByRole('link', { name: /rose prick eau de parfum/i });
    expect(productLink).toHaveAttribute(
      'href',
      '/products/prod_1?merchant_id=merch_1&return=%2Fbrands%2Ftom-ford',
    );
  });

  it('renders an initial server-fed brand result without re-fetching on mount', async () => {
    render(
      <BrandLandingPage
        slug="fenty-beauty"
        initialBrandName="Fenty Beauty"
        initialFeed={{
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
          metadata: { has_more: false },
          facets: { categories: [] },
          query_text: '',
          page_info: { page: 1, page_size: 1, total: 1, has_more: false },
        }}
      />,
    );

    expect(screen.getByText('Gloss Bomb Universal Lip Luminizer')).toBeInTheDocument();
    expect(getBrandDiscoveryFeedMock).not.toHaveBeenCalled();
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

  it('shows review-derived badges and never falls back to a generic New badge', async () => {
    getBrandDiscoveryFeedMock.mockResolvedValue({
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
          review_summary: { rating: 4.8, review_count: 128, scale: 5 },
        },
      ],
      metadata: { has_more: false },
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

    expect(screen.getByText('4.8')).toBeInTheDocument();
    expect(screen.getByText('(128)')).toBeInTheDocument();
    expect(screen.queryByText(/^New$/i)).not.toBeInTheDocument();
  });

  it('uses a data-driven editorial slot when reviews are missing instead of rendering generic newness', async () => {
    getBrandDiscoveryFeedMock.mockResolvedValue({
      products: [
        {
          product_id: 'prod_1',
          merchant_id: 'merch_1',
          title: 'Match Stix Skinstick',
          description: 'Complexion',
          category: 'complexion',
          price: 32,
          currency: 'USD',
          image_url: 'https://example.com/1.jpg',
          in_stock: true,
          tags: ["editorial: rihanna's pick"],
        },
      ],
      metadata: { has_more: false },
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
      expect(screen.getByText('Match Stix Skinstick')).toBeInTheDocument();
    });

    expect(screen.getByText("Rihanna's Pick")).toBeInTheDocument();
    expect(screen.queryByText(/^New$/i)).not.toBeInTheDocument();
  });

  it('keeps backend-scoped concealer results visible instead of re-filtering them away on the client', async () => {
    const scopedResponse = deferred<{
      products: Array<Record<string, unknown>>;
      metadata: Record<string, unknown>;
      query_text: string;
      page_info: { page: number; page_size: number; total: number; has_more: boolean };
    }>();

    getBrandDiscoveryFeedMock
      .mockResolvedValueOnce({
        products: [
          {
            product_id: 'prod_1',
            merchant_id: 'merch_1',
            title: 'Fenty Starter Item',
            description: 'Starter',
            category: 'moisturizer',
            price: 39,
            currency: 'USD',
            image_url: 'https://example.com/start.jpg',
            in_stock: true,
          },
        ],
        metadata: {
          has_more: false,
          facets: {
            categories: [
              { value: 'Concealer', count: 35 },
              { value: 'Foundation', count: 29 },
            ],
          },
        },
        query_text: '',
        page_info: { page: 1, page_size: 1, total: 130, has_more: false },
      })
      .mockReturnValueOnce(scopedResponse.promise);

    render(
      <BrandLandingPage
        slug="fenty-beauty"
        initialBrandName="Fenty Beauty"
        initialReturnUrl="/products/ext_123"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Fenty Starter Item')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Concealer\s*35/i }));

    await waitFor(() => {
      expect(getBrandDiscoveryFeedMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          brandName: 'Fenty Beauty',
          category: 'Concealer',
          page: 1,
        }),
      );
    });

    expect(screen.getByText('130 products across sellers')).toBeInTheDocument();
    expect(screen.queryByText('0 products across sellers')).not.toBeInTheDocument();

    scopedResponse.resolve({
      products: [
        {
          product_id: 'prod_concealer',
          merchant_id: 'merch_1',
          title: "Pro Filt'r Instant Retouch Concealer — #300",
          description: 'Concealer',
          category: 'concealer',
          price: 30,
          currency: 'USD',
          image_url: 'https://example.com/concealer.jpg',
          in_stock: true,
        },
      ],
      metadata: {
        has_more: false,
        facets: {
          categories: [
            { value: 'Concealer', count: 35 },
            { value: 'Foundation', count: 29 },
          ],
        },
      },
      query_text: '',
      page_info: { page: 1, page_size: 1, total: 35, has_more: false },
    });

    await waitFor(() => {
      expect(screen.getByText("Pro Filt'r Instant Retouch Concealer — #300")).toBeInTheDocument();
    });
    expect(screen.getByText('35 products across sellers')).toBeInTheDocument();
    expect(screen.queryByText(/No concealer picks yet/i)).not.toBeInTheDocument();
  });

  it('exposes real category filters inside the filter sheet and can clear them', async () => {
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
        ],
        metadata: {
          has_more: false,
          facets: {
            categories: [
              { value: 'Lip', count: 8 },
              { value: 'Complexion', count: 5 },
            ],
          },
        },
        query_text: '',
        page_info: { page: 1, page_size: 1, total: 13, has_more: false },
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
              { value: 'Lip', count: 8 },
              { value: 'Complexion', count: 5 },
            ],
          },
        },
        query_text: '',
        page_info: { page: 1, page_size: 1, total: 8, has_more: false },
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
              { value: 'Lip', count: 8 },
              { value: 'Complexion', count: 5 },
            ],
          },
        },
        query_text: '',
        page_info: { page: 1, page_size: 1, total: 13, has_more: false },
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

    fireEvent.click(screen.getByRole('button', { name: /filter/i }));
    const filterPanel = screen.getByLabelText('Brand filters');

    fireEvent.click(within(filterPanel).getByRole('button', { name: 'Lip 8' }));

    await waitFor(() => {
      expect(getBrandDiscoveryFeedMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          brandName: 'Fenty Beauty',
          category: 'Lip',
          page: 1,
        }),
      );
    });

    fireEvent.click(within(filterPanel).getByRole('button', { name: /clear all/i }));

    await waitFor(() => {
      expect(getBrandDiscoveryFeedMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          brandName: 'Fenty Beauty',
          sort: 'popular',
          page: 1,
        }),
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
