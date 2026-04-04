/* eslint-disable @next/next/no-img-element */
import React from 'react';
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

vi.mock('@/lib/auroraEmbed', () => ({
  postRequestCloseToParent: vi.fn(() => false),
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

function buildBeautyPayload(): PDPPayload {
  return {
    schema_version: '1.0.0',
    page_type: 'product_detail',
    tracking: {
      page_request_id: 'pr_structured_modules',
      entry_point: 'agent',
    },
    product: {
      product_id: 'P-BEAUTY-1',
      merchant_id: 'external_seed',
      title: 'Barrier Support Cream',
      brand_story: 'Created for skin that needs barrier-first hydration.',
      description: 'A cushiony moisturizer for dry, reactive skin.',
      default_variant_id: 'V001',
      variants: [
        {
          variant_id: 'V001',
          title: 'Default',
          price: { current: { amount: 38, currency: 'USD' } },
          availability: { in_stock: true, available_quantity: 9 },
        },
      ],
      price: { current: { amount: 38, currency: 'USD' } },
      availability: { in_stock: true, available_quantity: 9 },
    },
    modules: [
      {
        module_id: 'm_media',
        type: 'media_gallery',
        priority: 100,
        data: {
          items: [
            { type: 'image', url: 'https://example.com/hero.jpg' },
            { type: 'image', url: 'https://example.com/detail.jpg' },
          ],
        },
      },
      {
        module_id: 'm_price',
        type: 'price_promo',
        priority: 90,
        data: {
          price: { amount: 38, currency: 'USD' },
          promotions: [],
        },
      },
      {
        module_id: 'm_actives',
        type: 'active_ingredients',
        priority: 82,
        data: {
          title: 'Active ingredients',
          items: ['Ceramide NP', 'Glycerin'],
          source_origin: 'retail_pdp',
          source_quality_status: 'captured',
        },
      },
      {
        module_id: 'm_ingredients',
        type: 'ingredients_inci',
        priority: 81,
        data: {
          title: 'Ingredients',
          raw_text: 'Water, Glycerin, Ceramide NP, Cholesterol',
          items: ['Water', 'Glycerin', 'Ceramide NP', 'Cholesterol'],
          source_origin: 'retail_pdp',
          source_quality_status: 'captured',
        },
      },
      {
        module_id: 'm_how',
        type: 'how_to_use',
        priority: 80,
        data: {
          title: 'How to use',
          raw_text: 'Apply after cleansing. Follow with sunscreen in the morning.',
          steps: ['Apply after cleansing.', 'Follow with sunscreen in the morning.'],
          source_origin: 'retail_pdp',
        },
      },
      {
        module_id: 'm_facts',
        type: 'product_facts',
        priority: 71,
        data: {
          sections: [
            {
              heading: 'Clinical Results',
              content_type: 'text',
              content: 'Supports the skin barrier in 7 days.',
            },
            {
              heading: 'Brand Story',
              content_type: 'text',
              content: 'Legacy story section that should not render in the accordion.',
            },
          ],
        },
      },
      {
        module_id: 'm_details_legacy',
        type: 'product_details',
        priority: 70,
        data: {
          sections: [
            {
              heading: 'Legacy Ingredients',
              content_type: 'text',
              content: 'This should not be shown when product_facts exists.',
            },
          ],
        },
      },
    ],
    actions: [
      { action_type: 'add_to_cart', label: 'Add to Cart', priority: 20, target: {} },
      { action_type: 'buy_now', label: 'Buy Now', priority: 10, target: {} },
    ],
  };
}

function buildGenericSingleVariantPayload(): PDPPayload {
  return {
    schema_version: '1.0.0',
    page_type: 'product_detail',
    tracking: {
      page_request_id: 'pr_single_variant',
      entry_point: 'agent',
    },
    product: {
      product_id: 'P-GENERIC-1',
      merchant_id: 'external_seed',
      title: 'Soft Knit Lounge Set',
      description: 'Matching set with a single merchant-default option.',
      default_variant_id: 'SKU-DEFAULT',
      variants: [
        {
          variant_id: 'SKU-DEFAULT',
          sku_id: 'SKU-DEFAULT',
          title: 'Default Title',
          price: { current: { amount: 48, currency: 'USD' } },
          availability: { in_stock: true, available_quantity: 3 },
        },
      ],
      price: { current: { amount: 48, currency: 'USD' } },
      availability: { in_stock: true, available_quantity: 3 },
    },
    modules: [
      {
        module_id: 'm_media',
        type: 'media_gallery',
        priority: 100,
        data: {
          items: [{ type: 'image', url: 'https://example.com/lounge-set.jpg' }],
        },
      },
      {
        module_id: 'm_price',
        type: 'price_promo',
        priority: 90,
        data: {
          price: { amount: 48, currency: 'USD' },
          promotions: [],
        },
      },
      {
        module_id: 'm_details',
        type: 'product_details',
        priority: 70,
        data: {
          sections: [
            {
              heading: 'Description',
              content_type: 'text',
              content: 'Soft brushed knit with relaxed fit.',
            },
          ],
        },
      },
    ],
    actions: [
      { action_type: 'add_to_cart', label: 'Add to Cart', priority: 20, target: {} },
      { action_type: 'buy_now', label: 'Buy Now', priority: 10, target: {} },
    ],
  };
}

describe('PdpContainer structured PDP modules', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders additive beauty modules ahead of facts and prefers product_facts over legacy product_details', () => {
    render(
      <PdpContainer
        payload={buildBeautyPayload()}
        mode="beauty"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    expect(screen.getByText('Active ingredients')).toBeInTheDocument();
    expect(screen.getAllByText('Ceramide NP').length).toBeGreaterThan(0);
    expect(screen.getByText('Ingredients')).toBeInTheDocument();
    expect(screen.getAllByText('Cholesterol').length).toBeGreaterThan(0);
    expect(screen.getByText('How to use')).toBeInTheDocument();
    expect(screen.getByText('Apply after cleansing.')).toBeInTheDocument();
    expect(screen.getByText('Brand Story')).toBeInTheDocument();
    expect(screen.getByText('Product Information')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clinical Results' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Legacy Ingredients' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Add to Cart' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Buy Now' }).length).toBeGreaterThan(0);
  });

  it('falls back to legacy product_details when additive modules are absent', () => {
    const payload = buildBeautyPayload();
    payload.modules = payload.modules.filter(
      (module) =>
        module.type !== 'active_ingredients' &&
        module.type !== 'ingredients_inci' &&
        module.type !== 'how_to_use' &&
        module.type !== 'product_facts',
    );

    render(
      <PdpContainer payload={payload} mode="beauty" onAddToCart={() => {}} onBuyNow={() => {}} />,
    );

    expect(screen.queryByText('Active ingredients')).toBeNull();
    expect(screen.queryByText('How to use')).toBeNull();
    expect(screen.getByRole('button', { name: 'Legacy Ingredients' })).toBeInTheDocument();
  });

  it('renders a locked selector surface for single-variant generic products', () => {
    render(
      <PdpContainer
        payload={buildGenericSingleVariantPayload()}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    expect(screen.getByText('Options')).toBeInTheDocument();
    expect(screen.getByText('1 variant')).toBeInTheDocument();
    expect(screen.getAllByText('Default option').length).toBeGreaterThan(0);
  });
});
