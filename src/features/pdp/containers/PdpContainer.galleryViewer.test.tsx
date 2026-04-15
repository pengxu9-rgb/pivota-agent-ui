/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PdpContainer } from './PdpContainer';
import type { PDPPayload } from '@/features/pdp/types';

const pushMock = vi.fn();

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
    push: pushMock,
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
      module_id: 'm_product_overview',
      type: 'product_overview',
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
    pushMock.mockReset();
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
    expect(screen.getAllByText('Black Mesh').length).toBeGreaterThan(0);
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
    expect(screen.getAllByText('Default option').length).toBeGreaterThan(0);
  });

  it('navigates to a product-line sibling PDP from the preview rail', () => {
    const previewPayload: PDPPayload = {
      ...payload,
      modules: [
        {
          ...payload.modules[0],
          data: {
            items: [
              { type: 'image', url: 'https://example.com/1.jpg' },
              { type: 'image', url: 'https://example.com/2.jpg' },
            ],
            preview_scope: 'product_line',
            preview_items: [
              {
                type: 'image',
                url: 'https://example.com/sibling.jpg',
                alt_text: 'Jumbo - 100 mL',
                merchant_id: 'external_seed',
                product_id: 'ext_krave_gbr_100',
              },
            ],
          },
        },
        ...payload.modules.slice(1),
      ],
    };

    window.history.replaceState(null, '', '/products/P001?merchant_id=merch_test');

    render(
      <PdpContainer
        payload={previewPayload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'View product-line item 1' }));
    expect(pushMock).toHaveBeenCalledWith(
      '/products/ext_krave_gbr_100?merchant_id=external_seed&return=%2Fproducts%2FP001%3Fmerchant_id%3Dmerch_test',
    );
  });

  it('switches review summary when selecting the exact-item review scope', () => {
    const scopedPayload: PDPPayload = {
      ...payload,
      modules: payload.modules.map((module) =>
        module.type === 'reviews_preview'
          ? {
              ...module,
              data: {
                scale: 5,
                rating: 4.7,
                review_count: 42,
                aggregation_scope: 'product_line',
                exact_item_review_count: 12,
                product_line_review_count: 42,
                scope_label: 'Based on product-line reviews (42)',
                tabs: [
                  { id: 'product_line', label: 'Product line', count: 42, default: true },
                  { id: 'exact_item', label: 'Exact item', count: 12, default: false },
                ],
                scoped_summaries: {
                  product_line: {
                    scale: 5,
                    rating: 4.7,
                    review_count: 42,
                    scope_label: 'Based on product-line reviews (42)',
                    preview_items: [],
                  },
                  exact_item: {
                    scale: 5,
                    rating: 4.1,
                    review_count: 12,
                    scope_label: 'Based on exact-item reviews (12)',
                    preview_items: [],
                  },
                },
                preview_items: [],
              },
            }
          : module,
      ),
    };

    render(
      <PdpContainer
        payload={scopedPayload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    expect(screen.getByText('Based on product-line reviews (42)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exact item (12)' }));
    expect(screen.getByText('Based on exact-item reviews (12)')).toBeInTheDocument();
    expect(screen.getByText('Reviews (12)')).toBeInTheDocument();
  });

  it('renders structured PDP detail modules before generic product details', () => {
    const structuredPayload: PDPPayload = {
      ...payload,
      modules: [
        ...payload.modules,
        {
          module_id: 'm_active_ingredients',
          type: 'active_ingredients',
          priority: 40,
          data: {
            title: 'Active Ingredients',
            items: ['Niacinamide'],
          },
        },
        {
          module_id: 'm_ingredients_inci',
          type: 'ingredients_inci',
          priority: 41,
          data: {
            title: 'Ingredients (INCI)',
            items: ['Water', 'Niacinamide'],
          },
        },
        {
          module_id: 'm_how_to_use',
          type: 'how_to_use',
          priority: 42,
          data: {
            title: 'How to Use',
            steps: ['Apply after cleansing', 'Use morning and night'],
          },
        },
        {
          module_id: 'm_product_overview',
          type: 'product_overview',
          priority: 45,
          data: {
            sections: [
              {
                heading: 'Details',
                content_type: 'text',
                content: 'Barrier-support serum for daily use.',
              },
            ],
          },
        },
      ],
    };

    render(
      <PdpContainer
        payload={structuredPayload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    expect(screen.getByText('Active Ingredients')).toBeInTheDocument();
    expect(screen.getAllByText('Niacinamide').length).toBeGreaterThan(0);
    expect(screen.getByText('Ingredients (INCI)')).toBeInTheDocument();
    expect(screen.getByText('How to Use')).toBeInTheDocument();
    expect(screen.getByText('Product Details')).toBeInTheDocument();
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
