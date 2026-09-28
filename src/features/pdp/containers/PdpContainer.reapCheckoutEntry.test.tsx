/* eslint-disable @next/next/no-img-element */
// The Reap checkout demo entry on a real PDP render: OFF by default (nothing rendered, no request —
// the PDP is today's), ON only with the flag AND a demo merchant.
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdpContainer } from './PdpContainer';
import type { PDPPayload } from '@/features/pdp/types';
import { __resetReapConfigCacheForTests } from '@/components/reapCheckout/ReapCheckoutEntry';

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & Record<string, unknown>) => {
    const { fill: _f, unoptimized: _u, priority: _p, fetchPriority: _fp, alt, ...rest } = props as any;
    return <img {...rest} alt={typeof alt === 'string' ? alt : ''} />;
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/api', () => ({
  listQuestions: vi.fn(async () => ({ items: [] })),
  postQuestion: vi.fn(async () => ({ question_id: 1 })),
  getSimilarProductsMainline: vi.fn(async () => ({ items: [] })),
  getPdpV2: vi.fn(async () => null),
}));
vi.mock('sonner', () => ({ toast: { message: vi.fn(), success: vi.fn(), error: vi.fn() } }));

class IO {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

const STORE = 'https://judydoll.com/products/silky-matte-lip-ink?variant=49819267301653&utm_source=pivota';

function payload(): PDPPayload {
  return {
    schema_version: '1.0.0',
    page_type: 'product_detail',
    tracking: { page_request_id: 'pr_reap', entry_point: 'agent' },
    product: {
      product_id: 'sig_6433c8107859a484fb72d14861e84690',
      merchant_id: 'merch_obs_a25cbba37ef98c52',
      title: 'Silky Matte Lip Ink',
      default_variant_id: 'V001',
      external_redirect_url: STORE,
      purchase_route: 'affiliate_outbound',
      commerce_mode: 'links_out',
      variants: [
        {
          variant_id: 'V001',
          title: 'Default',
          price: { current: { amount: 16, currency: 'USD' } },
          availability: { in_stock: true, available_quantity: 5 },
        },
      ],
      price: { current: { amount: 16, currency: 'USD' } },
      availability: { in_stock: true, available_quantity: 5 },
    } as any,
    modules: [
      { module_id: 'm_media', type: 'media_gallery', priority: 100, data: { items: [{ type: 'image', url: 'https://example.com/hero.jpg' }] } },
      { module_id: 'm_price', type: 'price_promo', priority: 90, data: { price: { amount: 16, currency: 'USD' }, promotions: [] } },
    ],
    actions: [
      { action_type: 'add_to_cart', label: 'Add to Cart', priority: 20, target: {} },
      { action_type: 'buy_now', label: 'Buy Now', priority: 10, target: {} },
    ],
  } as PDPPayload;
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', IO as unknown as typeof IntersectionObserver);
});
afterAll(() => {
  vi.unstubAllGlobals();
});
beforeEach(() => {
  __resetReapConfigCacheForTests();
  fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ enabled: true, merchants: [{ domain: 'judydoll.com', market: 'US' }] }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

function reapCalls() {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/reap-checkout'));
}

describe('PDP: Buy with Reap entry', () => {
  it('flag OFF: no entry and no /api/reap-checkout request (the PDP is today\'s)', async () => {
    render(<PdpContainer payload={payload()} mode="generic" onAddToCart={() => {}} onBuyNow={() => {}} />);
    await screen.findByText('Silky Matte Lip Ink', undefined, { timeout: 2000 }).catch(() => null);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId('reap-entry')).toBeNull();
    expect(reapCalls()).toHaveLength(0);
  });

  it('flag ON + demo merchant: "Buy with Reap" beside the store link', async () => {
    vi.stubEnv('NEXT_PUBLIC_REAP_CHECKOUT_DEMO', '1');
    render(<PdpContainer payload={payload()} mode="generic" onAddToCart={() => {}} onBuyNow={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('reap-entry-button')).toBeInTheDocument());
    expect(reapCalls()).toHaveLength(1);
  });

  it('opens the checkout for the PDP\'s own sig_ id, not the offer\'s seller-side id', async () => {
    vi.stubEnv('NEXT_PUBLIC_REAP_CHECKOUT_DEMO', '1');
    const p = payload();
    p.modules.push({
      module_id: 'm_offers',
      type: 'offers',
      priority: 50,
      data: {
        offers: [
          {
            offer_id: 'of_1',
            product_id: 'ext_0f95730ee5ba05a6b7957ada',
            merchant_id: 'merch_obs_a25cbba37ef98c52',
            purchase_route: 'affiliate_outbound',
            commerce_mode: 'links_out',
            external_redirect_url: STORE,
            price: { amount: 16, currency: 'USD' },
          },
        ],
        offers_count: 1,
        default_offer_id: 'of_1',
      },
    } as any);
    render(<PdpContainer payload={p} mode="generic" onAddToCart={() => {}} onBuyNow={() => {}} />);
    fireEvent.click(await screen.findByTestId('reap-entry-button'));
    const set = (n: string, v: string) => fireEvent.change(document.querySelector(`input[name="${n}"]`)!, { target: { value: v } });
    set('first_name', 'Ada'); set('last_name', 'L'); set('email', 'a@example.test'); set('phone', '1');
    set('address_line1', '1 St'); set('city', 'SF');
    fireEvent.click(document.querySelector('input[name="consent"]')!);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ checkout: null, fallback: 'not_reap' }), { status: 200 }));
    fireEvent.click(screen.getByTestId('reap-submit'));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => u === '/api/reap-checkout')).toBe(true));
    const create = fetchMock.mock.calls.find(([u]) => u === '/api/reap-checkout')!;
    expect(JSON.parse(String((create[1] as RequestInit).body)).product_id).toBe('sig_6433c8107859a484fb72d14861e84690');
  });
});
