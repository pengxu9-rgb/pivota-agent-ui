/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
        provenance: {
          generator: 'strict_human_manual_rewrite',
          selection_strategy: 'gemini_flash_first_then_strict_human_rewrite',
          reviewer_kind: 'human',
          review_status: 'completed',
          review_decision: 'rewrite',
          field_sources: {
            what_it_is: 'human_standard',
            why_it_stands_out: 'human_standard',
          },
          gemini_quality_gate: {
            human_standard_rewrite: true,
          },
        },
        source_coverage: { seller: true, formula: true },
        product_intel_core: {
          evidence_profile: 'seller_only',
          quality_state: 'limited',
          freshness: {
            generated_at: '2026-04-15T10:01:12.646Z',
            source_version: 'pilot_selected:strict_human_reviewed',
          },
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
      module_id: 'm_product_overview',
      type: 'product_overview',
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
                provenance: {
                  generator: 'baseline_plus_gemini',
                  review_status: 'pending',
                  review_decision: 'pending',
                },
                product_intel_core: {
                  ...module.data.product_intel_core!,
                  evidence_profile: 'seller_plus_formula',
                  quality_state: 'eligible',
                  freshness: {
                    generated_at: '2026-04-15T10:01:12.646Z',
                    source_version: 'pilot_selected:gemini-3-flash-preview',
                  },
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

  it('does not render specific-looking generated insights without reviewed provenance', () => {
    const generatedPayload: PDPPayload = {
      ...payload,
      modules: payload.modules.map((module) =>
        module.type !== 'product_intel'
          ? module
          : {
              ...module,
              data: {
                ...module.data,
                provenance: {
                  generator: 'baseline_plus_gemini',
                  review_status: 'pending',
                  review_decision: 'pending',
                },
                product_intel_core: {
                  ...module.data.product_intel_core!,
                  freshness: {
                    generated_at: '2026-04-15T10:01:12.646Z',
                    source_version: 'pilot_selected:gemini-3-flash-preview',
                  },
                  what_it_is: {
                    headline: 'Vitamin C serum',
                    body: 'A vitamin C serum with niacinamide and hyaluronic acid for tone and texture routines.',
                  },
                  why_it_stands_out: [
                    {
                      headline: 'Multi-active serum',
                      body: 'Combines vitamin C, niacinamide, and hyaluronic acid in one serum step.',
                    },
                  ],
                },
              },
            },
      ),
    };

    render(
      <PdpContainer
        payload={generatedPayload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    expect(screen.queryByText('Vitamin C serum')).not.toBeInTheDocument();
    expect(screen.queryByText(/niacinamide and hyaluronic acid/i)).not.toBeInTheDocument();
  });

  it('renders assistant-reviewed seller-grounded insights when they are product-specific', () => {
    const assistantReviewedPayload: PDPPayload = {
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
                provenance: {
                  generator: 'curated_override',
                  reviewer_kind: 'assistant',
                  review_status: 'completed',
                  review_decision: 'rewrite',
                  selection_strategy: 'curated_override',
                },
                product_intel_core: {
                  ...module.data.product_intel_core!,
                  evidence_profile: 'seller_plus_formula',
                  quality_state: 'eligible',
                  what_it_is: {
                    headline: 'Tinted mineral sunscreen',
                    body: 'A daily tinted mineral sunscreen centered on zinc oxide, flexible shade coverage, and a fluid skin-like finish.',
                  },
                  why_it_stands_out: [
                    {
                      headline: 'Flexible shade system',
                      body: 'The merchant FAQ describes 12 flexible shades and a shade-finder flow.',
                    },
                  ],
                },
              },
            },
      ),
    };

    render(
      <PdpContainer
        payload={assistantReviewedPayload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    expect(screen.getByText('Pivota Insights')).toBeInTheDocument();
    expect(screen.getByText('Tinted mineral sunscreen')).toBeInTheDocument();
    expect(screen.getByText('Flexible shade system')).toBeInTheDocument();
  });

  it('filters generic best-for title fallback labels from otherwise specific insights', () => {
    const filteredPayload: PDPPayload = {
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
                    headline: 'Mineral tinted SPF 40',
                    body: 'A mineral SPF 40 tinted fluid sunscreen with sheer coverage and a balanced finish.',
                  },
                  best_for: [
                    { label: 'Daily Use', tag: 'daily', confidence: 'low' },
                    { label: 'Sunscreen shoppers', tag: 'sunscreen', confidence: 'low' },
                    { label: 'Mineral SPF with tint', tag: 'mineral_spf', confidence: 'moderate' },
                  ],
                  why_it_stands_out: [
                    {
                      headline: 'Tint and SPF in one step',
                      body: 'Combines Zinc Oxide UV protection with sheer shade coverage.',
                    },
                  ],
                },
              },
            },
      ),
    };

    render(
      <PdpContainer
        payload={filteredPayload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    expect(screen.getByText('Pivota Insights')).toBeInTheDocument();
    expect(screen.getByText('Mineral SPF with tint')).toBeInTheDocument();
    expect(screen.queryByText('Daily Use')).not.toBeInTheDocument();
    expect(screen.queryByText('Sunscreen shoppers')).not.toBeInTheDocument();
  });

  it('renders long insight copy as complete text without ellipsis truncation', () => {
    const longCopy =
      'Combines Zinc Oxide UV protection with a fluid tint so it can work as the final morning SPF step or a light base for everyday wear.';
    const longCopyPayload: PDPPayload = {
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
                    headline: 'Mineral tinted SPF 40',
                    body: 'A mineral SPF 40 tinted fluid sunscreen with sheer coverage and a balanced finish.',
                  },
                  why_it_stands_out: [
                    {
                      headline: 'Tint and SPF in one step',
                      body: longCopy,
                    },
                  ],
                },
              },
            },
      ),
    };

    const { container } = render(
      <PdpContainer
        payload={longCopyPayload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    expect(screen.getByText(longCopy)).toBeInTheDocument();
    expect(container.textContent).not.toContain('…');
  });

  it('keeps Pivota Insights free of old line-clamp truncation classes', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/features/pdp/sections/PivotaInsightsSection.tsx'),
      'utf8',
    );

    expect(source).not.toContain('line-clamp');
    expect(source).not.toContain('truncate');
  });

  it('keeps clean product overview visible alongside Pivota Insights', () => {
    const dedupedPayload: PDPPayload = {
      ...payload,
      modules: payload.modules.map((module) =>
        module.type !== 'product_overview'
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
    expect(
      screen.getByText('Seller overview copy that would otherwise duplicate the normalized summary.'),
    ).toBeInTheDocument();
  });
});
