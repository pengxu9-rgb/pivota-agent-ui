/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const payload: PDPPayload = {
  schema_version: '1.0.0',
  page_type: 'product_detail',
  tracking: {
    page_request_id: 'pr_review_nav',
    entry_point: 'agent',
  },
  product: {
    product_id: 'P001',
    merchant_id: 'merch_test',
    title: 'Review Nav Product',
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
      module_id: 'm_reviews',
      type: 'reviews_preview',
      priority: 50,
      data: {
        scale: 5,
        rating: 4.2,
        review_count: 12,
        preview_items: [],
        entry_points: {
          write_review: { label: 'Write a review' },
        },
      },
    },
  ],
  actions: [
    { action_type: 'add_to_cart', label: 'Add to Cart', priority: 20, target: {} },
    { action_type: 'buy_now', label: 'Buy Now', priority: 10, target: {} },
  ],
};

describe('PdpContainer review navigation context', () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('passes embed context to write-review route when in embed mode', () => {
    window.history.replaceState(
      null,
      '',
      '/products/P001?embed=1&entry=aurora_chatbox&parent_origin=https%3A%2F%2Faurora.pivota.cc',
    );

    render(
      <PdpContainer
        payload={payload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
        ugcCapabilities={{
          canUploadMedia: true,
          canWriteReview: true,
          canAskQuestion: true,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /write a review/i }));
    expect(pushMock).toHaveBeenCalledTimes(1);

    const href = String(pushMock.mock.calls[0]?.[0] || '');
    expect(href.startsWith('/reviews/write?')).toBe(true);
    const query = href.split('?')[1] || '';
    const sp = new URLSearchParams(query);
    expect(sp.get('product_id')).toBe('P001');
    expect(sp.get('merchant_id')).toBe('merch_test');
    expect(sp.get('embed')).toBe('1');
    expect(sp.get('entry')).toBe('aurora_chatbox');
    expect(sp.get('parent_origin')).toBe('https://aurora.pivota.cc');
    expect(sp.get('return')).toBeNull();
  });

  it('passes local return context when not in embed mode', () => {
    window.history.replaceState(null, '', '/products/P001?merchant_id=merch_test');

    render(
      <PdpContainer
        payload={payload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
        ugcCapabilities={{
          canUploadMedia: true,
          canWriteReview: true,
          canAskQuestion: true,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /write a review/i }));
    expect(pushMock).toHaveBeenCalledTimes(1);

    const href = String(pushMock.mock.calls[0]?.[0] || '');
    const query = href.split('?')[1] || '';
    const sp = new URLSearchParams(query);
    expect(sp.get('return')).toBe('/products/P001?merchant_id=merch_test');
  });

  it('back button prefers safe return query target', () => {
    window.history.replaceState(
      null,
      '',
      '/products/P001?merchant_id=merch_test&return=%2Fproducts%3Fq%3Dlipstick',
    );

    render(
      <PdpContainer
        payload={payload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
        ugcCapabilities={{
          canUploadMedia: true,
          canWriteReview: true,
          canAskQuestion: true,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /go back/i }));
    expect(pushMock).toHaveBeenCalledWith('/products?q=lipstick');
  });

  it('back button falls back to /products when return query is unsafe', () => {
    window.history.replaceState(
      null,
      '',
      '/products/P001?merchant_id=merch_test&return=https%3A%2F%2Fevil.example.com',
    );

    render(
      <PdpContainer
        payload={payload}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
        ugcCapabilities={{
          canUploadMedia: true,
          canWriteReview: true,
          canAskQuestion: true,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /go back/i }));
    expect(pushMock).toHaveBeenCalledWith('/products');
  });
});
