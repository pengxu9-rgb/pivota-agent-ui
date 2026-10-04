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
    // A Shopify-mirror offer: the gateway stamps no current_own_offer_status here; the selected
    // offer's own variant carries the price Reap may freeze as expected money.
    offers: [
      {
        offer_id: 'of_1',
        product_id: 'ext_0f95730ee5ba05a6b7957ada',
        merchant_id: 'merch_obs_a25cbba37ef98c52',
        purchase_route: 'affiliate_outbound',
        commerce_mode: 'links_out',
        external_redirect_url: STORE,
        price: { amount: 16, currency: 'USD' },
        variants: [{ variant_id: 'V001', title: 'Default', price: { current: { amount: 16, currency: 'USD' } } }],
      },
    ],
    offers_count: 1,
    default_offer_id: 'of_1',
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

/** The purchase bar: the element holding the quantity stepper and the CTAs. */
function purchaseBar(): HTMLElement {
  const dec = screen.getByRole('button', { name: 'Decrease quantity' });
  return dec.parentElement!.parentElement as HTMLElement;
}

function renderPdp(p: PDPPayload = payload()) {
  return render(<PdpContainer payload={p} mode="generic" onAddToCart={() => {}} onBuyNow={() => {}} />);
}

async function settle() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Decrease quantity' })).toBeInTheDocument());
  await new Promise((r) => setTimeout(r, 30));
}

describe('PDP purchase bar: Buy with Reap', () => {
  beforeEach(() => {
    // The standard shell (the production default) renders the sticky purchase bar.
    vi.stubEnv('NEXT_PUBLIC_GENERIC_PDP_USE_STANDARD_SHELL', 'true');
  });

  it('flag OFF: "View at <store>" is the only primary, no Reap CTA, no /api/reap-checkout request', async () => {
    renderPdp();
    await settle();
    const bar = purchaseBar();
    const buttons = Array.from(bar.querySelectorAll('button')).map((b) => b.getAttribute('aria-label') || b.textContent);
    expect(buttons).toEqual(['Decrease quantity', 'Increase quantity', 'View at retailer · $16']);
    expect(screen.queryByTestId('buybar-reap-primary')).toBeNull();
    expect(screen.queryByTestId('reap-entry')).toBeNull();
    expect(reapCalls()).toHaveLength(0);
  });

  it('flag ON but merchant not in the demo: the bar is byte-identical to flag OFF', async () => {
    const off = renderPdp();
    await settle();
    const offHtml = purchaseBar().outerHTML;
    off.unmount();

    vi.stubEnv('NEXT_PUBLIC_REAP_CHECKOUT_DEMO', '1');
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ enabled: true, merchants: [{ domain: 'jsmbeauty.sg', market: 'SG' }] }), { status: 200 }),
    );
    renderPdp();
    await settle();
    await waitFor(() => expect(reapCalls()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 30));
    expect(purchaseBar().outerHTML).toBe(offHtml);
  });

  it('flag ON + demo merchant: Reap is the primary, to the RIGHT of a secondary store button, inside the bar', async () => {
    vi.stubEnv('NEXT_PUBLIC_REAP_CHECKOUT_DEMO', '1');
    renderPdp();
    const primary = await screen.findByTestId('buybar-reap-primary');
    const bar = purchaseBar();
    expect(bar.contains(primary)).toBe(true);
    const secondary = screen.getByTestId('buybar-store-secondary');
    const order = Array.from(bar.querySelectorAll('button')).map((b) => b.dataset.testid || b.getAttribute('aria-label'));
    expect(order).toEqual(['Decrease quantity', 'Increase quantity', 'buybar-store-secondary', 'buybar-reap-primary']);
    // Primary: filled, shield icon, "Checkout with Reap", never shrinks — and NO price.
    expect(primary.textContent?.trim()).toBe('Checkout with Reap');
    expect(primary.className).toMatch(/\bshrink-0\b/);
    expect(primary.className).toMatch(/\bwhitespace-nowrap\b/);
    expect(primary.querySelector('svg.lucide-shield-check')).not.toBeNull();
    // Secondary: outlined, external-link icon; the one that yields at narrow widths.
    expect(secondary.className).toMatch(/border-foreground bg-white/);
    expect(secondary.className).toMatch(/\bmin-w-0\b/);
    expect(secondary.querySelector('svg.lucide-external-link')).not.toBeNull();
    // No floating pill any more.
    expect(screen.queryByTestId('reap-entry')).toBeNull();
    fireEvent.click(primary);
    expect(await screen.findByTestId('reap-panel')).toBeInTheDocument();
  });

  it('the Reap purchase bar never renders a computed total; the quantity reaches the checkout sheet', async () => {
    vi.stubEnv('NEXT_PUBLIC_REAP_CHECKOUT_DEMO', '1');
    renderPdp();
    await screen.findByTestId('buybar-reap-primary');
    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
    const bar = purchaseBar();
    const text = [bar.textContent || '', ...Array.from(bar.querySelectorAll('[aria-label]')).map((e) => e.getAttribute('aria-label') || '')].join(' ');
    // 3 x $16 = $48: neither the unit price nor any product of it appears in the Reap bar.
    expect(text).not.toMatch(/\$|16|48/);
    fireEvent.click(screen.getByTestId('buybar-reap-primary'));
    expect((await screen.findByTestId('reap-quantity')).textContent).toBe('Quantity: 3');
  });

  it('narrow widths: the secondary is "Visit store" (icon-only < 350px), wide shows "View at <store>"; no prices', async () => {
    vi.stubEnv('NEXT_PUBLIC_REAP_CHECKOUT_DEMO', '1');
    renderPdp();
    const secondary = await screen.findByTestId('buybar-store-secondary');
    const spans = Array.from(secondary.querySelectorAll(':scope > span'));
    const byLabel = Object.fromEntries(spans.map((el) => [el.textContent, el.className]));
    expect(byLabel['Visit store']).toMatch(/max-\[349px\]:sr-only/);
    expect(byLabel['Visit store']).toMatch(/min-\[560px\]:hidden/);
    expect(byLabel['View at retailer']).toMatch(/(^|\s)hidden(\s|$)/);
    expect(byLabel['View at retailer']).toMatch(/min-\[560px\]:inline/);
    expect(secondary.textContent).not.toMatch(/\$/);
    expect(secondary.getAttribute('aria-label')).toBe('View at retailer');
  });

  it('opens the checkout for the PDP\'s own sig_ id, not the offer\'s seller-side id', async () => {
    vi.stubEnv('NEXT_PUBLIC_REAP_CHECKOUT_DEMO', '1');
    const p = payload();
    // Sole-variant product whose offer lists no variants: the offer-level price is its own money.
    delete (p.offers![0] as any).variants;
    renderPdp(p);
    fireEvent.click(await screen.findByTestId('buybar-reap-primary'));
    await screen.findByTestId('reap-panel');
    const set = (n: string, v: string) => fireEvent.change(document.querySelector(`input[name="${n}"]`)!, { target: { value: v } });
    set('first_name', 'Ada'); set('last_name', 'L'); set('email', 'a@example.test'); set('phone', '+14155550100');
    set('address_line1', '1 St'); set('city', 'SF'); set('region', 'CA'); set('postal_code', '94103');
    fireEvent.click(document.querySelector('input[name="consent"]')!);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ scope: 'test-buyer-scope' }), { status: 200 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ checkout: null, fallback: 'not_reap' }), { status: 200 }));
    fireEvent.click(screen.getByTestId('reap-submit'));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => u === '/api/reap-checkout')).toBe(true));
    const create = fetchMock.mock.calls.find(([u]) => u === '/api/reap-checkout')!;
    const original=JSON.parse(String((create[1] as RequestInit).body));
    expect(original.product_id).toBe('sig_6433c8107859a484fb72d14861e84690');
    expect(original.expected_unit_price_minor).toBe(1600);
    expect(original.expected_currency).toBe('USD');
    expect(original).not.toHaveProperty('variant_id');
    expect(fetchMock.mock.calls.some(([u])=>u==='/api/reap-checkout/prepare')).toBe(false);
  });
});

/** Two shades of a mirror product; the offer's own variants carry each shade's price, no status flag. */
function twoShadePayload(offerVariants: Record<string, unknown>[]): PDPPayload {
  const p = payload();
  p.product.variants = [
    { variant_id: 'V001', title: 'Rose', options: [{ name: 'Color', value: 'Rose' }],
      price: { current: { amount: 16, currency: 'USD' } }, availability: { in_stock: true, available_quantity: 5 } },
    { variant_id: 'V002', title: 'Plum', options: [{ name: 'Color', value: 'Plum' }],
      price: { current: { amount: 15, currency: 'USD' } }, availability: { in_stock: true, available_quantity: 5 } },
  ] as any;
  (p.offers![0] as any).variants = offerVariants;
  return p;
}

const ROSE = { variant_id: 'V001', title: 'Rose', options: { Color: 'Rose' }, price: { current: { amount: 16, currency: 'USD' } } };

async function submitBuyer() {
  const set = (n: string, v: string) => fireEvent.change(document.querySelector(`input[name="${n}"]`)!, { target: { value: v } });
  set('first_name', 'Ada'); set('last_name', 'L'); set('email', 'a@example.test'); set('phone', '+14155550100');
  set('address_line1', '1 St'); set('city', 'SF'); set('region', 'CA'); set('postal_code', '94103');
  fireEvent.click(document.querySelector('input[name="consent"]')!);
  fireEvent.click(screen.getByTestId('reap-submit'));
}

/** The first money-carrying Reap request (prepare or create) the panel sent. */
async function firstMoneyRequest(): Promise<Record<string, unknown>> {
  let call: unknown[] | undefined;
  await waitFor(() => {
    call = fetchMock.mock.calls.find(([u]) => u === '/api/reap-checkout/prepare' || u === '/api/reap-checkout');
    expect(call).toBeTruthy();
  });
  return JSON.parse(String((call![1] as RequestInit).body));
}

async function expectNoReapPurchase() {
  await waitFor(() => expect(reapCalls().some(([u]) => u === '/api/reap-checkout/config')).toBe(true));
  await new Promise((r) => setTimeout(r, 30));
  expect(screen.queryByTestId('buybar-reap-primary')).toBeNull();
  expect(reapCalls().every(([u]) => u === '/api/reap-checkout/config')).toBe(true);
}

describe('PDP purchase bar: Reap is offered only with the selected offer\'s own current money', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_GENERIC_PDP_USE_STANDARD_SHELL', 'true');
    vi.stubEnv('NEXT_PUBLIC_REAP_CHECKOUT_DEMO', '1');
    window.sessionStorage.clear();
    window.localStorage.clear();
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/reap-checkout/session') return new Response(JSON.stringify({ scope: 'test-buyer-scope' }), { status: 200 });
      if (url === '/api/reap-checkout/config') {
        return new Response(JSON.stringify({ enabled: true, merchants: [{ domain: 'judydoll.com', market: 'US' }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ checkout: null, fallback: 'not_reap', attempt_outcome: 'not_created' }), { status: 200 });
    });
  });

  it('ACCEPT mirror shape: no status flag, offer variant matched by id -> CTA with that variant\'s 13.99', async () => {
    renderPdp(twoShadePayload([ROSE, { variant_id: 'V002', title: 'Plum', options: { Color: 'Plum' }, price: { current: { amount: 13.99, currency: 'USD' } } }]));
    await screen.findByTestId('buybar-reap-primary');
    fireEvent.click(screen.getByRole('button', { name: /Plum/ }));
    fireEvent.click(await screen.findByTestId('buybar-reap-primary'));
    await screen.findByTestId('reap-panel');
    await submitBuyer();
    expect(await firstMoneyRequest()).toMatchObject({ variant_id: 'V002', expected_unit_price_minor: 1399, expected_currency: 'USD' });
  });

  it('REFUSE: the matched offer variant has no price -> no Reap, never the offer-level 16', async () => {
    renderPdp(twoShadePayload([ROSE, { variant_id: 'V002', title: 'Plum', options: { Color: 'Plum' } }]));
    await screen.findByTestId('buybar-reap-primary');
    fireEvent.click(screen.getByRole('button', { name: /Plum/ }));
    await expectNoReapPurchase();
    // Only the Reap purchase is withdrawn; the store route stays as it is without Reap.
    expect(screen.getByRole('button', { name: /View at/ })).toBeEnabled();
  });

  it('REFUSE: the offer variant matches the selected shade only by title -> no Reap', async () => {
    renderPdp(twoShadePayload([ROSE, { variant_id: 'SHOP_OTHER', title: 'Plum', price: { current: { amount: 13.99, currency: 'USD' } } }]));
    await screen.findByTestId('buybar-reap-primary');
    fireEvent.click(screen.getByRole('button', { name: /Plum/ }));
    await expectNoReapPurchase();
  });

  it('REFUSE: no selected offer -> the catalog variant price is not purchase money', async () => {
    const p = payload();
    delete (p as any).offers;
    delete (p as any).offers_count;
    delete (p as any).default_offer_id;
    renderPdp(p);
    await expectNoReapPurchase();
  });
});
