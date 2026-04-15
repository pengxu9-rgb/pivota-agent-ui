/* eslint-disable @next/next/no-img-element */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
  findSimilarProducts: vi.fn(async () => ({ products: [] })),
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

const payload: PDPPayload = {
  schema_version: '1.0.0',
  page_type: 'product_detail',
  tracking: {
    page_request_id: 'pr_test_intel',
    entry_point: 'agent',
  },
  product: {
    product_id: 'ext_13c520e764f9f7d7f23c611b',
    merchant_id: 'external_seed',
    title: 'Overnight Repair Cream',
    default_variant_id: 'V001',
    variants: [
      {
        variant_id: 'V001',
        title: 'Default',
        price: { current: { amount: 48, currency: 'USD' } },
        availability: { in_stock: true, available_quantity: 12 },
      },
    ],
    price: { current: { amount: 48, currency: 'USD' } },
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
      data: { price: { amount: 48, currency: 'USD' }, promotions: [] },
    },
    {
      module_id: 'm_intel',
      type: 'product_intel',
      priority: 65,
      title: 'Pivota Insights',
      data: {
        display_name: 'Pivota Insights',
        evidence_profile: 'seller_only',
        quality_state: 'limited',
        source_coverage: { seller: true, formula: true },
        product_intel_core: {
          evidence_profile: 'seller_only',
          quality_state: 'limited',
          what_it_is: {
            body: 'our overnight cream is designed to support barrier comfort while you sleep.',
          },
          best_for: [{ label: 'Dry or dehydrated skin' }],
          why_it_stands_out: [
            {
              headline: 'Barrier-first support',
              body: 'Focused on overnight comfort and steady hydration without a heavy finish.',
            },
          ],
          routine_fit: {
            step: 'moisturizer',
            am_pm: ['pm'],
          },
          watchouts: [{ label: 'May feel rich on oily skin', severity: 'medium' }],
          source_coverage: { seller: true, formula: true },
        },
        texture_finish: {
          texture: 'cream',
          finish: 'comforting',
        },
        community_signals: {
          status: 'unavailable',
          unavailable_reason: 'insufficient_feedback',
        },
      },
    },
    {
      module_id: 'm_details',
      type: 'product_details',
      priority: 70,
      data: { sections: [] },
    },
  ],
  actions: [
    { action_type: 'add_to_cart', label: 'Add to Cart', priority: 20, target: {} },
    { action_type: 'buy_now', label: 'Buy Now', priority: 10, target: {} },
  ],
};

describe('PdpContainer product intel section', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders Pivota Insights as a dedicated section with seller-only evidence label', () => {
    render(
      <PdpContainer
        payload={payload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    expect(screen.getAllByText('Pivota Insights').length).toBeGreaterThan(0);
    expect(screen.getByText('What it is')).toBeInTheDocument();
    expect(screen.getByText('Based on product and brand information')).toBeInTheDocument();
    expect(screen.queryByText(/Sources:/)).not.toBeInTheDocument();
    expect(
      screen.getByText('This overnight cream is designed to support barrier comfort while you sleep.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Dry or dehydrated skin')).toBeInTheDocument();
  });

  it('suppresses seller-only merchandising highlights that do not explain product substance', () => {
    const noisyPayload: PDPPayload = {
      ...payload,
      modules: payload.modules.map((module) =>
        module.type !== 'product_intel'
          ? module
          : {
              ...module,
              data: {
                ...module.data,
                product_intel_core: {
                  ...module.data.product_intel_core!,
                  why_it_stands_out: [
                    {
                      headline: 'Positioning',
                      body: 'Double up and save with this jumbo size for extended use.',
                    },
                  ],
                },
              },
            },
      ),
    };

    render(
      <PdpContainer
        payload={noisyPayload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    expect(screen.queryByText('Why it stands out')).not.toBeInTheDocument();
    expect(screen.queryByText(/Double up and save/i)).not.toBeInTheDocument();
  });

  it('does not render generic fallback insights without product-specific substance', () => {
    const genericPayload: PDPPayload = {
      ...payload,
      modules: payload.modules.map((module) =>
        module.type !== 'product_intel'
          ? module
          : {
              ...module,
              data: {
                ...module.data,
                evidence_profile: 'seller_plus_formula',
                quality_state: 'eligible',
                product_intel_core: {
                  ...module.data.product_intel_core!,
                  evidence_profile: 'seller_plus_formula',
                  quality_state: 'eligible',
                  what_it_is: {
                    body: 'A daily sunscreen product focused on UV protection within a daytime skin-care routine.',
                  },
                  best_for: [{ label: 'Daily UV protection' }],
                  why_it_stands_out: [
                    {
                      headline: 'Daytime UV step',
                      body: 'Anchors the product in daily UV protection and daytime layering context.',
                    },
                  ],
                },
              },
            },
      ),
    };

    render(
      <PdpContainer
        payload={genericPayload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    expect(screen.queryByText('What it is')).not.toBeInTheDocument();
    expect(screen.queryByText(/daily sunscreen product focused on UV protection/i)).not.toBeInTheDocument();
  });

  it('hides legacy product-details overview when Pivota Insights already carries the normalized summary', () => {
    const dedupedPayload: PDPPayload = {
      ...payload,
      modules: payload.modules.map((module) =>
        module.type !== 'product_details'
          ? module
          : {
              ...module,
              data: {
                sections: [
                  {
                    heading: 'Overview',
                    content_type: 'text',
                    content:
                      'Seller overview copy that would otherwise duplicate the normalized summary.',
                  },
                ],
              },
            },
      ),
    };

    render(
      <PdpContainer
        payload={dedupedPayload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    expect(screen.getByText('Pivota Insights')).toBeInTheDocument();
    expect(screen.queryByText('Product Details')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Seller overview copy that would otherwise duplicate the normalized summary.'),
    ).not.toBeInTheDocument();
  });
});
