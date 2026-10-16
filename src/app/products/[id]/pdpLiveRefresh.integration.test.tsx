/* eslint-disable @next/next/no-img-element */
// PDP async live refresh, end to end through the actual client page and the actual PdpContainer, with
// pdp_live_read answers produced by the REAL gateway overlay (see __fixtures__/liveRefresh/README.md).
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import liveBody from '@/features/pdp/__fixtures__/liveRefresh/native226-live-body.json';
import liveResponses from '@/features/pdp/__fixtures__/liveRefresh/native226-live-responses.json';
import { mapPdpV2ToPdpPayload } from '@/features/pdp/adapter/mapPdpV2ToPdpPayload';
import { buildLiveRefreshPage } from '@/features/pdp/utils/liveRefresh';
import { buildCanonicalPdpJsonLd, renderPdpPage } from './pdpServerPage';
import ProductDetailClient from './ProductDetailClient';

const state = vi.hoisted(() => ({ id: '' }));
const api = vi.hoisted(() => ({ get: vi.fn(), cached: vi.fn(), live: vi.fn(), cart: vi.fn(), push: vi.fn() }));
vi.mock('react', async () => ({ ...await vi.importActual<typeof import('react')>('react'), cache: (fn: any) => fn, use: () => ({ id: state.id }) }));
vi.mock('next/image', () => ({ default: ({ fill: _f, unoptimized: _u, priority: _p, fetchPriority: _fp, alt, ...props }: any) => <img {...props} alt={alt || ''} /> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: api.push, replace: vi.fn() }), notFound: () => { throw new Error('not found'); }, unstable_rethrow: vi.fn() }));
vi.mock('next/cache', () => ({ unstable_noStore: vi.fn() }));
vi.mock('./useUrlSearchParams', () => ({ useUrlSearchParams: () => new URLSearchParams() }));
vi.mock('@/features/pdp/hooks/useIsDesktop', () => ({ useIsDesktop: () => false }));
vi.mock('@/store/authStore', () => ({ useAuthStore: (selector: any) => selector({ user: null }) }));
vi.mock('@/store/cartStore', () => ({ useCartStore: () => ({ addItem: api.cart, open: vi.fn() }) }));
vi.mock('@/lib/api', () => ({
  getPdpV2: (...args: any[]) => api.get(...args), getPdpV2Cached: (...args: any[]) => api.cached(...args),
  getPdpLiveRefresh: (...args: any[]) => api.live(...args),
  getServicesBrowse: async () => ({ results: [] }), getPdpRouteIdExistenceCached: async () => ({ exists: true }),
  getPdpV2Personalization: async () => ({}), recordBrowseHistoryEvent: vi.fn(), resolveProductCandidates: async () => null,
  getSimilarProductsMainline: async () => ({ items: [] }), listQuestions: async () => ({ items: [] }), postQuestion: vi.fn(),
}));
vi.mock('@/features/pdp/tracking', () => ({ pdpTracking: { track: vi.fn(), setBaseContext: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { message: vi.fn(), success: vi.fn(), error: vi.fn() } }));

const OWN_OFFER = 'of:v1:merch_obs_25b829cb679502f8:sig_synthetic_complete_owned:merchant:default';
const WITHHELD = '47170040267003';
const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const body = () => structuredClone(liveBody) as any;
const bodyWithout = () => {
  const response = body();
  delete response.live_refresh;
  return response;
};
/** The offer projection as the gateway serves it: the own row's copy of the withheld variant has NO marker. */
const unmarkRowCopy = (offers: any[]) => offers.map((o) => (o.offer_id === OWN_OFFER
  ? { ...o, variants: o.variants.map((v: any) => (v.variant_id === WITHHELD ? (({ current_own_offer_status: _s, ...rest }) => rest)(v) : v)) }
  : o));
const unmarkedBody = () => {
  const response = body();
  const offers = response.modules.find((m: any) => m.type === 'offers').data;
  offers.offers = unmarkRowCopy(offers.offers);
  return response;
};
const answer = (name: 'price_drop' | 'out_of_stock') => structuredClone((liveResponses as any)[name]);
const TOKEN = (liveBody as any).live_refresh.token;

/** The seller picker's card for one seller (not the buy button, which also names the seller). */
const sellerCard = (name: string) => screen.getAllByRole('button')
  .find((button) => (button.textContent || '').includes(name) && !/view at/i.test(button.textContent || ''))!;
const buyButton = () => screen.getByRole('button', { name: /view at jurlique/i }) as HTMLButtonElement;
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); });
function renderPage(initial = body()) {
  return render(<ProductDetailClient params={Promise.resolve({ id: state.id })} initialPayload={mapPdpV2ToPdpPayload(initial)!} />);
}
function setUserAgent(userAgent: string, webdriver = false) {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  Object.defineProperty(window.navigator, 'webdriver', { configurable: true, get: () => webdriver });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.id = (liveBody as any).subject.id;
  window.localStorage.clear(); window.sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  document.cookie = 'pv_market=; path=/; max-age=0';
  vi.stubEnv('NEXT_PUBLIC_PDP_LIVE_REFRESH', 'on');
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ enabled: false }), { status: 200 })));
  setUserAgent(CHROME);
  // The browser's own reads (similar, content, a market re-read) answer the same page.
  api.get.mockImplementation(async () => body());
  api.cached.mockImplementation(async () => body());
  api.live.mockImplementation(async () => answer('price_drop'));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
  document.cookie = 'pv_market=; path=/; max-age=0';
  Object.defineProperty(window.navigator, 'webdriver', { configurable: true, get: () => false });
});

describe('when the refresh runs', () => {
  it('exactly once after hydration, with the token and the rebuilt slice of the page', async () => {
    renderPage();
    await waitFor(() => expect(api.live).toHaveBeenCalledTimes(1));
    const [args] = api.live.mock.calls[0];
    expect(args.token).toBe(TOKEN);
    expect(args.timeout_ms).toBe(4500);
    expect(args.page).toEqual(buildLiveRefreshPage(mapPdpV2ToPdpPayload(body())!));
    // Later re-renders (the price change itself, the similar/content reads) never ask again.
    await settle();
    await settle();
    expect(api.live).toHaveBeenCalledTimes(1);
  });

  it('waits for a hidden tab to become visible', async () => {
    let visibility: DocumentVisibilityState = 'hidden';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    renderPage();
    await settle();
    expect(api.live).not.toHaveBeenCalled();
    visibility = 'visible';
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(api.live).toHaveBeenCalledTimes(1));
  });

  it('never while the page is loading, and once it has loaded (review U14)', async () => {
    // A buyer re-read keeps the cached document up while it loads. The descriptor names the buyer's own
    // market here, so the ONLY gate left closed is `loading`.
    document.cookie = 'pv_market=SG; path=/';
    const sgBody = () => { const response = body(); response.live_refresh = { ...response.live_refresh, market: 'SG' }; return response; };
    let resolveCore!: (value: unknown) => void;
    api.get.mockImplementation((args: any) => (args?.include?.includes('offers')
      ? new Promise((resolve) => { resolveCore = resolve; })
      : Promise.resolve(sgBody())));
    renderPage(sgBody());
    await waitFor(() => expect(api.get.mock.calls.some(([args]: any[]) => args?.include?.includes('offers'))).toBe(true));
    await settle();
    await settle();
    expect(api.live).not.toHaveBeenCalled();
    await act(async () => { resolveCore(sgBody()); });
    await waitFor(() => expect(api.live).toHaveBeenCalledTimes(1));
    expect(api.live.mock.calls[0][0].token).toBe(TOKEN);
  });

  it.each([
    ['the page carries no descriptor', () => ({ initial: bodyWithout() })],
    ['the flag is off', () => { vi.stubEnv('NEXT_PUBLIC_PDP_LIVE_REFRESH', 'off'); return {}; }],
    ['the flag is unset', () => { vi.stubEnv('NEXT_PUBLIC_PDP_LIVE_REFRESH', ''); return {}; }],
    ['the buyer\'s market is not the descriptor\'s', () => { document.cookie = 'pv_market=SG; path=/'; return {}; }],
    ['the visitor is Googlebot', () => { setUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'); return {}; }],
    ['the visitor is GPTBot', () => { setUserAgent('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)'); return {}; }],
    ['the visitor is a headless browser', () => { setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36'); return {}; }],
    ['the browser is automated (navigator.webdriver)', () => { setUserAgent(CHROME, true); return {}; }],
  ])('never when %s', async (_label, arrange) => {
    const { initial } = arrange() as { initial?: any };
    renderPage(initial);
    await settle();
    await settle();
    expect(api.live).not.toHaveBeenCalled();
    expect(screen.getAllByText('$49').length).toBeGreaterThan(0);
  });
});

describe('what the refresh changes', () => {
  it('a failed or timed-out call keeps the stored price, with no retry', async () => {
    api.live.mockRejectedValue(Object.assign(new Error('The request timed out. Please retry.'), { code: 'UPSTREAM_TIMEOUT' }));
    renderPage();
    await waitFor(() => expect(api.live).toHaveBeenCalledTimes(1));
    await settle();
    expect(buyButton().textContent).toContain('$49');
    expect(buyButton()).toBeEnabled();
    expect(api.live).toHaveBeenCalledTimes(1);
  });

  it('an older gateway\'s 400 (unknown operation) keeps the stored page', async () => {
    api.live.mockRejectedValue(Object.assign(new Error('Invalid request'), { status: 400 }));
    renderPage();
    await waitFor(() => expect(api.live).toHaveBeenCalledTimes(1));
    await settle();
    expect(buyButton().textContent).toContain('$49');
    expect(api.live).toHaveBeenCalledTimes(1);
  });

  it.each(['confirmed', 'no_answer', 'skipped'])('a %s answer keeps the stored page', async (outcome) => {
    api.live.mockResolvedValue({ status: 'success', live_refresh: { mode: 'on', outcome, reason: null } });
    renderPage();
    await waitFor(() => expect(api.live).toHaveBeenCalledTimes(1));
    await settle();
    expect(buyButton().textContent).toContain('$49');
  });

  it('a shadow answer never changes the page, even if it carried a patch', async () => {
    const shadow = answer('price_drop');
    shadow.live_refresh.mode = 'shadow';
    api.live.mockResolvedValue(shadow);
    renderPage();
    await waitFor(() => expect(api.live).toHaveBeenCalledTimes(1));
    await settle();
    expect(buyButton().textContent).toContain('$49');
  });

  it('a live price drop updates the price, the offers and the best price, silently', async () => {
    renderPage();
    expect(buyButton().textContent).toContain('$49');
    expect(sellerCard('Other Store').textContent).toContain('Best value');
    expect(sellerCard('Jurlique').textContent).not.toContain('Best value');
    await waitFor(() => expect(buyButton().textContent).toContain('$45'));
    // The best price moved to the page seller (patch.offers.best_price_offer_id, from the real overlay).
    expect(sellerCard('Jurlique').textContent).toContain('Best value');
    expect(sellerCard('Jurlique').textContent).toContain('$45');
    expect(sellerCard('Other Store').textContent).not.toContain('Best value');
    expect(document.body.textContent).not.toContain('$49');
    expect(document.body.textContent).toContain('$47'); // the other seller's row is not ours to touch
    expect(buyButton()).toBeEnabled();
    // Silent: no toast, no announcement.
    const { toast } = await import('sonner');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.message).not.toHaveBeenCalled();
  });

  it('an out-of-stock answer disables Buy', async () => {
    api.live.mockResolvedValue(answer('out_of_stock'));
    renderPage();
    expect(buyButton()).toBeEnabled();
    await waitFor(() => expect(buyButton()).toBeDisabled());
    expect(screen.getAllByText('Out of stock').length).toBeGreaterThan(0);
  });

  it('a withheld variant never gets Buy enabled: not by the merchant\'s answer, not by a forged patch', async () => {
    let resolveLive!: (value: unknown) => void;
    api.live.mockImplementation(() => new Promise((resolve) => { resolveLive = resolve; }));
    renderPage();
    await waitFor(() => expect(api.live).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '100 mL' }));
    expect(buyButton()).toBeDisabled();
    // The real overlay's answer: the merchant said 100 mL is in stock at 60; the page keeps it withheld.
    // A forged copy also re-enables it on the card, the selector and the offer row.
    const forged = answer('price_drop');
    const enable = (v: any) => { delete v.current_own_offer_status; v.price = { current: { amount: 60, currency: 'USD' } }; v.availability = { in_stock: true }; };
    enable(forged.patch.product.set.variants[1]);
    enable(forged.patch.modules.variant_selector.variants[1]);
    enable(forged.patch.offers.offers.find((o: any) => o.offer_id === OWN_OFFER).variants[1]);
    await act(async () => { resolveLive(forged); });
    await settle();
    expect(buyButton()).toBeDisabled();
    expect(document.body.textContent).not.toContain('$60');
    // The forged patch was rejected WHOLE: the 50 mL price did not move either.
    fireEvent.click(screen.getByRole('button', { name: '50 mL' }));
    expect(buyButton().textContent).toContain('$49');
  });

  it('as the projection really serves it (no marker on the row copy), a patch enabling that copy is rejected and Buy stays disabled (review U15)', async () => {
    let resolveLive!: (value: unknown) => void;
    api.live.mockImplementation(() => new Promise((resolve) => { resolveLive = resolve; }));
    api.get.mockImplementation(async () => unmarkedBody());
    renderPage(unmarkedBody());
    await waitFor(() => expect(api.live).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '100 mL' }));
    expect(buyButton()).toBeDisabled();
    // Only the unmarked row copy is touched: no marker on either side.
    const forged = answer('price_drop');
    forged.patch.offers.offers = unmarkRowCopy(forged.patch.offers.offers);
    const copy = forged.patch.offers.offers.find((o: any) => o.offer_id === OWN_OFFER).variants.find((v: any) => v.variant_id === WITHHELD);
    copy.price = { current: { amount: 60, currency: 'USD' } };
    copy.availability = { in_stock: true };
    await act(async () => { resolveLive(forged); });
    await settle();
    expect(buyButton()).toBeDisabled();
    expect(document.body.textContent).not.toContain('$60');
    fireEvent.click(screen.getByRole('button', { name: '50 mL' }));
    expect(buyButton().textContent).toContain('$49'); // rejected whole
  });

  it('as the projection really serves it, the honest answer applies and the withheld 100 mL stays unbuyable', async () => {
    const honest = answer('price_drop');
    honest.patch.offers.offers = unmarkRowCopy(honest.patch.offers.offers);
    api.live.mockResolvedValue(honest);
    api.get.mockImplementation(async () => unmarkedBody());
    renderPage(unmarkedBody());
    await waitFor(() => expect(buyButton().textContent).toContain('$45'));
    fireEvent.click(screen.getByRole('button', { name: '100 mL' }));
    expect(buyButton()).toBeDisabled();
    expect(document.body.textContent).not.toContain('$60');
  });

  it('the honest answer re-prices the 50 mL and still leaves the withheld 100 mL unbuyable', async () => {
    renderPage();
    await waitFor(() => expect(buyButton().textContent).toContain('$45'));
    fireEvent.click(screen.getByRole('button', { name: '100 mL' }));
    expect(buyButton()).toBeDisabled();
    expect(document.body.textContent).not.toContain('$60');
  });
});

describe('SEO: JSON-LD and the server HTML never change', () => {
  it('the server render opts in, and its JSON-LD and markup are identical with or without a descriptor', async () => {
    api.cached.mockImplementation(async () => body());
    const withDescriptor = renderToStaticMarkup(await renderPdpPage({ params: Promise.resolve({ id: state.id }) }, { personalized: false }));
    const jsonLdWith = await buildCanonicalPdpJsonLd(Promise.resolve({ id: state.id }));
    expect(api.cached).toHaveBeenCalledWith(expect.objectContaining({ live_refresh: true }));

    api.cached.mockImplementation(async () => bodyWithout());
    const withoutDescriptor = renderToStaticMarkup(await renderPdpPage({ params: Promise.resolve({ id: state.id }) }, { personalized: false }));
    const jsonLdWithout = await buildCanonicalPdpJsonLd(Promise.resolve({ id: state.id }));

    expect(jsonLdWith).toBeTruthy();
    expect(jsonLdWith).toBe(jsonLdWithout);
    expect(jsonLdWith).not.toContain(TOKEN);
    expect(withDescriptor).toBe(withoutDescriptor);
    expect(withDescriptor).not.toContain(TOKEN);
    expect(withDescriptor).toContain((liveBody as any).modules[0].data.pdp_payload.product.title);
  });

  it('a refreshed price never reaches the JSON-LD built from the server payload', async () => {
    api.cached.mockImplementation(async () => body());
    const jsonLd = await buildCanonicalPdpJsonLd(Promise.resolve({ id: state.id }));
    renderPage();
    await waitFor(() => expect(buyButton().textContent).toContain('$45'));
    expect(await buildCanonicalPdpJsonLd(Promise.resolve({ id: state.id }))).toBe(jsonLd);
    expect(jsonLd).not.toContain('"45"');
  });
});
