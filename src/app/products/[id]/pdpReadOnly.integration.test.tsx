import { __resetReapConfigCacheForTests } from '@/components/reapCheckout/ReapCheckoutEntry';
import unknownSource from '@/features/pdp/__fixtures__/canonicalOfferLive20261004/unknown-canonical-source.json';
/* eslint-disable @next/next/no-img-element */
// Captured public identities/content run through the real local gateway route with
// mocked persistence. These are route outputs, not a claim of live acceptance.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import verifiedNumericVariant from '@/features/pdp/__fixtures__/canonicalOfferLive20261004/fullcream-verified-numeric-variant.json';
import verifiedFullCream from '@/features/pdp/__fixtures__/canonicalOfferLive20261004/fullcream-verified-current-own-offer.json';
import verifiedTwoVariants from '@/features/pdp/__fixtures__/canonicalOfferLive20261004/fullcream-variant-proof-true.json';
import verifiedFirstVariant from '@/features/pdp/__fixtures__/canonicalOfferLive20261004/fullcream-variant-proof-false.json';
import { hasVerifiedSelectedCommerce } from '@/features/pdp/utils/commerceAvailability';
import fullCream from '@/features/pdp/__fixtures__/canonicalOfferLive20261004/sig_6bb6c7ae7b7e71e838aefb564c60371a.json';
import missha from '@/features/pdp/__fixtures__/canonicalOfferLive20261004/sig_7dbc9be45ef987752f80014d6abaac30.json';
import beePollen from '@/features/pdp/__fixtures__/canonicalOfferLive20261004/sig_6bf0fddcae29af92f2556dd0e2687196.json';
import { isValidVerifiedPdpResponse } from '@/features/pdp/utils/commerceAvailability';
import { mapPdpV2ToPdpPayload } from '@/features/pdp/adapter/mapPdpV2ToPdpPayload';
import { PdpContainer } from '@/features/pdp/containers/PdpContainer';
import { renderPdpPage, PDP_DEGRADED_RENDER_ERROR } from './pdpServerPage';
import ProductDetailClient from './ProductDetailClient';
import { buildProductJsonLd } from './productJsonLd';

const state = vi.hoisted(() => ({ id: '', desktop: false }));
const api = vi.hoisted(() => ({ get: vi.fn(), cached: vi.fn(), cart: vi.fn(), push: vi.fn() }));
vi.mock('react', async () => ({ ...await vi.importActual<typeof import('react')>('react'), cache: (fn: any) => fn, use: () => ({ id: state.id }) }));
vi.mock('next/image', () => ({ default: ({ fill: _f, unoptimized: _u, priority: _p, fetchPriority: _fp, alt, ...props }: any) => <img {...props} alt={alt || ''} /> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: api.push, replace: vi.fn() }), notFound: () => { throw new Error('not found'); }, unstable_rethrow: vi.fn() }));
vi.mock('next/cache', () => ({ unstable_noStore: vi.fn() }));
vi.mock('./useUrlSearchParams', () => ({ useUrlSearchParams: () => new URLSearchParams() }));
vi.mock('@/features/pdp/hooks/useIsDesktop', () => ({ useIsDesktop: () => state.desktop }));
vi.mock('@/store/authStore', () => ({ useAuthStore: (selector: any) => selector({ user: null }) }));
vi.mock('@/store/cartStore', () => ({ useCartStore: () => ({ addItem: api.cart, open: vi.fn() }) }));
vi.mock('@/lib/api', () => ({
  getPdpV2: (...args: any[]) => api.get(...args), getPdpV2Cached: (...args: any[]) => api.cached(...args),
  getServicesBrowse: async () => ({ results: [] }), getPdpRouteIdExistenceCached: async () => ({ exists: true }),
  getPdpV2Personalization: async () => ({}), recordBrowseHistoryEvent: vi.fn(), resolveProductCandidates: async () => null,
  getSimilarProductsMainline: async () => ({ items: [] }), listQuestions: async () => ({ items: [] }), postQuestion: vi.fn(),
}));
vi.mock('@/features/pdp/tracking', () => ({ pdpTracking: { track: vi.fn(), setBaseContext: vi.fn() } }));
vi.mock('@/components/reapCheckout/ReapCheckoutPanel', () => ({ ReapCheckoutPanel: (props: any) => <div data-testid="proof-reap-panel">{props.productId}</div> }));
vi.mock('sonner', () => ({ toast: { message: vi.fn(), success: vi.fn(), error: vi.fn() } }));

const receipts = [fullCream, missha, beePollen];
// Route fixtures preserve recorded verification instants. Isolated positive
// controls simulate the same DB verification occurring at the test's current time.
const body = (receipt: any = fullCream) => {
  const response = structuredClone(receipt.body) as any;
  const data = response.modules.find((module: any) => module.type === 'canonical')?.data;
  const instant = Date.now();
  for (const proof of [response.metadata?.commerce, data?.commerce, data?.pdp_payload?.commerce]) {
    if (proof?.state === 'ready') {
      proof.verified_at = new Date(instant).toISOString();
      proof.expires_at = new Date(instant + 60000).toISOString();
    }
  }
  return response;
};
const canonical = (response: any) => response.modules.find((module: any) => module.type === 'canonical').data;
const payload = (receipt = fullCream) => mapPdpV2ToPdpPayload(body(receipt))!;
function expectNoPurchases() {
  expect(screen.queryByRole('button', { name: /buy now|add to (bag|cart)|view at|checkout with reap/i })).toBeNull();
  expect(screen.queryByTestId('buybar-reap-primary')).toBeNull();
  expect(api.cart).not.toHaveBeenCalled();
  expect(api.push).not.toHaveBeenCalled();
}
beforeEach(() => {
  __resetReapConfigCacheForTests();
  vi.clearAllMocks(); state.id = fullCream.body.subject.id; state.desktop = false;
  window.localStorage.clear(); window.sessionStorage.clear();
  vi.stubEnv('NEXT_PUBLIC_GENERIC_PDP_USE_STANDARD_SHELL', 'true');
  vi.stubEnv('NEXT_PUBLIC_REAP_CHECKOUT_DEMO', '1');
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ enabled: false }), { status: 200 })));
  api.get.mockResolvedValue(body()); api.cached.mockResolvedValue(body());
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('actual PDP rendering of canonical read-only gateway route outputs', () => {
  it.each(receipts)('server-renders real evidence without commerce for $body.subject.id', async (receipt) => {
    state.id = receipt.body.subject.id;
    api.cached.mockResolvedValue(body(receipt));
    const page = await renderPdpPage({ params: Promise.resolve({ id: state.id }) }, { personalized: false });
    const html = renderToStaticMarkup(page);
    expect(html).toContain(canonical(receipt.body).pdp_payload.product.title);
    expect(html).toContain('Current price and purchase unavailable');
    expect(html).toContain('Price unavailable');
    expect(html).not.toMatch(/Out of stock|In stock|\$0\.00|"offers"\s*:|schema.org\/(?:InStock|OutOfStock)/);
    expect(api.cached).toHaveBeenCalledWith(expect.objectContaining({ allow_read_only: true }));
  });

  it.each(['beauty', 'fashion', 'electronics', 'generic'] as const)('%s mobile and desktop keep read-only evidence with no executable purchase controls', (mode) => {
    for (const desktop of [false, true]) {
      state.desktop = desktop;
      const onBuyNow = vi.fn(); const onAddToCart = vi.fn();
      render(<PdpContainer payload={payload()} mode={mode} onBuyNow={onBuyNow} onAddToCart={onAddToCart} />);
      expect(screen.getByText('Current price and purchase unavailable')).toBeInTheDocument();
      expect(screen.getAllByText('Price unavailable').length).toBeGreaterThan(0);
      expect(document.body.textContent).not.toMatch(/Out of stock|In stock|\$0\.00/);
      expectNoPurchases(); expect(onBuyNow).not.toHaveBeenCalled(); expect(onAddToCart).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it('discards stale money, seller offers and destinations even when merged into a typed read-only result', () => {
    const response = body(); const p = canonical(response).pdp_payload;
    p.product.price = { current: { amount: 12, currency: 'USD' } };
    p.product.availability = { in_stock: false };
    p.product.url = 'https://merchant.example.test/checkout';
    p.product.variants[0].price = { current: { amount: 12, currency: 'USD' } };
    p.actions = [{ action_type: 'buy_now', label: 'Buy now', priority: 1, target: {} }];
    response.modules.find((module: any) => module.type === 'offers').data.offers = [{ offer_id: 'stale', merchant_id: 'wrong_seller', price: { amount: 9, currency: 'USD' }, url: p.product.url }];
    const mapped = mapPdpV2ToPdpPayload(response)!;
    render(<PdpContainer payload={mapped} mode="beauty" onBuyNow={api.cart} onAddToCart={api.cart} />);
    expectNoPurchases();
    expect(document.body.textContent).not.toMatch(/\$12|\$9|Out of stock/);
    expect(JSON.parse(buildProductJsonLd({ product: mapped.product, productId: state.id })!)).not.toHaveProperty('offers');
  });

  it.each(['missing_marker', 'string_boolean', 'read_failed', 'missing_product'] as const)('keeps malformed %s as an uncacheable SSR error', async (change) => {
    const response = body(); const data = canonical(response);
    if (change === 'missing_marker') delete response.metadata.commerce;
    if (change === 'string_boolean') response.metadata.commerce.read_only = 'true';
    if (change === 'read_failed') response.metadata.commerce.reason_code = 'CURRENT_OWN_OFFER_READ_FAILED';
    if (change === 'missing_product') delete data.pdp_payload.product;
    api.cached.mockResolvedValue(response);
    await expect(renderPdpPage({ params: Promise.resolve({ id: state.id }) }, { personalized: false })).rejects.toThrow(PDP_DEGRADED_RENDER_ERROR);
  });

  it('preserves an actual read failure as degraded instead of showing unavailable inventory', async () => {
    api.cached.mockRejectedValue(Object.assign(new Error('read failed'), { status: 503, code: 'CURRENT_OWN_OFFER_READ_FAILED' }));
    await expect(renderPdpPage({ params: Promise.resolve({ id: state.id }) }, { personalized: false })).rejects.toThrow(PDP_DEGRADED_RENDER_ERROR);
  });

  it('projects verified cached commerce out of SSR, then enables only a fresh exact proof', async () => {
    const cached = body(verifiedFullCream); cached.metadata.commerce_verification = 'refresh_required';
    expect(isValidVerifiedPdpResponse(cached)).toBe(true);
    expect(JSON.stringify(mapPdpV2ToPdpPayload(cached))).not.toContain('19.95');
    api.cached.mockResolvedValue(cached);
    const page = await renderPdpPage({ params: Promise.resolve({ id: state.id }) }, { personalized: false });
    const html = renderToStaticMarkup(page);
    expect(html).toContain('Checking current price and purchase availability');
    expect(html).not.toMatch(/19.95|"offers"\s*:|schema.org\/InStock/);
    let resolveCore!: (value: any) => void;
    const pendingCore = new Promise((resolve) => { resolveCore = resolve; });
    api.get.mockImplementation((args: any) => args.include.includes('offers') ? pendingCore : body());
    render(<ProductDetailClient params={Promise.resolve({ id: state.id })} initialPayload={mapPdpV2ToPdpPayload(cached)!} />);
    expect(screen.getByText('Checking current price and purchase availability')).toBeInTheDocument();
    expectNoPurchases();
    resolveCore(body(verifiedFullCream));
    await waitFor(() => expect(screen.queryByText('Checking current price and purchase availability')).toBeNull());
    expect(screen.getByRole('button', { name: /view at retailer/i })).toBeEnabled();
    expect(screen.getAllByText('$19.95').length).toBeGreaterThan(0);
  });

  it.each(['missing_envelope', 'seller_mismatch', 'variant_mismatch', 'zero_price', 'conflicting_currency'] as const)(
    'rejects fresh positive %s rather than re-enabling cached purchases', async (change) => {
      const response = body(verifiedFullCream); const data = canonical(response);
      if (change === 'missing_envelope') delete response.metadata.commerce;
      if (change === 'seller_mismatch') data.selected_commerce_ref.merchant_id = 'unrelated_seller';
      if (change === 'variant_mismatch') data.pdp_payload.product.default_variant_id = 'unrelated_variant';
      if (change === 'zero_price') data.pdp_payload.product.variants[0].price.current.amount = 0;
      if (change === 'conflicting_currency') data.pdp_payload.product.variants[0].price.current.currency = 'AUD';
      expect(isValidVerifiedPdpResponse(response)).toBe(false);
      const cached = body(verifiedFullCream); cached.metadata.commerce_verification = 'refresh_required';
      api.get.mockResolvedValue(response);
      render(<ProductDetailClient params={Promise.resolve({ id: state.id })} initialPayload={mapPdpV2ToPdpPayload(cached)!} />);
      await screen.findByText('Current price and purchase availability could not be verified');
      expectNoPurchases();
      expect(document.body.textContent).not.toContain('$19.95');
    },
  );

  it('numeric selected-variant proof survives the actual adapter and renders its own control money', () => {
    const response = body(verifiedNumericVariant);
    expect(isValidVerifiedPdpResponse(response)).toBe(true);
    const p = mapPdpV2ToPdpPayload(response)!;
    expect(p.product.default_variant_id).toBe('111');
    render(<PdpContainer payload={p} mode="beauty" onBuyNow={api.cart} onAddToCart={api.cart} />);
    expect(screen.getByRole('button', { name: /view at retailer/i })).toBeEnabled();
    expect(screen.getAllByText('$19.95').length).toBeGreaterThan(0);
  });

  it('a read-only Similar detail navigates to evidence and cannot start checkout or open a retailer', async () => {
    const p = payload(); const similar = canonical(missha.body).pdp_payload.product;
    // Isolated recommendation placement; its fetched detail is the unchanged route output.
    p.modules.push({ module_id: 'similar', type: 'recommendations', priority: 50, data: { items: [{
      product_id: similar.product_id, merchant_id: similar.merchant_id, title: similar.title, image_url: similar.image_url,
    }] } });
    api.get.mockResolvedValue(body(missha));
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<PdpContainer payload={p} mode="beauty" onBuyNow={api.cart} onAddToCart={api.cart} />);
    fireEvent.click(screen.getByRole('button', { name: `Buy ${similar.title}` }));
    await waitFor(() => expect(api.push).toHaveBeenCalledWith(expect.stringContaining(`/products/${similar.product_id}`)));
    expect(api.get).toHaveBeenCalledWith(expect.objectContaining({ merchant_id: similar.merchant_id, allow_read_only: true }));
    expect(open).not.toHaveBeenCalled(); expect(api.cart).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/\$0(?:\.00)?\b/);
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/prepare') || String(url).includes('/checkout/'))).toBe(false);
    open.mockRestore();
  });

  it('a later read-only content result revokes verified commerce, and later ready content cannot restore it', async () => {
    const fresh = mapPdpV2ToPdpPayload(body(verifiedFullCream))!;
    let settleContent!: (value: any) => void;
    let settleSimilar!: (value: any) => void;
    api.get.mockImplementation((args: any) => args.include.includes('similar')
      ? new Promise((resolve) => { settleSimilar = resolve; })
      : new Promise((resolve) => { settleContent = resolve; }));
    render(<ProductDetailClient params={Promise.resolve({ id: state.id })} initialPayload={fresh} />);
    expect(screen.getByRole('button', { name: /view at retailer/i })).toBeEnabled();
    await act(async () => settleContent(body()));
    expect(screen.getByText('Current price and purchase unavailable')).toBeInTheDocument();
    expectNoPurchases();
    await act(async () => settleSimilar(body(verifiedFullCream)));
    expect(screen.getByText('Current price and purchase unavailable')).toBeInTheDocument();
    expectNoPurchases();
  });

  it('keeps cached evidence visible if fresh commerce verification fails' , async () => {
    const cached = body(); cached.metadata.commerce_verification = 'refresh_required';
    api.get.mockRejectedValue(Object.assign(new Error('read failed'), { status: 503, code: 'CURRENT_OWN_OFFER_READ_FAILED' }));
    render(<ProductDetailClient params={Promise.resolve({ id: state.id })} initialPayload={mapPdpV2ToPdpPayload(cached)!} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.objectContaining({ cache_bypass: true, allow_read_only: true })));
    expect(screen.getByRole('heading', { name: 'Full Cream Moisturizer' })).toBeInTheDocument();
    expect(screen.getByText('Current price and purchase unavailable')).toBeInTheDocument();
    expectNoPurchases();
  });
});


it('verified default money cannot enable an unverified alternate variant even if stale price is injected', () => {
  const p = mapPdpV2ToPdpPayload(body(verifiedFirstVariant))!;
  const alternate = p.product.variants.find((variant) => variant.variant_id === '222')!;
  // Simulates a legacy/stale caller carrying a price alongside a newer bounded proof.
  alternate.price = { current: { amount: 28.9, currency: 'USD' } };
  delete alternate.current_own_offer_status;
  const buy = vi.fn();
  render(<PdpContainer payload={p} mode="beauty" onBuyNow={buy} onAddToCart={buy} />);
  fireEvent.click(screen.getByRole('button', { name: '500 g' }));
  expect(screen.getByText('Current price and purchase availability for this selection are unverified')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /view at retailer|buy now|add to/i })).toBeNull();
  expect(buy).not.toHaveBeenCalled();
});

it('a second variant with its own source-bound money remains selectable and usable', () => {
  const p = mapPdpV2ToPdpPayload(body(verifiedTwoVariants))!;
  const buy = vi.fn();
  render(<PdpContainer payload={p} mode="beauty" onBuyNow={buy} onAddToCart={buy} />);
  fireEvent.click(screen.getByRole('button', { name: '500 g' }));
  fireEvent.click(screen.getByRole('button', { name: /view at retailer/i }));
  expect(buy).toHaveBeenCalledWith(expect.objectContaining({ variant: expect.objectContaining({ variant_id: '222', price: { current: { amount: 31.5, currency: 'USD' } } }) }));
});

it('selection proof cannot transfer to another seller, another product or different currency', () => {
  const p = mapPdpV2ToPdpPayload(body(verifiedTwoVariants))!;
  const variant = p.product.variants[0];
  expect(hasVerifiedSelectedCommerce(p, variant)).toBe(true);
  expect(hasVerifiedSelectedCommerce(p, variant, { merchantId: 'different-merchant' })).toBe(false);
  expect(hasVerifiedSelectedCommerce(p, variant, { productId: 'different-product' })).toBe(false);
  expect(hasVerifiedSelectedCommerce(p, { ...variant, price: { current: { ...variant.price!.current, currency: 'EUR' } } })).toBe(false);
  expect(hasVerifiedSelectedCommerce(p, variant, { offer: { merchant_id: p.product.merchant_id, product_id: p.product.source_product_id, price: { amount: 1, currency: 'USD' } } })).toBe(false);
});


it('binds a cached main refresh to the requested product even when another item has valid proof', async () => {
  state.id = missha.body.subject.id;
  const cached = body(missha); cached.metadata.commerce_verification = 'refresh_required';
  api.get.mockResolvedValue(body(verifiedFullCream));
  render(<ProductDetailClient params={Promise.resolve({ id: state.id })} initialPayload={mapPdpV2ToPdpPayload(cached)!} />);
  await screen.findByText('Current price and purchase availability could not be verified');
  expectNoPurchases();
  expect(screen.queryByRole('heading', { name: 'Full Cream Moisturizer' })).toBeNull();
});

it('binds SSR evidence to its requested canonical route', async () => {
  state.id = missha.body.subject.id;
  api.cached.mockResolvedValue(body(verifiedFullCream));
  await expect(renderPdpPage({ params: Promise.resolve({ id: state.id }) }, { personalized: false })).rejects.toThrow(PDP_DEGRADED_RENDER_ERROR);
});

it('binds Similar detail to the card before mapping a different valid item', async () => {
  const p = payload(); const similar = canonical(missha.body).pdp_payload.product;
  p.modules.push({ module_id: 'similar', type: 'recommendations', priority: 50, data: { items: [{
    product_id: similar.product_id, merchant_id: similar.merchant_id, title: similar.title, image_url: similar.image_url,
  }] } });
  api.get.mockResolvedValue(body(verifiedFullCream));
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  render(<PdpContainer payload={p} mode="beauty" onBuyNow={api.cart} onAddToCart={api.cart} />);
  fireEvent.click(screen.getByRole('button', { name: `Buy ${similar.title}` }));
  await waitFor(() => expect(api.get).toHaveBeenCalled());
  await act(async () => {});
  expect(open).not.toHaveBeenCalled(); expect(api.cart).not.toHaveBeenCalled();
});

it.each(['missing', 'malformed', 'inverted', 'overlong', 'disagreement'])(
  'rejects %s verification windows without reviving commerce', (change) => {
    const response = body(verifiedFullCream), data = canonical(response);
    const proofs = [response.metadata.commerce, data.commerce, data.pdp_payload.commerce];
    for (const proof of proofs) {
      if (change === 'missing') delete proof.verified_at;
      if (change === 'malformed') proof.expires_at = 'not-a-date';
      if (change === 'inverted') proof.expires_at = new Date(Date.parse(proof.verified_at) - 1).toISOString();
      if (change === 'overlong') proof.expires_at = new Date(Date.parse(proof.verified_at) + 60001).toISOString();
    }
    if (change === 'disagreement') proofs[0].expires_at = new Date(Date.parse(proofs[0].expires_at) - 1).toISOString();
    expect(isValidVerifiedPdpResponse(response)).toBe(false);
    expect(mapPdpV2ToPdpPayload(response)).toBeNull();
  });

it.each([-60001, 60001])('keeps useful evidence without purchase when verification time is displaced %sms', (offset) => {
  const response = body(verifiedFullCream), data = canonical(response);
  const displaced = Date.now() + offset;
  for (const proof of [response.metadata.commerce, data.commerce, data.pdp_payload.commerce]) {
    proof.verified_at = new Date(displaced).toISOString();
    proof.expires_at = new Date(displaced + 60000).toISOString();
  }
  const p = mapPdpV2ToPdpPayload(response)!;
  expect(p.product.title).toBe('Full Cream Moisturizer');
  expect(hasVerifiedSelectedCommerce(p, p.product.variants[0])).toBe(false);
  render(<PdpContainer payload={p} mode="beauty" onBuyNow={api.cart} onAddToCart={api.cart} />);
  expectNoPurchases();
  expect(document.body.textContent).not.toContain('$19.95');
});

it('rechecks expiry at dispatch even when a suspended tab did not fire its timer', () => {
  const p = mapPdpV2ToPdpPayload(body(verifiedFullCream))!;
  render(<PdpContainer payload={p} mode="beauty" onBuyNow={api.cart} onAddToCart={api.cart} />);
  const control = screen.getByRole('button', { name: /view at retailer/i });
  expect(control).toBeEnabled();
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse((p.commerce as any).expires_at) + 1);
  fireEvent.click(control);
  expect(api.cart).not.toHaveBeenCalled();
});

it('rechecks expiry after the retailer selection warning is accepted', () => {
  const p = mapPdpV2ToPdpPayload(body(verifiedTwoVariants))!;
  api.get.mockImplementation(() => new Promise(() => {}));
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  vi.spyOn(window, 'confirm').mockImplementation(() => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse((p.commerce as any).expires_at) + 1);
    return true;
  });
  render(<ProductDetailClient params={Promise.resolve({ id: state.id })} initialPayload={p} />);
  fireEvent.click(screen.getByRole('button', { name: '500 g' }));
  fireEvent.click(screen.getByRole('button', { name: /view at retailer/i }));
  expect(window.confirm).toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
});

it.each(['merchant_id', 'product_id', 'source_product_id'])('rejects a variant with contradictory %s despite matching proof money', (field) => {
  const response = body(verifiedFullCream);
  canonical(response).pdp_payload.product.variants[0][field] = 'other';
  expect(isValidVerifiedPdpResponse(response)).toBe(false);
});

it('uses exact seller variant money instead of the offer default120g price for500g', () => {
  const p = mapPdpV2ToPdpPayload(body(verifiedTwoVariants))!;
  const offer: any = { offer_id: 'own', merchant_id: p.product.merchant_id, product_id: p.product.source_product_id,
    selected_variant_id: '111', price: { amount: 19.95, currency: 'USD' },
    variants: structuredClone(p.product.variants), inventory: { in_stock: true } };
  p.offers = [offer]; p.default_offer_id = 'own'; p.offers_count = 1;
  expect(hasVerifiedSelectedCommerce(p, p.product.variants[1], { offer })).toBe(true);
  render(<PdpContainer payload={p} mode="beauty" onBuyNow={api.cart} onAddToCart={api.cart} />);
  fireEvent.click(screen.getByRole('button', { name: '500 g' }));
  fireEvent.click(screen.getByRole('button', { name: /buy now.*31.50/i }));
  expect(api.cart).toHaveBeenCalledWith(expect.objectContaining({ variant: expect.objectContaining({ variant_id: '222' }) }));
  for (const bad of ['currency', 'options', 'duplicate']) {
    const changed = structuredClone(offer);
    if (bad === 'currency') delete changed.variants[1].price.current.currency;
    if (bad === 'options') changed.variants[1].options = [{ name: 'Size', value: '120 g' }];
    if (bad === 'duplicate') changed.variants.push(structuredClone(changed.variants[1]));
    expect(hasVerifiedSelectedCommerce(p, p.product.variants[1], { offer: changed })).toBe(false);
  }
});


it('expired ISR proof remains SSR evidence and a failed refresh cannot revive its money', async () => {
  const cached = body(verifiedFullCream), data = canonical(cached);
  const old = Date.now() - 120000;
  for (const proof of [cached.metadata.commerce, data.commerce, data.pdp_payload.commerce]) {
    proof.verified_at = new Date(old).toISOString(); proof.expires_at = new Date(old + 60000).toISOString();
  }
  cached.metadata.commerce_verification = 'refresh_required';
  api.cached.mockResolvedValue(cached);
  const page = await renderPdpPage({ params: Promise.resolve({ id: state.id }) }, { personalized: false });
  const html = renderToStaticMarkup(page);
  expect(html).toContain('Full Cream Moisturizer');
  expect(html).not.toContain('19.95');
  expect(html).toContain('Checking current price and purchase availability');
  api.get.mockRejectedValue(new Error('read failure'));
  render(<ProductDetailClient params={Promise.resolve({ id: state.id })} initialPayload={mapPdpV2ToPdpPayload(cached)!} />);
  await screen.findByText('Current price and purchase availability could not be verified');
  expectNoPurchases();
  expect(screen.getByRole('heading', { name: 'Full Cream Moisturizer' })).toBeInTheDocument();
});


it('the actual unknown-source route output stays evidence-only through the UI shell', () => {
  const p = mapPdpV2ToPdpPayload(body(unknownSource))!;
  render(<PdpContainer payload={p} mode="beauty" onBuyNow={api.cart} onAddToCart={api.cart} />);
  expect(screen.getByRole('heading', { name: 'Full Cream Moisturizer' })).toBeInTheDocument();
  expectNoPurchases();
  expect(document.body.textContent).not.toContain('$11.90');
});


it.each([false, true])('Reap admission checks current proof and preserves an already-open attempt (admit first:%s)', async (admitFirst) => {
  const p = mapPdpV2ToPdpPayload(body(verifiedFullCream))!;
  const url = 'https://judydoll.com/products/synthetic';
  const offer: any = { offer_id: 'own', merchant_id: p.product.merchant_id, product_id: p.product.source_product_id,
    variants: structuredClone(p.product.variants), price: { amount: 19.95, currency: 'USD' },
    external_redirect_url: url, purchase_route: 'affiliate_outbound', inventory: { in_stock: true } };
  p.offers = [offer]; p.default_offer_id = 'own'; p.offers_count = 1;
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ enabled: true,
    merchants: [{ domain: 'judydoll.com', market: 'US' }] }), { status: 200 })));
  const view = render(<PdpContainer payload={p} mode="beauty" onBuyNow={api.cart} onAddToCart={api.cart} />);
  const control = await screen.findByTestId('buybar-reap-primary');
  if (admitFirst) {
    fireEvent.click(control);
    await screen.findByTestId('proof-reap-panel');
  }
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse((p.commerce as any).expires_at) + 1);
  if (admitFirst) {
    // A payload update forces the expiry projection even if the tab missed its timer.
    view.rerender(<PdpContainer payload={structuredClone(p)} mode="beauty" onBuyNow={api.cart} onAddToCart={api.cart} />);
    await act(async () => {});
    expect(screen.getByTestId('proof-reap-panel')).toHaveTextContent(p.product.product_id);
  } else {
    fireEvent.click(control);
    await act(async () => {});
    expect(screen.queryByTestId('proof-reap-panel')).toBeNull();
  }
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/prepare'))).toBe(false);
});
