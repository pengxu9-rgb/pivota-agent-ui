/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
          options: [{ name: 'Title', value: 'Default Title' }],
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
              heading: 'Product Details',
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

function buildExternalSeedMultiVariantOfferPayload(): PDPPayload {
  return {
    schema_version: '1.0.0',
    page_type: 'product_detail',
    tracking: {
      page_request_id: 'pr_external_seed_multi_variant_offer',
      entry_point: 'agent',
    },
    product: {
      product_id: 'ext_krave_gbr',
      merchant_id: 'external_seed',
      title: 'Great Barrier Relief',
      brand: { name: 'KraveBeauty' },
      description: 'Barrier repair serum.',
      default_variant_id: 'V_STD',
      variants: [
        {
          variant_id: 'V_STD',
          title: 'Standard - 45 mL',
          options: [{ name: 'size', value: 'Standard - 45 mL' }],
          price: { current: { amount: 28, currency: 'EUR' } },
          availability: { in_stock: true, available_quantity: 9 },
        },
        {
          variant_id: 'V_JUMBO',
          title: 'Jumbo - 100 mL',
          options: [{ name: 'size', value: 'Jumbo - 100 mL' }],
          price: { current: { amount: 50, currency: 'EUR' } },
          availability: { in_stock: true, available_quantity: 9 },
        },
      ],
      price: { current: { amount: 28, currency: 'EUR' } },
      availability: { in_stock: true, available_quantity: 9 },
    },
    offers: [
      {
        offer_id: 'offer_external_seed_default',
        product_id: 'ext_krave_gbr',
        merchant_id: 'external_seed',
        merchant_name: 'KraveBeauty',
        price: { amount: 28, currency: 'EUR' },
        purchase_route: 'affiliate_outbound',
        commerce_mode: 'links_out',
        checkout_handoff: 'redirect',
        merchant_checkout_url: 'https://kravebeauty.com/products/great-barrier-relief',
        variants: [
          {
            variant_id: '13760798457931',
            title: 'Standard - 45 mL',
            options: [{ name: 'size', value: 'Standard - 45 mL' }],
            price: { current: { amount: 28, currency: 'EUR' } },
            availability: { in_stock: true, available_quantity: 9 },
          },
          {
            variant_id: '40160623329355',
            title: 'Jumbo - 100 mL',
            options: [{ name: 'size', value: 'Jumbo - 100 mL' }],
            price: { current: { amount: 50, currency: 'EUR' } },
            availability: { in_stock: true, available_quantity: 9 },
          },
        ],
      },
    ],
    default_offer_id: 'offer_external_seed_default',
    modules: [
      {
        module_id: 'm_media',
        type: 'media_gallery',
        priority: 100,
        data: {
          items: [{ type: 'image', url: 'https://example.com/gbr.jpg' }],
        },
      },
      {
        module_id: 'm_price',
        type: 'price_promo',
        priority: 90,
        data: {
          price: { amount: 28, currency: 'EUR' },
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
              heading: 'Overview',
              content_type: 'text',
              content: 'Barrier repair serum.',
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

function buildMultiOfferVariantPricingPayload(): PDPPayload {
  const payload = buildExternalSeedMultiVariantOfferPayload();
  return {
    ...payload,
    offers: [
      {
        offer_id: 'offer_internal_pivota_market',
        product_id: 'shopify_gbr',
        merchant_id: 'merch_efbc46b4619cfbdf',
        merchant_name: 'Pivota Market',
        price: { amount: 28, currency: 'EUR' },
        purchase_route: 'internal_checkout',
        commerce_mode: 'merchant_embedded_checkout',
        checkout_handoff: 'embedded',
        variants: [
          {
            variant_id: 'SHOP_STD',
            title: 'Standard - 45 mL',
            options: [{ name: 'size', value: 'Standard - 45 mL' }],
            price: { current: { amount: 28, currency: 'EUR' } },
            availability: { in_stock: true, available_quantity: 9 },
          },
          {
            variant_id: 'SHOP_JUMBO',
            title: 'Jumbo - 100 mL',
            options: [{ name: 'size', value: 'Jumbo - 100 mL' }],
            price: { current: { amount: 40, currency: 'EUR' } },
            availability: { in_stock: true, available_quantity: 9 },
          },
        ],
      },
      ...(payload.offers || []),
    ],
    default_offer_id: 'offer_external_seed_default',
    best_price_offer_id: 'offer_external_seed_default',
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
    expect(screen.queryByRole('button', { name: 'Show full INCI' })).not.toBeInTheDocument();
    expect(screen.getByText(/Water/)).toBeInTheDocument();
    expect(screen.getAllByText(/Glycerin/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Cholesterol/)).toBeInTheDocument();
    expect(screen.getByText('How to use')).toBeInTheDocument();
    expect(screen.getByText('Apply after cleansing.')).toBeInTheDocument();
    expect(screen.getByText('Brand Story')).toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getAllByText('Retail PDP').length).toBeGreaterThan(0);
    expect(screen.getByText('Clinical Results')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Legacy Ingredients' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Add to Cart' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Buy Now' }).length).toBeGreaterThan(0);
  });

  it('does not render legacy shade modules while keeping shade variants selectable', () => {
    const payload = buildBeautyPayload();
    payload.product.title = 'Pout Preserve Peptide Lip Treatment';
    payload.product.default_variant_id = 'shade_grape';
    payload.product.variants = [
      {
        variant_id: 'shade_grape',
        title: 'Grape Fizz',
        options: [{ name: 'Shade', value: 'Grape Fizz' }],
        price: { current: { amount: 22, currency: 'USD' } },
        availability: { in_stock: true, available_quantity: 9 },
      },
      {
        variant_id: 'shade_citrus',
        title: 'Citrus Sunshine',
        options: [{ name: 'Shade', value: 'Citrus Sunshine' }],
        price: { current: { amount: 24, currency: 'USD' } },
        availability: { in_stock: true, available_quantity: 9 },
      },
    ];
    payload.product.price = { current: { amount: 22, currency: 'USD' } };

    render(
      <PdpContainer payload={payload} mode="beauty" onAddToCart={() => {}} onBuyNow={() => {}} />,
    );

    expect(screen.queryByText('Shade Matching')).not.toBeInTheDocument();
    expect(screen.queryByText('Popular Looks')).not.toBeInTheDocument();
    expect(screen.queryByText('Best For')).not.toBeInTheDocument();
    expect(screen.queryByText('Shade Gallery')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grape Fizz' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Citrus Sunshine' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Citrus Sunshine' }));

    expect(screen.getAllByText('$24.00').length).toBeGreaterThan(0);
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
    expect(screen.getByText('Legacy Ingredients')).toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
  });

  it('drops polluted product_facts and how-to-use blocks, then falls back to clean legacy overview', () => {
    const payload = buildBeautyPayload();
    payload.product.description = 'Barrier-first overview copy.';
    payload.modules = payload.modules.map((module) => {
      if (module.type === 'how_to_use') {
        return {
          ...module,
          data: {
            title: 'How to use',
            raw_text: 'Oat So Simple Water Cream Pair with a water-based moisturizer. Shop Now',
            steps: ['Pair with a water-based moisturizer.', 'Shop Now'],
            source_origin: 'retail_pdp',
          },
        };
      }
      if (module.type === 'product_facts') {
        return {
          ...module,
          data: {
            sections: [
              {
                heading: 'How to Pair',
                content_type: 'text',
                content: 'Shop Now Pair with Oat So Simple Water Cream.',
              },
              {
                heading: 'ABOUT',
                content_type: 'text',
                content: 'Our Story Product Philosophy Sustainability Journey',
              },
            ],
          },
        };
      }
      if (module.type === 'product_details') {
        return {
          ...module,
          data: {
            sections: [
              {
                heading: 'Overview',
                content_type: 'text',
                content: 'This reparative serum helps soothe and restore your skin barrier.',
              },
            ],
          },
        };
      }
      return module;
    });

    render(
      <PdpContainer payload={payload} mode="beauty" onAddToCart={() => {}} onBuyNow={() => {}} />,
    );

    expect(screen.getAllByText('This reparative serum helps soothe and restore your skin barrier.').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Pair with Oat So Simple Water Cream/i)).not.toBeInTheDocument();
    expect(screen.queryByText('How to use')).not.toBeInTheDocument();
    expect(screen.queryByText('How to Pair')).not.toBeInTheDocument();
    expect(screen.queryByText('ABOUT')).not.toBeInTheDocument();
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
    expect(screen.getByText((_, element) => element?.textContent === 'Selected: Default')).toBeInTheDocument();
    expect(screen.getAllByText('Default option').length).toBeGreaterThan(0);
    expect(screen.queryByText('Title: Default Title')).not.toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.queryAllByText('Product Details')).toHaveLength(1);
  });

  it('keeps variant pricing visible for single-offer external-seed products', () => {
    render(
      <PdpContainer
        payload={buildExternalSeedMultiVariantOfferPayload()}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    expect(screen.getAllByText('€28.00').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Jumbo - 100 mL' }));

    expect(screen.getByText('Selected:')).toBeInTheDocument();
    expect(screen.getAllByText('Jumbo - 100 mL').length).toBeGreaterThan(0);
    expect(screen.getAllByText('€50.00').length).toBeGreaterThan(0);
  });

  it('uses the selected seller variant price when multiple offers coexist', () => {
    render(
      <PdpContainer
        payload={buildMultiOfferVariantPricingPayload()}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    expect(screen.getAllByText('€28.00').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Jumbo - 100 mL' }));

    expect(screen.getAllByText('Jumbo - 100 mL').length).toBeGreaterThan(0);
    expect(screen.getAllByText('€40.00').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Other offers (1)' }));

    const internalOffer = screen.getByRole('button', { name: /Pivota Market/ });
    const externalOffer = screen.getByRole('button', { name: /KraveBeauty/ });
    expect(internalOffer).toHaveTextContent('Item: €40.00');
    expect(internalOffer).toHaveTextContent('Recommended');
    expect(internalOffer).toHaveTextContent('Best price');
    expect(externalOffer).toHaveTextContent('Item: €50.00');
    expect(externalOffer).not.toHaveTextContent('Recommended');
    expect(externalOffer).not.toHaveTextContent('Best price');
  });

  it('renders FAQ and review-derived source labels in the questions rail', () => {
    const payload = buildBeautyPayload();
    payload.modules.push({
      module_id: 'm_reviews',
      type: 'reviews_preview',
      priority: 50,
      data: {
        scale: 5,
        rating: 4.7,
        review_count: 126,
        questions: [
          {
            question: 'Can I use this every day?',
            answer: 'Yes, it is gentle enough for daily use.',
            source: 'merchant_faq',
            source_label: 'Official FAQ',
          },
          {
            question: 'Is this good for oily skin?',
            answer: 'Reviewers say it feels lightweight on oily skin.',
            source: 'review_derived',
            source_label: 'From reviews',
            support_count: 3,
          },
        ],
      },
    } as any);

    render(
      <PdpContainer payload={payload} mode="beauty" onAddToCart={() => {}} onBuyNow={() => {}} />,
    );

    expect(screen.getByText('Can I use this every day?')).toBeInTheDocument();
    expect(screen.getByText('Official FAQ')).toBeInTheDocument();
    expect(screen.getByText('From reviews')).toBeInTheDocument();
    expect(screen.getByText('Supported by 3 reviews')).toBeInTheDocument();
  });
});
