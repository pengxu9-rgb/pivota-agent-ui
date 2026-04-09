import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Page from './page';

const headersMock = vi.fn();

vi.mock('next/headers', () => ({
  headers: () => headersMock(),
}));

vi.mock('./BrandLandingPage', () => ({
  BrandLandingPage: (props: Record<string, unknown>) =>
    React.createElement('mock-brand-landing-page', props),
}));

describe('brand page server prefetch', () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(
      new Headers({
        host: 'agent.pivota.cc',
        'x-forwarded-proto': 'https',
      }),
    );
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    headersMock.mockReset();
  });

  it('prefetches an initial feed for plain brand routes', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        products: [
          {
            product_id: 'ext_brand_1',
            merchant_id: 'external_seed',
            title: 'Tom Ford Serum',
            price: 380,
            currency: 'USD',
            image_url: 'https://example.com/serum.jpg',
            description: 'Brand hero product',
          },
        ],
        metadata: { has_more: false },
        page: 1,
        page_size: 1,
        total: 1,
      }),
    } as Response);

    const element = await Page({
      params: Promise.resolve({ slug: 'tom-ford' }),
      searchParams: Promise.resolve({}),
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://agent.pivota.cc/api/gateway',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
      }),
    );
    expect((element as any).props.initialFeed).toEqual(
      expect.objectContaining({
        products: [
          expect.objectContaining({
            product_id: 'ext_brand_1',
            merchant_id: 'external_seed',
            title: 'Tom Ford Serum',
          }),
        ],
        page_info: expect.objectContaining({
          page: 1,
          page_size: 1,
          total: 1,
          has_more: false,
        }),
      }),
    );
  });
});
