/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdpContainer } from './PdpContainer';
import type { PDPPayload } from '@/features/pdp/types';

const routerPushMock = vi.fn();
const getSimilarProductsMainlineMock = vi.fn();
const getProductDetailExactMock = vi.fn();
const toastMessageMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const windowOpenMock = vi.fn();

class IntersectionObserverMock {
  static instances: IntersectionObserverMock[] = [];

  callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    IntersectionObserverMock.instances.push(this);
  }

  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();

  trigger(isIntersecting = true) {
    this.callback(
      [
        {
          isIntersecting,
          target: document.createElement('div'),
          boundingClientRect: {} as DOMRectReadOnly,
          intersectionRatio: isIntersecting ? 1 : 0,
          intersectionRect: {} as DOMRectReadOnly,
          rootBounds: null,
          time: Date.now(),
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    );
  }
}

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
    push: routerPushMock,
  }),
}));

vi.mock('@/lib/api', () => ({
  listQuestions: vi.fn(async () => ({ items: [] })),
  postQuestion: vi.fn(async () => ({ question_id: 1 })),
  getSimilarProductsMainline: (...args: unknown[]) => getSimilarProductsMainlineMock(...args),
  getProductDetailExact: (...args: unknown[]) => getProductDetailExactMock(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    message: (...args: unknown[]) => toastMessageMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

function buildSimilar(count: number, merchantId = 'external_seed') {
  return Array.from({ length: count }).map((_, index) => ({
    product_id: `prod_${index + 1}`,
    merchant_id: merchantId,
    title: `Product ${index + 1}`,
    image_url: `https://example.com/p_${index + 1}.jpg`,
    price: { amount: 99 + index, currency: 'USD' },
  }));
}

function buildPayload(args?: {
  items?: ReturnType<typeof buildSimilar>;
  metadata?: Record<string, unknown>;
}): PDPPayload {
  return {
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
          items: args?.items || buildSimilar(6),
          ...(args?.metadata ? { metadata: args.metadata } : {}),
        },
      },
    ],
    actions: [
      { action_type: 'add_to_cart', label: 'Add to Cart', priority: 20, target: {} },
      { action_type: 'buy_now', label: 'Buy Now', priority: 10, target: {} },
    ],
  };
}

beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock as unknown as typeof IntersectionObserver);
  vi.spyOn(window, 'open').mockImplementation(windowOpenMock as any);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('PdpContainer recommendations interactions', () => {
  beforeEach(() => {
    routerPushMock.mockReset();
    getSimilarProductsMainlineMock.mockReset();
    getProductDetailExactMock.mockReset();
    toastMessageMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    windowOpenMock.mockReset();
    IntersectionObserverMock.instances = [];
  });

  afterEach(() => {
    cleanup();
  });

  it('renders first-fold similar cards with compact CTAs and no legacy browse controls', async () => {
    render(
      <PdpContainer
        payload={buildPayload()}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Product 6')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /view all similar/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /load more similar products/i })).toBeNull();
    expect(screen.getByRole('button', { name: /open product 1/i })).toBeInTheDocument();
  });

  it('auto-loads more similar products when the sentinel intersects', async () => {
    getSimilarProductsMainlineMock.mockResolvedValue({
      strategy: 'related_products',
      items: buildSimilar(6).map((item, index) => ({
        ...item,
        product_id: `prod_${index + 7}`,
        title: `Product ${index + 7}`,
      })),
      metadata: { has_more: false },
      page_info: {
        page: 1,
        page_size: 6,
        total: 6,
        has_more: false,
      },
    });

    render(
      <PdpContainer
        payload={buildPayload({ metadata: { has_more: true } })}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    await waitFor(() => {
      expect(IntersectionObserverMock.instances.length).toBeGreaterThan(0);
    });

    await act(async () => {
      IntersectionObserverMock.instances[0]?.trigger(true);
    });

    await waitFor(() => {
      expect(screen.getByText('Product 12')).toBeInTheDocument();
    });

    expect(getSimilarProductsMainlineMock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: 'P_SIMILAR_001',
        merchant_id: 'external_seed',
        limit: 6,
        exclude_items: expect.arrayContaining([
          expect.objectContaining({ product_id: 'prod_1', merchant_id: 'external_seed' }),
          expect.objectContaining({ product_id: 'prod_6', merchant_id: 'external_seed' }),
        ]),
      }),
    );
  });

  it('shows inline retry when auto-load fails and succeeds on retry', async () => {
    getSimilarProductsMainlineMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({
        strategy: 'related_products',
        items: buildSimilar(6).map((item, index) => ({
          ...item,
          product_id: `prod_${index + 7}`,
          title: `Product ${index + 7}`,
        })),
        metadata: { has_more: false },
        page_info: {
          page: 1,
          page_size: 6,
          total: 6,
          has_more: false,
        },
      });

    render(
      <PdpContainer
        payload={buildPayload({ metadata: { has_more: true } })}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    await act(async () => {
      IntersectionObserverMock.instances[0]?.trigger(true);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText('Product 12')).toBeInTheDocument();
    });
  });

  it('opens a quick-buy sheet for multi-variant internal products and routes to checkout after selection', async () => {
    getProductDetailExactMock.mockResolvedValue({
      product_id: 'prod_1',
      merchant_id: 'merch_internal',
      merchant_name: 'Internal Shop',
      title: 'Product 1',
      description: 'Internal product',
      price: 39,
      currency: 'USD',
      image_url: 'https://example.com/internal.jpg',
      in_stock: true,
      variants: [
        {
          variant_id: 'var_s',
          title: 'Small',
          price: { current: { amount: 39, currency: 'USD' } },
          availability: { in_stock: true, available_quantity: 4 },
        },
        {
          variant_id: 'var_l',
          title: 'Large',
          price: { current: { amount: 49, currency: 'USD' } },
          availability: { in_stock: true, available_quantity: 6 },
        },
      ],
      default_offer_id: 'offer_internal',
      offers: [
        {
          offer_id: 'offer_internal',
          merchant_id: 'merch_internal',
          merchant_name: 'Internal Shop',
          product_id: 'prod_1',
          price: { amount: 39, currency: 'USD' },
          checkout_url: 'https://checkout.example.com',
        },
      ],
    });

    render(
      <PdpContainer
        payload={buildPayload({ items: buildSimilar(1, 'merch_internal') })}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /buy product 1/i }));

    await waitFor(() => {
      expect(screen.getByText('Select option')).toBeInTheDocument();
      expect(screen.getByText('Recommended seller:')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /large/i }));
    fireEvent.click(screen.getByRole('button', { name: /^buy$/i }));

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith(expect.stringMatching(/^\/order\?/));
    });
  });

  it('opens the external merchant site for single-variant external products', async () => {
    getProductDetailExactMock.mockResolvedValue({
      product_id: 'prod_1',
      merchant_id: 'external_seed',
      title: 'Product 1',
      description: 'External product',
      price: 99,
      currency: 'USD',
      image_url: 'https://example.com/external.jpg',
      in_stock: true,
      source: 'external_seed',
      destination_url: 'https://merchant.example.com/products/prod_1',
      variants: [
        {
          variant_id: 'default',
          title: 'Default',
          price: { current: { amount: 99, currency: 'USD' } },
          availability: { in_stock: true, available_quantity: 3 },
        },
      ],
    });

    render(
      <PdpContainer
        payload={buildPayload()}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /open product 1/i }));

    await waitFor(() => {
      expect(windowOpenMock).toHaveBeenCalledWith(
        'https://merchant.example.com/products/prod_1',
        '_blank',
        'noopener,noreferrer',
      );
    });
  });

  it('falls back to the full PDP when exact detail lookup fails', async () => {
    getProductDetailExactMock.mockResolvedValue(null);

    render(
      <PdpContainer
        payload={buildPayload()}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /open product 1/i }));

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith(expect.stringContaining('/products/prod_1'));
    });
  });
});
