/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PdpContainer } from './PdpContainer';
import type { PDPPayload } from '@/features/pdp/types';

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

function mockMatchMedia(matches: boolean) {
  const matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

  vi.stubGlobal('matchMedia', matchMedia);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: matchMedia,
  });
}

const payload: PDPPayload = {
  schema_version: '1.0.0',
  page_type: 'product_detail',
  tracking: {
    page_request_id: 'pr_test_1',
    entry_point: 'agent',
  },
  product: {
    product_id: 'P001',
    merchant_id: 'merch_test',
    title: 'Test Product',
    default_variant_id: 'V001',
    variants: [
      {
        variant_id: 'V001',
        title: 'Default',
        price: { current: { amount: 12.35, currency: 'EUR' } },
        availability: { in_stock: true, available_quantity: 12 },
      },
    ],
    price: { current: { amount: 12.35, currency: 'EUR' } },
    availability: { in_stock: true, available_quantity: 12 },
  },
  modules: [
    {
      module_id: 'm_media',
      type: 'media_gallery',
      priority: 100,
      data: {
        items: [
          { type: 'image', url: 'https://example.com/1.jpg' },
          { type: 'image', url: 'https://example.com/2.jpg' },
          { type: 'image', url: 'https://example.com/3.jpg' },
        ],
      },
    },
    {
      module_id: 'm_price',
      type: 'price_promo',
      priority: 90,
      data: {
        price: { amount: 12.35, currency: 'EUR' },
        promotions: [],
      },
    },
    {
      module_id: 'm_details',
      type: 'product_details',
      priority: 70,
      data: {
        sections: [],
      },
    },
    {
      module_id: 'm_reviews',
      type: 'reviews_preview',
      priority: 50,
      data: {
        scale: 5,
        rating: 4.1,
        review_count: 36,
        preview_items: [],
      },
    },
  ],
  actions: [
    { action_type: 'add_to_cart', label: 'Add to Cart', priority: 20, target: {} },
    { action_type: 'buy_now', label: 'Buy Now', priority: 10, target: {} },
  ],
};

describe('PdpContainer gallery viewer wiring', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: undefined,
    });
  });

  it('switches official hero image on thumbnail click without opening viewer', () => {
    render(
      <PdpContainer
        payload={payload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    expect(screen.getByText('1/3')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('View media 2'));
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.queryByTestId('viewer-counter')).toBeNull();
  });

  it('removes the mobile CTA padding when the desktop media query matches', async () => {
    mockMatchMedia(true);

    render(
      <PdpContainer
        payload={payload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    await waitFor(() => {
      const root = document.querySelector('.lovable-pdp') as HTMLElement | null;
      expect(root).not.toBeNull();
      expect(root?.className).toContain('pb-0');
      expect(root?.className).not.toContain('pb-[calc(120px+env(safe-area-inset-bottom,0px))]');
    });
  });

  it('shows a default-selected single option summary for external-seed products', () => {
    const externalSeedPayload: PDPPayload = {
      ...payload,
      product: {
        ...payload.product,
        merchant_id: 'external_seed',
        variants: [
          {
            ...payload.product.variants[0],
            title: 'Black Mesh',
          },
        ],
      },
    };

    render(
      <PdpContainer
        payload={externalSeedPayload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    expect(screen.getByText('Option')).toBeInTheDocument();
    expect(screen.getByText('Selected by default')).toBeInTheDocument();
    expect(screen.getByText('Black Mesh')).toBeInTheDocument();
  });

  it('shows a fallback single option summary for placeholder external-seed variants', () => {
    const externalSeedPayload: PDPPayload = {
      ...payload,
      product: {
        ...payload.product,
        merchant_id: 'external_seed',
      },
    };

    render(
      <PdpContainer
        payload={externalSeedPayload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    expect(screen.getByText('Selected by default')).toBeInTheDocument();
    expect(screen.getByText('Option')).toBeInTheDocument();
    expect(screen.getByText('Default option')).toBeInTheDocument();
  });

  it('shows the single option summary for beauty-mode external-seed products too', () => {
    const externalSeedPayload: PDPPayload = {
      ...payload,
      product: {
        ...payload.product,
        merchant_id: 'external_seed',
        title: 'PIXI BEAUTY Rose Ceramide Cream',
        variants: [
          {
            ...payload.product.variants[0],
            title: 'PIXI BEAUTY Rose Ceramide Cream',
          },
        ],
      },
    };

    render(
      <PdpContainer
        payload={externalSeedPayload}
        mode="beauty"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    expect(screen.getByText('Selected by default')).toBeInTheDocument();
    expect(screen.getByText('Option')).toBeInTheDocument();
    expect(screen.getAllByText('PIXI BEAUTY Rose Ceramide Cream').length).toBeGreaterThan(1);
  });
});
