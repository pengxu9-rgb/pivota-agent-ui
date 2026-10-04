/* eslint-disable @next/next/no-img-element */
// Mounted buyer controls consume the unchanged native gateway response through the real adapter.
// Checkout responses below are isolated protocol models, not accepted backend admissions.
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdpContainer } from './PdpContainer';
import nativeResponse from '@/features/pdp/__fixtures__/currentOwnMoney/native226.json';
import { mapPdpV2ToPdpPayload } from '@/features/pdp/adapter/mapPdpV2ToPdpPayload';
import { resolveOfferPricing } from '@/features/pdp/utils/offerVariantMatching';
import { BeautyMobileSellerPicker } from '@/features/pdp/components/BeautyMobileSellerPicker';
import { OfferSheet } from '@/features/pdp/offers/OfferSheet';
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

function renderPdp(p: PDPPayload) {
  return render(<PdpContainer payload={p} mode="generic" onAddToCart={() => {}} onBuyNow={() => {}} />);
}

const nativePayload = () => mapPdpV2ToPdpPayload(structuredClone(nativeResponse) as any)!;
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status }); }
async function fillBuyer() {
  const set = (name: string, value: string) => fireEvent.change(document.querySelector(`input[name="${name}"]`)!, { target: { value } });
  for (const [name, value] of Object.entries({ first_name:'Synthetic', last_name:'Verifier', email:'synthetic@example.test',
    phone:'+14155550100', address_line1:'1 Test St', city:'SF', region:'CA', postal_code:'94103' })) set(name,value);
  fireEvent.click(document.querySelector('input[name="consent"]')!);
  fireEvent.click(screen.getByTestId('reap-submit'));
}
function protocolFetch(url: string) {
  if (url === '/api/reap-checkout/config') return response({ enabled:true, merchants:[{ domain:'jurlique.com',market:'US',item_source:'cart_link' }] });
  if (url === '/api/reap-checkout/session') return response({ scope:'native-money-synthetic-buyer' });
  if (url === '/api/reap-checkout/prepare') return response({ selection:{ product_key:'ext:jurlique-synthetic-final-shared-listing::126534d7',
    variant_id:'47170040267002', variant_key:'ext:jurlique-synthetic-final-shared-listing::126534d7::v:47170040267002',
    merchant_domain:'jurlique.com', market:'US', currency:'USD', unit_price_minor:4900, quantity:1,item_source:'cart_link' } });
  return response({ error:'gateway_unavailable' },502);
}
describe('native canonical own-money consumer boundary', () => {
  beforeEach(() => {
    window.sessionStorage.clear(); window.localStorage.clear();
    vi.stubEnv('NEXT_PUBLIC_GENERIC_PDP_USE_STANDARD_SHELL','true');
    vi.stubEnv('NEXT_PUBLIC_REAP_CHECKOUT_DEMO','1');
    fetchMock.mockImplementation(async (url: string) => protocolFetch(url));
  });
  it('actual native adapter preserves visible unavailable222 and never gives it selected offer49', () => {
    const p=nativePayload(); const sibling=p.product.variants.find(v=>v.variant_id==='222')!;
    expect(sibling).toMatchObject({ current_own_offer_status:'unavailable',availability:{in_stock:false} });
    expect(sibling.hidden_from_selector).not.toBe(true);
    const pricing=resolveOfferPricing(p.offers?.[0],sibling);
    expect(pricing.currentMoneyUnavailable).toBe(true);expect(pricing.itemAmount).toBeNull();expect(pricing.totalAmount).toBeNull();
  });
  it('visible unavailable222 has unavailable price, disabled purchase and no preparation', async () => {
    renderPdp(nativePayload());await screen.findByTestId('buybar-reap-primary');
    fireEvent.click(screen.getByRole('button',{name:/100 mL/i}));
    await waitFor(()=>expect(screen.queryByTestId('buybar-reap-primary')).toBeNull());
    expect(screen.getByText('Price unavailable')).toBeInTheDocument();
    const store=screen.getByRole('button',{name:/View at/});expect(store).toBeDisabled();fireEvent.click(store);
    expect(reapCalls().every(([url])=>url==='/api/reap-checkout/config')).toBe(true);
    fireEvent.click(screen.getByRole('button',{name:/50 mL/i}));
    expect(await screen.findByTestId('buybar-reap-primary')).toBeInTheDocument();
    expect(screen.queryByText('Price unavailable')).toBeNull();
  });
  it('actual native11149 opens primary entry and retains original4900 through prepare and create', async () => {
    renderPdp(nativePayload());fireEvent.click(await screen.findByTestId('buybar-reap-primary'));
    await screen.findByTestId('reap-panel');await fillBuyer();
    await waitFor(()=>expect(fetchMock.mock.calls.some(([url])=>url==='/api/reap-checkout')).toBe(true));
    const prepare=fetchMock.mock.calls.find(([url])=>url==='/api/reap-checkout/prepare')!;
    const create=fetchMock.mock.calls.find(([url])=>url==='/api/reap-checkout')!;
    expect(JSON.parse(String((prepare[1] as RequestInit).body))).toMatchObject({variant_id:'47170040267002',expected_unit_price_minor:4900,expected_currency:'USD'});
    expect(JSON.parse(String((create[1] as RequestInit).body))).toMatchObject({variant_id:'47170040267002',expected_unit_price_minor:4900,expected_currency:'USD'});
    expect(JSON.parse(String((create[1] as RequestInit).body)).selection.unit_price_minor).toBe(4900);
  });
  it('later unavailable money removes new CTA while synthetic unknown-original key recovery remains mounted', async () => {
    const view=renderPdp(nativePayload());fireEvent.click(await screen.findByTestId('buybar-reap-primary'));
    await screen.findByTestId('reap-panel');await fillBuyer();
    await waitFor(()=>expect(fetchMock.mock.calls.some(([url])=>url==='/api/reap-checkout')).toBe(true));
    const original=JSON.parse(String((fetchMock.mock.calls.find(([url])=>url==='/api/reap-checkout')![1] as RequestInit).body));
    const changed=nativePayload();const selected=changed.product.variants.find(v=>v.variant_id==='47170040267002')!;
    selected.current_own_offer_status='unavailable';delete selected.price;selected.availability={in_stock:false};
    view.rerender(<PdpContainer payload={changed} mode="generic" onAddToCart={()=>{}} onBuyNow={()=>{}}/>);
    expect(screen.queryByTestId('buybar-reap-primary')).toBeNull();expect(screen.getByTestId('reap-panel')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button',{name:/Recover same attempt/i}));
    fireEvent.click(await screen.findByTestId('reap-submit'));
    await waitFor(()=>expect(fetchMock.mock.calls.filter(([url])=>url==='/api/reap-checkout')).toHaveLength(2));
    const bodies=fetchMock.mock.calls.filter(([url])=>url==='/api/reap-checkout').map(([,init])=>JSON.parse(String((init as RequestInit).body)));
    expect(bodies[1].recover_only).toBe(true);
    const {recover_only: originalMode, ...originalWire}=original;
    const {recover_only: recoveryMode, ...recoveryWire}=bodies[1];
    expect(originalMode).toBe(false);expect(recoveryMode).toBe(true);expect(recoveryWire).toEqual(originalWire);
    expect(fetchMock.mock.calls.filter(([url])=>url==='/api/reap-checkout/prepare')).toHaveLength(1);
    expect(bodies.filter(body=>body.recover_only===false)).toHaveLength(1);
  });
  it('two priced native sizes snapshot the explicitly clicked size money, never the default amount', async () => {
    // Additional UI model control, based on the native response; the second size has its own59 price.
    const p = nativePayload();
    const second = p.product.variants.find(v => v.variant_id === '222')!;
    delete second.current_own_offer_status;
    second.price = { current: { amount: 59, currency: 'USD' } };
    second.availability = { in_stock: true };
    const offerVariant = p.offers![0].variants!.find(v => v.variant_id === '222')!;
    delete offerVariant.current_own_offer_status;
    offerVariant.price = second.price;
    offerVariant.availability = second.availability;
    fetchMock.mockImplementation(async (url: string) => url === '/api/reap-checkout/prepare'
      ? response({ error: 'price_changed', attempt_outcome: 'not_created' }, 409) : protocolFetch(url));
    renderPdp(p);
    await screen.findByTestId('buybar-reap-primary');
    fireEvent.click(screen.getByRole('button', { name: /100 mL/i }));
    fireEvent.click(await screen.findByTestId('buybar-reap-primary'));
    await screen.findByTestId('reap-panel');
    await fillBuyer();
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === '/api/reap-checkout/prepare')).toBe(true));
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/reap-checkout/prepare')!;
    expect(JSON.parse(String((call[1] as RequestInit).body))).toMatchObject({ variant_id: '222', expected_unit_price_minor: 5900, expected_currency: 'USD' });
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/reap-checkout')).toBe(false);
  });

  it('explicit product-line selector retains precedence over generic native variants', async () => {
    const p = nativePayload();
    p.product.product_line_option_name = 'Listing';
    p.product.product_line_options = [
      { label: 'Original listing', product_id: p.product.product_id, merchant_id: p.product.merchant_id, selected: true },
      { label: 'Alternate listing', product_id: 'sig_synthetic_other_listing', merchant_id: p.product.merchant_id },
    ];
    renderPdp(p);
    await screen.findByTestId('buybar-reap-primary');
    expect(screen.getByRole('button', { name: /Original listing/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Alternate listing/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /100 mL/i })).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/reap-checkout/prepare')).toBe(false);
  });

  it('sole default variant needs no selector and preserves its own49 purchase money', async () => {
    const p = nativePayload();
    p.product.variants = p.product.variants.filter(v => v.variant_id === '47170040267002');
    p.offers![0].variants = p.offers![0].variants!.filter(v => v.variant_id === '47170040267002');
    renderPdp(p);
    expect(screen.queryByRole('button', { name: /100 mL/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /50 mL/i })).toBeNull();
    fireEvent.click(await screen.findByTestId('buybar-reap-primary'));
    await screen.findByTestId('reap-panel');
    await fillBuyer();
    await screen.findByTestId('reap-fallback');
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/reap-checkout')!;
    const body = JSON.parse(String((call[1] as RequestInit).body));
    expect(body).toMatchObject({ expected_unit_price_minor: 4900, expected_currency: 'USD', recover_only: false });
    expect(body.variant_id).toBeUndefined();
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/reap-checkout/prepare')).toBe(false);
  });

  it('multi-offer seller picker displays matched unavailable money without borrowing49 or recommending disabled rows', () => {
    const p = nativePayload();
    const select = vi.fn();
    const unavailable = structuredClone(p.product.variants.find(v => v.variant_id === '222')!);
    // Consumer-boundary model: marker is present only on each matched offer variant.
    delete unavailable.current_own_offer_status;
    const offer = p.offers![0];
    const offers = [offer, { ...structuredClone(offer), offer_id: 'alternate-offer', merchant_name: 'Alternate seller' }];
    const view = render(<BeautyMobileSellerPicker offers={offers} selectedVariant={unavailable}
      selectedOfferId={offer.offer_id} bestPriceOfferId={offer.offer_id} primaryMerchantId={offer.merchant_id} onSelect={select} />);
    expect(screen.getAllByText('Price unavailable')).toHaveLength(2);
    expect(screen.queryByText(/\$49/)).toBeNull();
    expect(screen.queryByText('Best value')).toBeNull();
    expect(screen.queryByText('Official')).toBeNull();
    expect(screen.getByText('0 sellers')).toBeInTheDocument();
    const row = screen.getByRole('button', { pressed: true });
    expect(row).toBeDisabled(); fireEvent.click(row); expect(select).not.toHaveBeenCalled();
    view.rerender(<BeautyMobileSellerPicker offers={[offer]} selectedVariant={p.product.variants[0]}
      selectedOfferId={offer.offer_id} bestPriceOfferId={offer.offer_id} primaryMerchantId={offer.merchant_id} onSelect={select} />);
    expect(screen.queryByText('Price unavailable')).toBeNull();
    expect(screen.getByRole('button')).toBeEnabled();
  });

  it('multi-offer sheet displays matched unavailable item and total without zero prices or recommendation badges', async () => {
    const p = nativePayload();
    const select = vi.fn();
    const offer = p.offers![0];
    const unavailable = structuredClone(p.product.variants.find(v => v.variant_id === '222')!);
    delete unavailable.current_own_offer_status;
    const offers = [offer, { ...structuredClone(offer), offer_id: 'alternate-offer', merchant_name: 'Alternate seller' }];
    render(<OfferSheet open offers={offers} selectedVariant={unavailable}
      selectedOfferId={offer.offer_id} defaultOfferId={offer.offer_id} bestPriceOfferId={offer.offer_id}
      onSelect={select} onClose={() => {}} />);
    expect(await screen.findAllByText('Price unavailable')).toHaveLength(2);
    expect(screen.getAllByText('Item: Price unavailable')).toHaveLength(2);
    expect(screen.queryByText(/^\$0/)).toBeNull();
    expect(screen.queryByText(/^Item: \$0/)).toBeNull();
    expect(screen.queryByText(/\$49/)).toBeNull();
    expect(screen.queryByText('Recommended')).toBeNull();
    expect(screen.queryByText('Best price')).toBeNull();
    expect(screen.queryByText('Best cart value')).toBeNull();
    const row = screen.getByRole('button', { pressed: true });
    expect(row).toBeDisabled(); fireEvent.click(row); expect(select).not.toHaveBeenCalled();
  });

  it('generic PDP actually mounts the multi-offer picker when the buyer selects unavailable222', async () => {
    const p = nativePayload();
    p.offers!.push({ ...structuredClone(p.offers![0]), offer_id: 'alternate-offer', merchant_name: 'Alternate seller' });
    renderPdp(p);
    await screen.findByTestId('buybar-reap-primary');
    fireEvent.click(screen.getByRole('button', { name: /100 mL/i }));
    expect(screen.getByText('0 sellers')).toBeInTheDocument();
    expect(screen.getAllByText('Price unavailable').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText(/\$49/)).toBeNull();
    expect(screen.queryByText('Best value')).toBeNull();
    expect(screen.queryByTestId('buybar-reap-primary')).toBeNull();
    expect(screen.getByRole('button', { pressed: true, name: /Price unavailable/ })).toBeDisabled();
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/reap-checkout/prepare')).toBe(false);
  });

});
