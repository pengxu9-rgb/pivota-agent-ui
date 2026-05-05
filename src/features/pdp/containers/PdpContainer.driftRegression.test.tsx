/* eslint-disable @next/next/no-img-element */
// Regression tests for the two PDP drift fixes:
//   - #121: loadMoreSimilarProducts must drop a stale fetch when the user
//     navigates to a different product before the fetch resolves.
//   - #122: when payload.recommendations changes session (variant switch
//     on the same product, strategy refresh, etc.) similarItems must be
//     REPLACED rather than merge-appended onto the previous session's items.
//
// These tests should fail against main pre-PR (commit f68fb34, before #121
// and #122 landed).
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdpContainer } from './PdpContainer';
import type { PDPPayload } from '@/features/pdp/types';

const routerPushMock = vi.fn();
const getSimilarProductsMainlineMock = vi.fn();
const getPdpV2Mock = vi.fn();
const toastMock = vi.fn();

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
    const { fill: _f, unoptimized: _u, priority: _p, fetchPriority: _fp, alt, ...rest } = props;
    return <img {...rest} alt={typeof alt === 'string' ? alt : ''} />;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

vi.mock('@/lib/api', () => ({
  listQuestions: vi.fn(async () => ({ items: [] })),
  postQuestion: vi.fn(async () => ({ question_id: 1 })),
  getSimilarProductsMainline: (...args: unknown[]) => getSimilarProductsMainlineMock(...args),
  getPdpV2: (...args: unknown[]) => getPdpV2Mock(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    message: (...args: unknown[]) => toastMock(...args),
    success: (...args: unknown[]) => toastMock(...args),
    error: (...args: unknown[]) => toastMock(...args),
  },
}));

function buildSimilar(count: number, prefix: string) {
  return Array.from({ length: count }).map((_, index) => ({
    product_id: `${prefix}_${index + 1}`,
    merchant_id: 'external_seed',
    title: `${prefix} Product ${index + 1}`,
    image_url: `https://example.com/${prefix}_${index + 1}.jpg`,
    price: { amount: 99 + index, currency: 'USD' },
  }));
}

function buildPayload(args: {
  productId: string;
  similarPrefix: string;
  similarCount?: number;
  hasMore?: boolean;
}): PDPPayload {
  return {
    schema_version: '1.0.0',
    page_type: 'product_detail',
    tracking: { page_request_id: `pr_${args.productId}`, entry_point: 'agent' },
    product: {
      product_id: args.productId,
      merchant_id: 'external_seed',
      title: 'Test Product',
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
        module_id: 'm_recs',
        type: 'recommendations',
        priority: 20,
        data: {
          strategy: 'related_products',
          items: buildSimilar(args.similarCount ?? 6, args.similarPrefix),
          metadata: { has_more: args.hasMore ?? false },
        },
      },
    ],
    actions: [
      { action_type: 'add_to_cart', label: 'Add to Cart', priority: 20, target: {} },
      { action_type: 'buy_now', label: 'Buy Now', priority: 10, target: {} },
    ],
  } as PDPPayload;
}

beforeEach(() => {
  IntersectionObserverMock.instances = [];
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: IntersectionObserverMock,
  });
  routerPushMock.mockReset();
  getSimilarProductsMainlineMock.mockReset();
  getPdpV2Mock.mockReset();
  toastMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('PdpContainer drift regressions', () => {
  // Regression for #122. Pre-fix, `mergeRecommendationItems(prev, incoming)`
  // unconditionally appended new items onto whatever similarItems already
  // contained. Because the sibling reset effect only fires on
  // payloadProductId change, a variant switch (same productId, different
  // recommendations.items) would leave the previous variant's items in
  // similarItems and merge new ones on top → mixed list.
  it('replaces similarItems when payload.recommendations switches to a different session on the same productId', async () => {
    const PRODUCT_ID = 'P_VARIANT_DRIFT_TEST';
    const payloadV1 = buildPayload({ productId: PRODUCT_ID, similarPrefix: 'variant1' });

    const { rerender } = render(
      <PdpContainer
        payload={payloadV1}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    // Variant 1's six items are visible.
    expect(screen.getByText('variant1 Product 1')).toBeInTheDocument();
    expect(screen.getByText('variant1 Product 6')).toBeInTheDocument();

    // Simulate variant switch on the same product: same productId, different
    // recommendations.items (e.g. backfill replaced the recommendations module
    // via mergeProductLineSimilarPayload).
    const payloadV2 = buildPayload({ productId: PRODUCT_ID, similarPrefix: 'variant2' });
    await act(async () => {
      rerender(
        <PdpContainer
          payload={payloadV2}
          mode="generic"
          onAddToCart={() => {}}
          onBuyNow={() => {}}
        />,
      );
    });

    // Variant 2's items must appear. Variant 1's must NOT — pre-fix they
    // would merge-append and stay in the DOM.
    expect(screen.getByText('variant2 Product 1')).toBeInTheDocument();
    expect(screen.getByText('variant2 Product 6')).toBeInTheDocument();
    expect(screen.queryByText('variant1 Product 1')).toBeNull();
    expect(screen.queryByText('variant1 Product 6')).toBeNull();
  });

  // Sanity check: same session (identical recommendations source) must
  // still merge so loadMore-style accumulation behaviour is preserved.
  // The check fires when the same payload object is re-emitted.
  it('keeps similarItems when the recommendations session key has not changed', async () => {
    const PRODUCT_ID = 'P_SAME_SESSION_TEST';
    const payload = buildPayload({ productId: PRODUCT_ID, similarPrefix: 'sess' });

    const { rerender } = render(
      <PdpContainer
        payload={payload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    expect(screen.getByText('sess Product 1')).toBeInTheDocument();

    // Re-emit a fresh payload reference but with the SAME recommendations
    // session (same first item id, same strategy, same product). The
    // similarItems must stay populated — merge no-ops because dedupe
    // discards the duplicates.
    const payloadAgain = buildPayload({ productId: PRODUCT_ID, similarPrefix: 'sess' });
    await act(async () => {
      rerender(
        <PdpContainer
          payload={payloadAgain}
          mode="generic"
          onAddToCart={() => {}}
          onBuyNow={() => {}}
        />,
      );
    });

    expect(screen.getByText('sess Product 1')).toBeInTheDocument();
    expect(screen.getByText('sess Product 6')).toBeInTheDocument();
  });

  // Regression for #121. Pre-fix, loadMoreSimilarProducts had no
  // requestId / cancellation token. A load-more triggered for product A
  // that resolved AFTER the user navigated to product B would still call
  // setSimilarItems(merged) merging A's loadMore items into B's similar
  // list.
  it('drops a stale loadMoreSimilarProducts result when the product changes mid-fetch', async () => {
    let resolveLoadMore: ((value: unknown) => void) | undefined;
    const loadMorePromise = new Promise((resolve) => {
      resolveLoadMore = resolve;
    });
    getSimilarProductsMainlineMock.mockReturnValueOnce(loadMorePromise);

    const productAPayload = buildPayload({
      productId: 'P_PRODUCT_A',
      similarPrefix: 'prodA',
      hasMore: true,
    });

    const { rerender } = render(
      <PdpContainer
        payload={productAPayload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    // Trigger load-more (the auto-load IntersectionObserver path).
    await act(async () => {
      IntersectionObserverMock.instances[0]?.trigger(true);
    });

    // Navigate to product B before the load-more promise resolves.
    const productBPayload = buildPayload({
      productId: 'P_PRODUCT_B',
      similarPrefix: 'prodB',
    });
    await act(async () => {
      rerender(
        <PdpContainer
          payload={productBPayload}
          mode="generic"
          onAddToCart={() => {}}
          onBuyNow={() => {}}
        />,
      );
    });

    // Now resolve the in-flight load-more with product-A items.
    await act(async () => {
      resolveLoadMore?.({
        strategy: 'related_products',
        items: buildSimilar(6, 'prodA_more'),
        metadata: { has_more: false },
        page_info: { page: 1, page_size: 6, total: 6, has_more: false },
      });
      // Let microtasks flush.
      await Promise.resolve();
      await Promise.resolve();
    });

    // Product B's similar items must be visible; product-A's load-more
    // items must NOT have leaked through.
    expect(screen.getByText('prodB Product 1')).toBeInTheDocument();
    expect(screen.queryByText('prodA_more Product 1')).toBeNull();
    expect(screen.queryByText('prodA_more Product 6')).toBeNull();
  });
});
