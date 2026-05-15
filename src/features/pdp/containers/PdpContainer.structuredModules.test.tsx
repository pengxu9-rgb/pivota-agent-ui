/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PdpContainer } from './PdpContainer';
import type { PDPPayload } from '@/features/pdp/types';

const routerPush = vi.hoisted(() => vi.fn());
const getPdpV2Mock = vi.hoisted(() => vi.fn());

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
    push: routerPush,
  }),
}));

vi.mock('@/lib/auroraEmbed', () => ({
  postRequestCloseToParent: vi.fn(() => false),
}));

vi.mock('@/lib/api', () => ({
  getPdpV2: (...args: unknown[]) => getPdpV2Mock(...args),
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
        module_id: 'm_product_overview',
        type: 'product_overview',
        priority: 70,
        data: {
          sections: [
            {
              heading: 'Legacy Ingredients',
              content_type: 'text',
              content: 'This should not be shown when product_facts exists.',
            },
            {
              heading: 'Rice-Infused Hydration',
              content_type: 'text',
              content: 'Rice extract helps replenish moisture.',
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
        module_id: 'm_product_overview',
        type: 'product_overview',
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
        module_id: 'm_product_overview',
        type: 'product_overview',
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
  // These tests exercise beauty-mode structured-module logic, which is
  // identical on the desktop beauty path. Pin matchMedia to desktop so
  // they render the (unchanged) desktop tree rather than the redesigned
  // BeautyPDPMobile early-return.
  beforeEach(() => {
    const matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
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
  });

  afterEach(() => {
    cleanup();
    routerPush.mockReset();
    getPdpV2Mock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders beauty ingredient + how-to-use accordions and suppresses structured detail sections', () => {
    // The redesign collapses structured detail modules into the Ingredients
    // and How-to-use accordions. The brand-story field still renders, but
    // structured detail sections (Overview, Clinical Results, product_overview
    // copy) are intentionally not rendered — Pivota Insights replaces merchant
    // marketing copy. The product_facts-vs-overview preference logic is
    // unit-covered in pdpDisplaySanitizers.test.ts.
    const payload = buildBeautyPayload();
    payload.product.merchant_id = 'merchant_beauty';

    render(
      <PdpContainer
        payload={payload}
        mode="beauty"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    const ingredientsAccordion = screen.getByRole('button', { name: 'Ingredients' });
    const howToUseAccordion = screen.getByRole('button', { name: 'How to use' });

    fireEvent.click(ingredientsAccordion);
    expect(screen.getByText('Active ingredients')).toBeInTheDocument();
    expect(screen.getAllByText('Ceramide NP').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Show full INCI' })).not.toBeInTheDocument();
    expect(screen.getByText(/Water/)).toBeInTheDocument();
    expect(screen.getAllByText(/Glycerin/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Cholesterol/)).toBeInTheDocument();

    fireEvent.click(howToUseAccordion);
    expect(screen.getByText('Apply after cleansing.')).toBeInTheDocument();

    // The brand-story product field still renders inside the detail
    // accordion; structured product_facts / product_overview sections do not.
    expect(screen.getAllByText('Brand Story').length).toBeGreaterThan(0);
    expect(screen.queryByText('Overview')).not.toBeInTheDocument();
    expect(screen.queryByText('Clinical Results')).not.toBeInTheDocument();
    expect(screen.queryByText('Rice-Infused Hydration')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Legacy Ingredients' })).not.toBeInTheDocument();
    expect(screen.queryByText('Retail PDP')).not.toBeInTheDocument();
    expect(screen.queryByText('PDP Section')).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Add to bag' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Buy Now/ })).toBeInTheDocument();
  });

  it('isolates external-seed beauty PDPs from legacy detail media and product information', () => {
    const payload = buildBeautyPayload();
    payload.modules.push({
      module_id: 'm_supplemental',
      type: 'supplemental_details',
      priority: 69,
      data: {
        sections: [
          {
            heading: 'Effortless Skin Enhancement',
            content_type: 'text',
            content: 'Captured merchant marketing copy that should be replaced by Pivota Insights.',
          },
          {
            heading: 'Category',
            content_type: 'text',
            content: 'external',
          },
        ],
      },
    });

    render(
      <PdpContainer payload={payload} mode="beauty" onAddToCart={() => {}} onBuyNow={() => {}} />,
    );

    // The redesign renders the detail accordions and the gallery hero, but
    // never the legacy "Product Information" supplemental block or the
    // captured merchant marketing copy it would have carried.
    expect(screen.getByRole('button', { name: 'Ingredients' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'How to use' })).toBeInTheDocument();
    expect(screen.getByAltText('Barrier Support Cream')).toBeInTheDocument();
    expect(screen.queryByText('Product Information')).not.toBeInTheDocument();
    expect(screen.queryByText(/Captured merchant marketing copy/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Effortless Skin Enhancement' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Category' })).not.toBeInTheDocument();
  });

  it('renders trusted external-seed product information when clean supplemental sections are present', () => {
    const payload = buildBeautyPayload();
    payload.product.product_id = 'ext_krave_oil_lala';
    payload.product.title = 'Oil La La';
    payload.product.description =
      "Don't believe the rumors. Oils aren't the enemy of oily, breakout-prone skin.";
    payload.modules.push({
      module_id: 'm_supplemental',
      type: 'supplemental_details',
      priority: 69,
      data: {
        sections: [
          {
            heading: 'Details',
            content_type: 'text',
            content:
              'Targets the root cause of breakouts by transforming acne-causing sebum with linoleic acid-rich oils to soothe and prevent congestion while supporting barrier health.',
          },
          {
            heading: 'How to Pair',
            content_type: 'text',
            content:
              'Matcha Hemp Hydrating Cleanser pairs well as a gentle first step, followed by Oat So Simple Water Cream for lightweight hydration.',
          },
          {
            heading: 'Category',
            content_type: 'text',
            content: 'Serum',
          },
        ],
      },
    });

    // The beauty redesign intentionally drops the legacy "Product
    // Information" supplemental block (Pivota Insights replaces it), so this
    // external-seed supplemental-section logic is now exercised through the
    // generic PDP path, which still renders it.
    render(
      <PdpContainer payload={payload} mode="generic" onAddToCart={() => {}} onBuyNow={() => {}} />,
    );

    expect(screen.getByText('Product Details')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'How to Pair' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Category' })).toBeInTheDocument();
  });

  it('keeps regulatory SPF active ingredients visible for external seeds', () => {
    const payload = buildBeautyPayload();
    payload.product.title = 'Daily Tinted Fluid Sunscreen SPF 40';
    payload.modules = payload.modules.map((module) => {
      if (module.type === 'active_ingredients') {
        return {
          ...module,
          data: {
            title: 'Active ingredients',
            items: ['Zinc Oxide'],
            source_origin: 'ingredients_inci',
            source_quality_status: 'authoritative',
          },
        };
      }
      if (module.type === 'ingredients_inci') {
        return {
          ...module,
          data: {
            title: 'Ingredients',
            raw_text:
              'Zinc Oxide, Water, Butyloctyl Salicylate, Glycerin, 1,2-Hexanediol, Tocopherol',
            items: [
              'Zinc Oxide',
              'Water',
              'Butyloctyl Salicylate',
              'Glycerin',
              '1,2-Hexanediol',
              'Tocopherol',
            ],
            source_origin: 'retail_pdp',
            source_quality_status: 'captured',
          },
        };
      }
      return module;
    });

    render(
      <PdpContainer payload={payload} mode="beauty" onAddToCart={() => {}} onBuyNow={() => {}} />,
    );

    // Regulatory/authoritative actives stay available — they live inside the
    // redesign's Ingredients accordion rather than a standalone module.
    fireEvent.click(screen.getByRole('button', { name: 'Ingredients' }));
    expect(screen.getByText('Active ingredients')).toBeInTheDocument();
    expect(screen.getAllByText('Zinc Oxide').length).toBeGreaterThan(0);
  });

  it('does not render formula ingredient modules on generic PDPs', () => {
    const payload = buildBeautyPayload();
    payload.product.title = 'Daily Tinted Fluid Sunscreen SPF 40';
    payload.modules = payload.modules.map((module) => {
      if (module.type === 'active_ingredients') {
        return {
          ...module,
          data: {
            title: 'Active ingredients',
            items: ['Zinc Oxide'],
            source_origin: 'ingredients_inci',
            source_quality_status: 'regulatory_active',
          },
        };
      }
      if (module.type === 'ingredients_inci') {
        return {
          ...module,
          data: {
            title: 'Ingredients',
            raw_text: 'Zinc Oxide, Water, Glycerin',
            items: ['Zinc Oxide', 'Water', 'Glycerin'],
            source_origin: 'retail_pdp',
            source_quality_status: 'captured',
          },
        };
      }
      return module;
    });

    render(
      <PdpContainer payload={payload} mode="generic" onAddToCart={() => {}} onBuyNow={() => {}} />,
    );

    expect(screen.queryByText('Active ingredients')).not.toBeInTheDocument();
    expect(screen.queryByText('Ingredients')).not.toBeInTheDocument();
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
        label_image_url: 'https://example.com/swatch-grape.jpg',
        price: { current: { amount: 22, currency: 'USD' } },
        availability: { in_stock: true, available_quantity: 9 },
      },
      {
        variant_id: 'shade_citrus',
        title: 'Citrus Sunshine',
        options: [{ name: 'Shade', value: 'Citrus Sunshine' }],
        beauty_meta: { shade_hex: '#f6a11a' },
        price: { current: { amount: 24, currency: 'USD' } },
        availability: { in_stock: true, available_quantity: 9 },
      },
    ];
    payload.product.price = { current: { amount: 22, currency: 'USD' } };

    render(
      <PdpContainer payload={payload} mode="beauty" onAddToCart={() => {}} onBuyNow={() => {}} />,
    );

    // Legacy shade-merchandising modules never render in the redesign...
    expect(screen.queryByText('Shade Matching')).not.toBeInTheDocument();
    expect(screen.queryByText('Popular Looks')).not.toBeInTheDocument();
    expect(screen.queryByText('Best For')).not.toBeInTheDocument();
    expect(screen.queryByText('Shade Gallery')).not.toBeInTheDocument();

    // ...but shades stay selectable through the redesign's swatch selector,
    // and selecting one still drives the headline price.
    const grape = screen.getByRole('button', { name: 'Shade Grape Fizz' });
    expect(grape).toBeInTheDocument();
    expect(grape.querySelector('span[style]')?.getAttribute('style')).toContain('swatch-grape.jpg');
    const citrus = screen.getByRole('button', { name: 'Shade Citrus Sunshine' });
    expect(citrus).toBeInTheDocument();

    fireEvent.click(citrus);

    expect(screen.getAllByText('$24').length).toBeGreaterThan(0);
  });

  it('renders cross-url product-line shades as swatches and switches in place', async () => {
    const payload = buildBeautyPayload();
    payload.product.product_id = 'ext_boj_dn350';
    payload.product.merchant_id = 'external_seed';
    payload.product.title = 'Daily Tinted Fluid Sunscreen DN350';
    payload.product.default_variant_id = '52402575475060';
    payload.product.variants = [
      {
        variant_id: '52402575475060',
        title: 'Default Title',
        options: [{ name: 'Title', value: 'Default Title' }],
        price: { current: { amount: 18, currency: 'USD' } },
        availability: { in_stock: true, available_quantity: 9 },
      },
    ];
    payload.product.product_line_option_name = 'Shade';
    payload.product.product_line_options = [
      {
        option_id: 'external_seed:ext_boj_dn310',
        option_name: 'Shade',
        axis: 'shade',
        value: 'dn310',
        label: 'DN310',
        secondary_label: 'Deep neutral',
        product_id: 'ext_boj_dn310',
        merchant_id: 'external_seed',
        image_url: 'https://example.com/dn310-swatch.jpg',
      },
      {
        option_id: 'external_seed:ext_boj_dn350',
        option_name: 'Shade',
        axis: 'shade',
        value: 'dn350',
        label: 'DN350',
        product_id: 'ext_boj_dn350',
        merchant_id: 'external_seed',
        swatch_color: '#c6beb5',
        selected: true,
      },
    ];
    const mediaModule = payload.modules.find((module) => module.type === 'media_gallery');
    if (mediaModule && typeof mediaModule.data === 'object' && mediaModule.data) {
      (mediaModule.data as any).preview_scope = 'product_line';
      (mediaModule.data as any).preview_items = [
        {
          type: 'image',
          url: 'https://example.com/dn310.jpg',
          alt_text: 'Daily Tinted Fluid Sunscreen DN310',
          product_id: 'ext_boj_dn310',
          merchant_id: 'external_seed',
        },
      ];
    }
    payload.modules.push({
      module_id: 'm_variant',
      type: 'variant_selector',
      priority: 95,
      data: {
        selected_variant_id: '52402575475060',
        product_line_option_name: 'Shade',
        product_line_options: payload.product.product_line_options,
      },
    } as any);
    const nextPayload = JSON.parse(JSON.stringify(payload)) as PDPPayload;
    nextPayload.product.product_id = 'ext_boj_dn310';
    nextPayload.product.title = 'Daily Tinted Fluid Sunscreen DN310';
    nextPayload.product.product_line_options = nextPayload.product.product_line_options?.map((option) => ({
      ...option,
      selected: option.product_id === 'ext_boj_dn310',
    }));
    nextPayload.modules = nextPayload.modules.map((module) =>
      module.type !== 'variant_selector'
        ? module
        : {
            ...module,
            data: {
              ...(module.data as Record<string, unknown>),
              product_line_options: nextPayload.product.product_line_options,
            },
          },
    );
    let resolvePdp: (value: unknown) => void = () => {};
    getPdpV2Mock
      .mockResolvedValueOnce({
        status: 'success',
        modules: [],
      })
      .mockReturnValueOnce(
        new Promise<any>((resolve) => {
          resolvePdp = resolve;
        }),
      )
      .mockResolvedValue({
        status: 'success',
        modules: [
          {
            type: 'canonical',
            data: {
              pdp_payload: nextPayload,
            },
          },
        ],
      });

    render(
      <PdpContainer payload={payload} mode="beauty" onAddToCart={() => {}} onBuyNow={() => {}} />,
    );

    expect(screen.getAllByText('Shade').length).toBeGreaterThan(0);
    const dn310Button = screen.getByRole('button', { name: 'DN310 · Deep neutral' });
    expect(dn310Button).toBeInTheDocument();
    expect(dn310Button).toHaveTextContent('Deep neutral');
    expect(dn310Button).not.toHaveTextContent('DN310');
    const dn310Swatch = dn310Button.querySelector('[aria-hidden="true"]');
    expect(dn310Swatch?.getAttribute('style')).toContain('dn310-swatch.jpg');
    expect(dn310Swatch).toHaveClass('h-10', 'w-10');
    expect(dn310Button.parentElement).toHaveClass('flex-nowrap');
    const dn350Button = screen.getByRole('button', { name: 'DN350' });
    expect(dn350Button).toHaveAttribute('aria-pressed', 'true');
    expect(dn350Button).toHaveClass('border-muted-foreground/50');
    expect(dn350Button).not.toHaveClass('ring-offset-1');
    expect(screen.queryByText('Title: Default Title')).not.toBeInTheDocument();
    expect(screen.queryByText('Product Line')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(getPdpV2Mock).toHaveBeenCalledTimes(1);
      expect(getPdpV2Mock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          product_id: 'ext_boj_dn310',
          merchant_id: 'external_seed',
          include: ['offers', 'variant_selector'],
        }),
      );
      expect(getPdpV2Mock.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          include: expect.not.arrayContaining(['product_intel', 'reviews_preview', 'similar']),
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'DN310 · Deep neutral' }));
    fireEvent.click(screen.getByRole('button', { name: 'DN310 · Deep neutral' }));

    expect(getPdpV2Mock).toHaveBeenCalledTimes(2);
    expect(getPdpV2Mock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        product_id: 'ext_boj_dn310',
        merchant_id: 'external_seed',
        include: expect.arrayContaining(['product_intel', 'variant_selector']),
      }),
    );
    expect(routerPush).not.toHaveBeenCalled();
    expect(screen.getByText('Switching to DN310...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'DN310 · Deep neutral' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'DN350' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'DN350' }));
    expect(getPdpV2Mock).toHaveBeenCalledTimes(2);

    resolvePdp({
      status: 'success',
      modules: [
        {
          type: 'canonical',
          data: {
            pdp_payload: nextPayload,
          },
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'DN310 · Deep neutral' })).toHaveAttribute('aria-pressed', 'true');
    });
    await waitFor(() => {
      expect(
        getPdpV2Mock.mock.calls.some(
          ([args]) => Array.isArray(args?.include) && args.include.includes('reviews_preview'),
        ),
      ).toBe(true);
      expect(
        getPdpV2Mock.mock.calls.some(
          ([args]) => Array.isArray(args?.include) && args.include.includes('similar'),
        ),
      ).toBe(true);
    });
  });

  it('uses the real shade variants when merged seller rows duplicate the variant axis', () => {
    const payload = buildBeautyPayload();
    payload.product.product_id = 'ext_rms_official';
    payload.product.merchant_id = 'external_seed';
    payload.product.title = 'Revitalize Hydra Concealer';
    payload.product.brand = { name: 'RMS Beauty' };
    payload.product.default_variant_id = '42127417966689';
    payload.product.variants = [
      {
        variant_id: '42127417966689',
        title: 'ON01',
        options: [{ name: 'Shade', value: 'ON01' }],
        label_image_url:
          'https://cdn.shopify.com/s/files/1/0642/6399/files/816248028979-RHC3-ON01-PACK-SHOT-900X1084.jpg?v=1754416529',
        price: { current: { amount: 34, currency: 'USD' } },
        availability: { in_stock: true, available_quantity: 9 },
      },
      {
        variant_id: '45621462253793',
        title: 'W023',
        options: [{ name: 'Shade', value: 'W023' }],
        label_image_url:
          'https://cdn.shopify.com/s/files/1/0642/6399/files/816248029167-RHC22-W023-PACK-SHOT-900X1084.jpg?v=1754416529',
        price: { current: { amount: 34, currency: 'USD' } },
        availability: { in_stock: true, available_quantity: 9 },
      },
    ];
    payload.product.product_line_option_name = 'Shade';
    payload.product.product_line_options = [
      {
        option_id: 'external_seed:ext_rms_official',
        option_name: 'Shade',
        axis: 'shade',
        value: 'on01',
        label: 'ON01',
        product_id: 'ext_rms_official',
        merchant_id: 'external_seed',
        selected: true,
      },
      {
        option_id: 'external_seed:ext_rms_dermstore',
        option_name: 'Shade',
        axis: 'shade',
        value: 'w023',
        label: 'W023',
        product_id: 'ext_rms_dermstore',
        merchant_id: 'external_seed',
        selected: true,
      },
    ];
    payload.modules.push({
      module_id: 'm_variant',
      type: 'variant_selector',
      priority: 95,
      data: {
        selected_variant_id: '42127417966689',
        product_line_option_name: 'Shade',
        product_line_options: payload.product.product_line_options,
      },
    } as any);

    render(
      <PdpContainer payload={payload} mode="beauty" onAddToCart={() => {}} onBuyNow={() => {}} />,
    );

    expect(screen.queryByText('Selected: ON01')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^W023$/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Shade W023' }));

    expect(
      screen.getByRole('button', { name: 'Shade W023' }).querySelector('span[style]')?.getAttribute('style'),
    ).toContain('w023_100x.png');
    expect(routerPush).not.toHaveBeenCalled();
    expect(getPdpV2Mock).not.toHaveBeenCalled();
  }, 10000);

  it('uses explicit swatch assets instead of variant product photos for shade chips', () => {
    const payload = buildBeautyPayload();
    payload.product.product_id = 'ext_swatch_preferred';
    payload.product.merchant_id = 'external_seed';
    payload.product.title = 'Longwear Lip Color';
    payload.product.brand = { name: 'Test Beauty' };
    payload.product.default_variant_id = 'shade-crimson';
    payload.product.variants = [
      {
        variant_id: 'shade-crimson',
        title: 'Crimson',
        options: [{ name: 'Shade', value: 'Crimson' }],
        swatch_image_url: 'https://example.com/crimson-swatch.png',
        label_image_url: 'https://example.com/crimson-product-ecomm-silo.jpg',
        image_url: 'https://example.com/crimson-product-ecomm-silo.jpg',
        price: { current: { amount: 22, currency: 'USD' } },
        availability: { in_stock: true },
      },
      {
        variant_id: 'shade-nude',
        title: 'Nude',
        options: [{ name: 'Shade', value: 'Nude' }],
        swatch_image_url: 'https://example.com/nude-swatch.png',
        label_image_url: 'https://example.com/nude-product-ecomm-silo.jpg',
        image_url: 'https://example.com/nude-product-ecomm-silo.jpg',
        price: { current: { amount: 22, currency: 'USD' } },
        availability: { in_stock: true },
      },
    ];

    render(
      <PdpContainer payload={payload} mode="beauty" onAddToCart={() => {}} onBuyNow={() => {}} />,
    );

    const crimsonStyle = screen
      .getByRole('button', { name: 'Shade Crimson' })
      .querySelector('span[style]')
      ?.getAttribute('style');
    expect(crimsonStyle).toContain('crimson-swatch.png');
    expect(crimsonStyle).not.toContain('product-ecomm-silo');
  });

  it('does not render product or packaging images as shade swatches when no trusted swatch exists', () => {
    const payload = buildBeautyPayload();
    payload.product.product_id = 'ext_product_photo_only';
    payload.product.merchant_id = 'external_seed';
    payload.product.title = 'Shade Fluid';
    payload.product.brand = { name: 'Test Beauty' };
    payload.product.default_variant_id = 'shade-guava';
    payload.product.variants = [
      {
        variant_id: 'shade-guava',
        title: 'Guava',
        options: [{ name: 'Shade', value: 'Guava' }],
        label_image_url: 'https://cdn.shopify.com/files/guava-product-ecomm-silo.jpg',
        image_url: 'https://cdn.shopify.com/files/guava-product-ecomm-silo.jpg',
        price: { current: { amount: 24, currency: 'USD' } },
        availability: { in_stock: true },
      },
      {
        variant_id: 'shade-apricot',
        title: 'Apricot',
        options: [{ name: 'Shade', value: 'Apricot' }],
        label_image_url: 'https://cdn.shopify.com/files/apricot-PACK-SHOT.jpg',
        image_url: 'https://cdn.shopify.com/files/apricot-PACK-SHOT.jpg',
        price: { current: { amount: 24, currency: 'USD' } },
        availability: { in_stock: true },
      },
      {
        variant_id: 'shade-carats',
        title: 'How Many Carats?!',
        options: [{ name: 'Shade', value: 'How Many Carats?!' }],
        swatch_image_url:
          'https://cdn.shopify.com/files/FB_FALL25_T2PRODUCT_ECOMM_BODY-LAVA_HMC_1200X1500_72DPI.jpg',
        price: { current: { amount: 24, currency: 'USD' } },
        availability: { in_stock: true },
      },
    ];

    render(
      <PdpContainer payload={payload} mode="beauty" onAddToCart={() => {}} onBuyNow={() => {}} />,
    );

    const guavaButton = screen.getByRole('button', { name: 'Shade Guava' });
    expect(guavaButton.querySelector('[style*="background-image"]')).toBeNull();
    expect(guavaButton).not.toHaveTextContent('PACK-SHOT');
    expect(guavaButton).toHaveTextContent('Guava');

    const caratsButton = screen.getByRole('button', { name: 'Shade How Many Carats?!' });
    expect(caratsButton.querySelector('[style*="background-image"]')).toBeNull();
    expect(caratsButton).toHaveTextContent('How');
  });

  it('renders concrete size explanations for mini and full-size product-line options', () => {
    const payload = buildBeautyPayload();
    payload.product.product_id = 'ext_rb_primer_mini';
    payload.product.merchant_id = 'external_seed';
    payload.product.title = 'Always an Optimist Pore Diffusing Primer Mini';
    payload.product.default_variant_id = 'v-mini';
    payload.product.variants = [
      {
        variant_id: 'v-mini',
        title: 'Default Title',
        options: [],
        price: { current: { amount: 17, currency: 'USD' } },
        availability: { in_stock: true, available_quantity: 4 },
      },
    ];
    payload.product.product_line_option_name = 'Size';
    payload.product.product_line_options = [
      {
        option_id: 'external_seed:ext_rb_primer_full',
        option_name: 'Size',
        axis: 'size',
        value: 'full size',
        label: 'Full Size',
        secondary_label: '0.94 fl oz / 28 mL',
        product_id: 'ext_rb_primer_full',
        merchant_id: 'external_seed',
      },
      {
        option_id: 'external_seed:ext_rb_primer_mini',
        option_name: 'Size',
        axis: 'size',
        value: 'mini',
        label: 'Mini',
        secondary_label: '0.50 fl oz / 15 mL',
        product_id: 'ext_rb_primer_mini',
        merchant_id: 'external_seed',
        selected: true,
      },
    ];
    payload.modules.push({
      module_id: 'm_variant',
      type: 'variant_selector',
      priority: 95,
      data: {
        selected_variant_id: 'v-mini',
        product_line_option_name: 'Size',
        product_line_options: payload.product.product_line_options,
      },
    } as any);

    render(
      <PdpContainer payload={payload} mode="beauty" onAddToCart={() => {}} onBuyNow={() => {}} />,
    );

    expect(screen.getByText(/^Selected:/)).toHaveTextContent(
      'Selected: Mini · 0.50 fl oz / 15 mL',
    );
    expect(screen.getByRole('button', { name: 'Mini · 0.50 fl oz / 15 mL' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Full Size · 0.94 fl oz / 28 mL' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mini · 0.50 fl oz / 15 mL' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('isolates legacy detail noise for external seeds when additive modules are absent', () => {
    const payload = buildBeautyPayload();
    payload.modules = payload.modules.filter(
      (module) =>
        module.type !== 'active_ingredients' &&
        module.type !== 'ingredients_inci' &&
        module.type !== 'how_to_use' &&
        module.type !== 'product_facts',
    );

    // The legacy detail-noise isolation + clean-overview fallback is
    // mode-agnostic; the beauty redesign no longer renders an Overview
    // section, so this is exercised through the generic PDP path.
    render(
      <PdpContainer payload={payload} mode="generic" onAddToCart={() => {}} onBuyNow={() => {}} />,
    );

    expect(screen.queryByText('Active ingredients')).toBeNull();
    expect(screen.queryByText('How to use')).toBeNull();
    expect(screen.queryByText('Legacy Ingredients')).not.toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
  });

  it('hides section-soup legacy overview when normalized insights are missing', () => {
    const payload = buildGenericSingleVariantPayload();
    payload.product.description = '';
    payload.modules = payload.modules.map((module) =>
      module.type !== 'product_overview'
        ? module
        : {
            ...module,
            data: {
              sections: [
                {
                  heading: 'Product Details',
                  content_type: 'text',
                  content:
                    'Details Full coverage concealer copy that was copied from the merchant PDP. Benefits 24H wear and crease resistance. Coverage Medium to full. Finish Natural matte. How to Use Apply to targeted areas and blend. Ingredients Water, Dimethicone, Glycerin.',
                },
              ],
            },
          },
    );

    render(
      <PdpContainer payload={payload} mode="generic" onAddToCart={() => {}} onBuyNow={() => {}} />,
    );

    expect(screen.queryByText('Product Details')).not.toBeInTheDocument();
    expect(screen.queryByText(/24H wear and crease resistance/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Water, Dimethicone, Glycerin/i)).not.toBeInTheDocument();
  });

  it('drops polluted product_facts and how-to-use blocks, then falls back to clean overview', () => {
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
      if (module.type === 'product_overview') {
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

    // The polluted-block dropping + clean-overview fallback in
    // chooseProductDetailsData is mode-agnostic; the beauty redesign no
    // longer renders an Overview section, so this is exercised through the
    // generic PDP path.
    render(
      <PdpContainer payload={payload} mode="generic" onAddToCart={() => {}} onBuyNow={() => {}} />,
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

    expect(screen.queryByText('Options')).not.toBeInTheDocument();
    expect(screen.queryByText('1 variant')).not.toBeInTheDocument();
    expect(screen.queryByText((_, element) => element?.textContent === 'Selected: Default')).not.toBeInTheDocument();
    expect(screen.queryAllByText('Default option')).toHaveLength(0);
    expect(screen.queryByText('Title: Default Title')).not.toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.queryAllByText('Product Details')).toHaveLength(1);
  });

  it('renders canonical single-SKU products even when variants are absent', () => {
    const payload = buildGenericSingleVariantPayload();
    payload.product.product_id = 'sig_no_variants';
    payload.product.default_variant_id = '';
    payload.product.variants = [];
    delete (payload as any).tracking;

    render(
      <PdpContainer
        payload={payload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    expect(screen.getByText(payload.product.title)).toBeInTheDocument();
    expect(screen.queryByText('Options')).not.toBeInTheDocument();
    expect(screen.queryAllByText('Default option')).toHaveLength(0);
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

  it('keeps an external seller selected when seller variants use different ids', async () => {
    const payload = buildMultiOfferVariantPricingPayload();
    payload.offers = [
      payload.offers![0],
      {
        ...payload.offers![1],
        price: { amount: 55, currency: 'EUR' },
        variants: [
          {
            variant_id: 'ULTA_SELLER_ONLY',
            title: 'Seller catalog default',
            options: [{ name: 'seller_sku', value: 'ULTA_SELLER_ONLY' }],
            price: { current: { amount: 55, currency: 'EUR' } },
            availability: { in_stock: true, available_quantity: 4 },
          },
        ],
      },
    ];

    render(
      <PdpContainer
        payload={payload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Other offers (1)' }));
    fireEvent.click(screen.getByRole('button', { name: /KraveBeauty/ }));

    await waitFor(() => {
      expect(screen.getAllByText('€55.00').length).toBeGreaterThan(0);
    });
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
