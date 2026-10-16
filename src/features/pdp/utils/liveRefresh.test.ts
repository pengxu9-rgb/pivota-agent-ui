import { afterEach, describe, expect, it, vi } from 'vitest';
import liveBody from '@/features/pdp/__fixtures__/liveRefresh/native226-live-body.json';
import liveResponses from '@/features/pdp/__fixtures__/liveRefresh/native226-live-responses.json';
import liveSlice from '@/features/pdp/__fixtures__/liveRefresh/native226-live-slice.json';
import builderBody from '@/features/pdp/__fixtures__/liveRefresh/builder-live-body.json';
import builderSlice from '@/features/pdp/__fixtures__/liveRefresh/builder-live-slice.json';
import builderResponses from '@/features/pdp/__fixtures__/liveRefresh/builder-live-responses.json';
import { mapPdpV2ToPdpPayload } from '@/features/pdp/adapter/mapPdpV2ToPdpPayload';
import type { PDPPayload } from '@/features/pdp/types';
import {
  applyLiveRefreshPatch,
  buildLiveRefreshPage,
  isLikelyCrawler,
  isPdpLiveRefreshEnabled,
  readLiveRefreshDescriptor,
  type LiveRefreshSent,
} from './liveRefresh';

const clone = <T,>(value: T): T => structuredClone(value);
const rawBody = () => clone(liveBody) as any;
const rawModule = (body: any, type: string) => body.modules.find((m: any) => m.type === type);
const rawPdp = (body: any) => rawModule(body, 'canonical').data.pdp_payload;
const mapped = (body: any = rawBody()): PDPPayload => mapPdpV2ToPdpPayload(body)!;
const sentFor = (payload: PDPPayload): LiveRefreshSent => ({
  token: payload.live_refresh!.token,
  product_id: payload.product.product_id,
  merchant_id: payload.product.merchant_id,
});
const priceDrop = () => clone((liveResponses as any).price_drop);
const outOfStock = () => clone((liveResponses as any).out_of_stock);
const OWN_OFFER = 'of:v1:merch_obs_25b829cb679502f8:sig_synthetic_complete_owned:merchant:default';
const OTHER_OFFER = 'of:v1:merch_obs_other_seller:sig_synthetic_complete_owned:merchant:default';
const SELECTED = '47170040267002';
const WITHHELD = '47170040267003';
const moduleData = (payload: PDPPayload, type: string) => payload.modules.find((m) => m.type === type)?.data as any;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('flag, descriptor and crawler gates', () => {
  it('NEXT_PUBLIC_PDP_LIVE_REFRESH is off by default and only an explicit on enables it', () => {
    vi.stubEnv('NEXT_PUBLIC_PDP_LIVE_REFRESH', '');
    expect(isPdpLiveRefreshEnabled()).toBe(false);
    for (const off of ['off', '0', 'false', 'no', 'enabled?']) {
      vi.stubEnv('NEXT_PUBLIC_PDP_LIVE_REFRESH', off);
      expect(isPdpLiveRefreshEnabled()).toBe(false);
    }
    for (const on of ['on', 'ON', 'true', '1', ' yes ']) {
      vi.stubEnv('NEXT_PUBLIC_PDP_LIVE_REFRESH', on);
      expect(isPdpLiveRefreshEnabled()).toBe(true);
    }
  });

  it('reads only a contract-v1 descriptor', () => {
    const token = 'v1.eyJ2IjoxfQ.bWFj';
    expect(readLiveRefreshDescriptor({ v: 1, token, market: 'US' })).toEqual({ v: 1, token, market: 'US' });
    expect(readLiveRefreshDescriptor({ v: 1, token, market: ' sg ' })).toEqual({ v: 1, token, market: 'SG' });
    expect(readLiveRefreshDescriptor({ v: 1, token: `v1.${'a'.repeat(4096)}.b`, market: 'US' })).toBeNull();
    for (const bad of [
      null, 'v1.a.b', [], { token, market: 'US' }, { v: 2, token, market: 'US' }, { v: '1', token, market: 'US' },
      { v: 1, market: 'US' }, { v: 1, token: 'v2.a.b', market: 'US' }, { v: 1, token: 'v1.a', market: 'US' },
      { v: 1, token: 'v1.a+b.c', market: 'US' }, { v: 1, token: 'v1.a.b=', market: 'US' }, { v: 1, token, market: '' },
      { v: 1, token, market: 'USA' }, { v: 1, token, market: 'en-US' }, { v: 1, token },
    ]) {
      expect(readLiveRefreshDescriptor(bad)).toBeNull();
    }
  });

  it.each([
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
    'Mozilla/5.0 (compatible; YandexBot/3.0)',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0)',
    'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109 Mobile Safari/537.36 Chrome-Lighthouse',
    'Mozilla/5.0 (compatible; AhrefsBot/7.0)',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  ])('treats %s as a crawler', (userAgent) => {
    expect(isLikelyCrawler({ userAgent })).toBe(true);
  });

  it('treats an automated browser and a missing navigator as crawlers, and real browsers as visitors', () => {
    const chrome = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1';
    expect(isLikelyCrawler({ userAgent: chrome })).toBe(false);
    expect(isLikelyCrawler({ userAgent: iphone })).toBe(false);
    expect(isLikelyCrawler({ userAgent: chrome, webdriver: true })).toBe(true);
    expect(isLikelyCrawler(null)).toBe(true);
  });
});

describe('buildLiveRefreshPage rebuilds the raw slice the gateway overlay reads', () => {
  it('slice fidelity on a real get_pdp_v2 body: card, actions, nested and top-level modules, offers', () => {
    const body = rawBody();
    const page = buildLiveRefreshPage(mapped(body))!;
    expect(page.modules.map((m) => m.type)).toEqual(['canonical', 'variant_selector', 'offers']);

    const pdp = page.modules[0].data.pdp_payload as any;
    const rawCard = rawPdp(body).product;
    const { description: _description, ...rawCardWithoutContent } = rawCard;
    // Everything the overlay and the token check read comes back exactly as the gateway built it.
    expect(pdp.product).toEqual(rawCardWithoutContent);
    for (const key of ['product_id', 'merchant_id', 'source_product_id', 'destination_url', 'external_redirect_url',
      'source_url', 'default_variant_id', 'variants', 'currency', 'price', 'best_price_offer_id']) {
      expect(pdp.product[key]).toEqual(rawCard[key]);
    }
    expect(pdp.actions).toEqual(rawPdp(body).actions);
    const rawNested = Object.fromEntries(rawPdp(body).modules.map((m: any) => [m.type, m.data]));
    expect(pdp.modules).toEqual([
      { type: 'price_promo', data: rawNested.price_promo },
      { type: 'variant_selector', data: rawModule(body, 'variant_selector').data },
    ]);
    expect(rawNested.variant_selector).toEqual(rawModule(body, 'variant_selector').data);
    expect(page.modules[1]).toEqual({ type: 'variant_selector', data: rawModule(body, 'variant_selector').data });
    const rawOffers = rawModule(body, 'offers').data;
    expect(page.modules[2]).toEqual({
      type: 'offers',
      data: {
        offers: rawOffers.offers,
        best_price_offer_id: rawOffers.best_price_offer_id,
        default_offer_id: rawOffers.default_offer_id,
      },
    });
    expect(new TextEncoder().encode(JSON.stringify(page)).length).toBeLessThan(256 * 1024);
  });

  it('still builds, byte for byte, the slices the real gateway accepted (native226 and its own pdpBuilder shape)', () => {
    // The gateway's page binding (product, seller, host, handle, currency, variant ids) accepted these exact
    // slices and answered `applied` (see __fixtures__/liveRefresh/README.md). A mapper or slice change that
    // breaks this pin must regenerate those answers through produceResponses.cjs, or every call would
    // answer page_mismatch.
    expect(buildLiveRefreshPage(mapped())).toEqual(liveSlice);
    expect(buildLiveRefreshPage(mapPdpV2ToPdpPayload(clone(builderBody) as any))).toEqual(builderSlice);
    for (const res of [...Object.values(liveResponses), ...Object.values(builderResponses)] as any[]) {
      expect(res.live_refresh.reason).not.toBe('page_mismatch');
      expect(['applied', 'confirmed']).toContain(res.live_refresh.outcome);
    }
  });

  it('keeps the withheld markers and the identity fields the binding reads', () => {
    const card = (buildLiveRefreshPage(mapped())!.modules[0].data.pdp_payload as any).product;
    expect(card.variants.find((v: any) => v.variant_id === WITHHELD).current_own_offer_status).toBe('unavailable');
    const selector = buildLiveRefreshPage(mapped())!.modules[1].data as any;
    expect(selector.variants.find((v: any) => v.variant_id === WITHHELD).current_own_offer_status).toBe('unavailable');
  });

  it('drops content keys from the card, and keeps everything else', () => {
    const payload = mapped();
    payload.product = {
      ...payload.product,
      description: 'long copy',
      description_html: '<p>long copy</p>',
      images: ['https://cdn.example/a.jpg'],
      image_urls: ['https://cdn.example/a.jpg'],
      media: [{ type: 'image', url: 'https://cdn.example/a.jpg' }],
      media_gallery: { items: [] },
    } as any;
    const card = (buildLiveRefreshPage(payload)!.modules[0].data.pdp_payload as any).product;
    for (const key of ['description', 'description_html', 'images', 'image_urls', 'media', 'media_gallery']) {
      expect(card).not.toHaveProperty(key);
    }
    expect(card.title).toBe(payload.product.title);
    expect(card.brand).toEqual(payload.product.brand);
    expect(JSON.stringify(buildLiveRefreshPage(payload))).not.toContain('long copy');
  });

  it('includes non-empty actions, omits empty ones, and carries product_intel offer_pointers only when the page has them', () => {
    const payload = mapped();
    expect((buildLiveRefreshPage(payload)!.modules[0].data.pdp_payload as any).actions).toHaveLength(2);
    expect(buildLiveRefreshPage({ ...payload, actions: [] })!.modules[0].data.pdp_payload).not.toHaveProperty('actions');
    expect(buildLiveRefreshPage(payload)!.modules.some((m) => m.type === 'product_intel')).toBe(false);
    const withIntel = {
      ...payload,
      modules: [...payload.modules, { module_id: 'product_intel', type: 'product_intel', priority: 65,
        data: { display_name: 'x', offer_pointers: { best_price_offer_id: OTHER_OFFER } } }],
    } as PDPPayload;
    expect(buildLiveRefreshPage(withIntel)!.modules.at(-1)).toEqual({
      type: 'product_intel', data: { offer_pointers: { best_price_offer_id: OTHER_OFFER } },
    });
  });

  it('returns null without a product', () => {
    expect(buildLiveRefreshPage(null)).toBeNull();
    expect(buildLiveRefreshPage({ ...mapped(), product: null as any })).toBeNull();
  });
});

describe('applyLiveRefreshPatch applies the real overlay answer', () => {
  it('a price drop moves the card, its variant, both modules, the own offer row and the best price together', () => {
    const cur = mapped();
    const before = clone(cur);
    const next = applyLiveRefreshPatch(cur, sentFor(cur), priceDrop());
    expect(next).not.toBe(cur);
    expect(cur).toEqual(before); // pure
    expect(next.product.price).toMatchObject({ current: { amount: 45, currency: 'USD' } });
    expect(next.product.variants[0].price?.current.amount).toBe(45);
    expect(moduleData(next, 'price_promo').price).toMatchObject({ amount: 45, currency: 'USD' });
    expect(moduleData(next, 'variant_selector').variants[0].price.current.amount).toBe(45);
    const own = next.offers!.find((o) => o.offer_id === OWN_OFFER)!;
    expect((own.price as any).amount).toBe(45);
    expect(next.best_price_offer_id).toBe(OWN_OFFER);
    expect((next.product as any).best_price_offer_id).toBe(OWN_OFFER);
    // The withheld 100 mL the merchant also answered for is untouched everywhere.
    expect(next.product.variants[1]).toEqual(cur.product.variants[1]);
    expect(moduleData(next, 'variant_selector').variants[1]).toEqual(moduleData(cur, 'variant_selector').variants[1]);
    expect(own.variants![1]).toEqual(cur.offers!.find((o) => o.offer_id === OWN_OFFER)!.variants![1]);
    // Content, identity, actions and the descriptor stay.
    expect(next.actions).toBe(cur.actions);
    expect(next.live_refresh).toEqual(cur.live_refresh);
    expect(next.product.title).toBe(cur.product.title);
  });

  it('an out-of-stock answer flips the variant and the own offer row out of stock', () => {
    const cur = mapped();
    const next = applyLiveRefreshPatch(cur, sentFor(cur), outOfStock());
    expect(next.product.variants[0].availability?.in_stock).toBe(false);
    expect(next.offers!.find((o) => o.offer_id === OWN_OFFER)!.inventory?.in_stock).toBe(false);
    expect(next.best_price_offer_id).toBe(OTHER_OFFER);
  });

  it('the gateway\'s own page shape (pdpBuilder) takes its answer: back in stock at the live price', () => {
    const cur = mapPdpV2ToPdpPayload(clone(builderBody) as any)!;
    expect(cur.product.variants.every((v) => v.availability?.in_stock === false)).toBe(true);
    const next = applyLiveRefreshPatch(cur, sentFor(cur), clone((builderResponses as any).back_in_stock));
    expect(next).not.toBe(cur);
    expect(next.product.variants.every((v) => v.availability?.in_stock === true)).toBe(true);
    expect(next.product.variants[0].price?.current.amount).toBe(24);
    expect(next.offers![0].inventory?.in_stock).toBe(true);
  });

  it('a patch with a null best price (the page sent none) applies the rest', () => {
    const cur = mapped();
    const res = priceDrop();
    res.patch.offers.best_price_offer_id = null;
    delete res.patch.product.set.best_price_offer_id;
    const next = applyLiveRefreshPatch(cur, sentFor(cur), res);
    expect(next.product.variants[0].price?.current.amount).toBe(45);
    expect(next.best_price_offer_id).toBe(cur.best_price_offer_id);
  });

  it('is idempotent: the same answer applied twice changes nothing more', () => {
    const cur = mapped();
    const once = applyLiveRefreshPatch(cur, sentFor(cur), priceDrop());
    const twice = applyLiveRefreshPatch(once, sentFor(cur), priceDrop());
    expect(twice).toEqual(once);
  });
});

describe('applyLiveRefreshPatch does nothing unless every guard holds', () => {
  it('null page', () => {
    expect(applyLiveRefreshPatch(null, { token: 'v1.a.b', product_id: 'x' }, priceDrop())).toBeNull();
  });

  it.each(['confirmed', 'shadow_price_drop'])('the real gateway\'s %s answer (no patch)', (name) => {
    const cur = mapped();
    expect(applyLiveRefreshPatch(cur, sentFor(cur), clone((liveResponses as any)[name]))).toBe(cur);
  });

  it.each([
    ['a shadow answer', (r: any) => { r.live_refresh.mode = 'shadow'; }],
    ['a confirmed answer', (r: any) => { r.live_refresh.outcome = 'confirmed'; }],
    ['a no_answer answer', (r: any) => { r.live_refresh.outcome = 'no_answer'; }],
    ['a skipped answer', (r: any) => { r.live_refresh.outcome = 'skipped'; r.live_refresh.reason = 'page_mismatch'; }],
    ['an answer without a patch', (r: any) => { delete r.patch; }],
    ['an answer without live_refresh', (r: any) => { delete r.live_refresh; }],
    ['a failed status', (r: any) => { r.status = 'error'; }],
    ['a patch that is not an object', (r: any) => { r.patch = []; }],
  ])('%s', (_label, edit) => {
    const cur = mapped();
    const res = priceDrop();
    edit(res);
    expect(applyLiveRefreshPatch(cur, sentFor(cur), res)).toBe(cur);
  });

  it.each([null, undefined, 'ok', 42, [], {}])('a garbage answer %j', (res) => {
    const cur = mapped();
    expect(applyLiveRefreshPatch(cur, sentFor(cur), res)).toBe(cur);
  });

  it('a page that no longer carries the sent token', () => {
    const cur = mapped();
    const sent = sentFor(cur);
    const reissued = { ...cur, live_refresh: { ...cur.live_refresh!, token: 'v1.other.token' } };
    expect(applyLiveRefreshPatch(reissued, sent, priceDrop())).toBe(reissued);
    const without = { ...cur, live_refresh: undefined };
    expect(applyLiveRefreshPatch(without, sent, priceDrop())).toBe(without);
  });

  it('a different product or seller than the one the token was sent for', () => {
    const cur = mapped();
    expect(applyLiveRefreshPatch(cur, { ...sentFor(cur), product_id: 'sig_other' }, priceDrop())).toBe(cur);
    expect(applyLiveRefreshPatch(cur, { ...sentFor(cur), merchant_id: 'merch_other' }, priceDrop())).toBe(cur);
  });

  it('a page on the commerce contract (read-only, verified or pending) is never live-patched', () => {
    const cur = mapped();
    const sent = sentFor(cur);
    for (const page of [
      { ...cur, commerce_verification: 'refresh_required' as const },
      { ...cur, commerce_verification: 'failed' as const },
      { ...cur, commerce: { state: 'unavailable', read_only: true, purchase_eligible: false, reason_code: 'CURRENT_OWN_OFFER_UNAVAILABLE' } as any },
    ]) {
      expect(applyLiveRefreshPatch(page, sent, priceDrop())).toBe(page);
    }
  });

  it.each([
    ['purchase_eligible false', { purchase_eligible: false }],
    ['commerce_mode read_only', { commerce_mode: 'read_only' }],
    ['current_own_offer_status unavailable', { current_own_offer_status: 'unavailable' }],
  ])('a purchase-unavailable product (%s)', (_label, override) => {
    const cur = mapped();
    const page = { ...cur, product: { ...cur.product, ...override } } as PDPPayload;
    expect(applyLiveRefreshPatch(page, sentFor(cur), priceDrop())).toBe(page);
  });
});

describe('applyLiveRefreshPatch rejects the WHOLE patch on any allowlist or invariant breach', () => {
  const rejects = (edit: (res: any, cur: PDPPayload) => void, prepare?: (cur: PDPPayload) => PDPPayload) => {
    const cur = prepare ? prepare(mapped()) : mapped();
    const res = priceDrop();
    edit(res, cur);
    expect(applyLiveRefreshPatch(cur, sentFor(cur), res)).toBe(cur);
  };

  it.each([
    ['a content key', (r: any) => { r.patch.product.set.title = 'Other title'; }],
    ['purchase_eligible', (r: any) => { r.patch.product.set.purchase_eligible = true; }],
    ['current_own_offer_status', (r: any) => { r.patch.product.set.current_own_offer_status = null; }],
    ['commerce_mode', (r: any) => { r.patch.product.set.commerce_mode = 'merchant_checkout'; }],
    ['actions', (r: any) => { r.patch.product.set.actions = []; }],
    ['the product id', (r: any) => { r.patch.product.set.product_id = 'sig_other'; }],
    ['a destination url', (r: any) => { r.patch.product.set.destination_url = 'https://evil.example/'; }],
  ])('product.set naming %s', (_label, edit) => rejects(edit));

  it.each([
    ['a content key', (r: any) => { r.patch.product.unset = ['description']; }],
    ['purchase_eligible', (r: any) => { r.patch.product.unset = ['purchase_eligible']; }],
    ['a non-string', (r: any) => { r.patch.product.unset = [42]; }],
    ['a non-array', (r: any) => { r.patch.product.unset = 'payment_pricing'; }],
  ])('product.unset naming %s', (_label, edit) => rejects(edit));

  it('an unknown patch part, or a page-level actions change', () => {
    rejects((r) => { r.patch.actions = []; });
    rejects((r) => { r.patch.commerce = {}; });
  });

  it('a module type outside price_promo / variant_selector, or one the page does not have', () => {
    rejects((r) => { r.patch.modules.media_gallery = { items: [] }; });
    rejects(() => undefined, (cur) => ({ ...cur, modules: cur.modules.filter((m) => m.type !== 'price_promo') }));
  });

  it('a variant list that gains, loses, or reorders variants', () => {
    rejects((r) => { r.patch.product.set.variants.pop(); });
    rejects((r) => { r.patch.product.set.variants.push({ variant_id: '47170040267999', price: { current: { amount: 1, currency: 'USD' } } }); });
    rejects((r) => { r.patch.product.set.variants.reverse(); });
    rejects((r) => { r.patch.modules.variant_selector.variants.reverse(); });
  });

  it('a change to a variant verdict', () => {
    rejects((r) => { r.patch.product.set.variants[0].purchase_eligible = false; });
    rejects((r) => { r.patch.product.set.variants[0].commerce_mode = 'read_only'; });
    rejects((r) => { r.patch.modules.variant_selector.variants[0].current_own_offer_status = 'unavailable'; });
  });

  it('any touch of the withheld variant: on the card, in the selector, on an offer row', () => {
    const enable = (v: any) => {
      delete v.current_own_offer_status;
      v.price = { current: { amount: 60, currency: 'USD' } };
      v.availability = { in_stock: true };
    };
    rejects((r) => enable(r.patch.product.set.variants[1]));
    rejects((r) => { r.patch.product.set.variants[1].availability = { in_stock: true }; });
    rejects((r) => enable(r.patch.modules.variant_selector.variants[1]));
    rejects((r) => { r.patch.modules.variant_selector.variants[1].price = { current: { amount: 60, currency: 'USD' } }; });
    rejects((r) => enable(r.patch.offers.offers.find((o: any) => o.offer_id === OWN_OFFER).variants[1]));
    // A row copy of a withheld id that lost its marker is still withheld (it is withheld on the card).
    rejects(
      (r) => { r.patch.offers.offers.find((o: any) => o.offer_id === OWN_OFFER).variants[1].price = { current: { amount: 60, currency: 'USD' } }; },
      (cur) => ({ ...cur, offers: cur.offers!.map((o) => (o.offer_id === OWN_OFFER
        ? { ...o, variants: o.variants!.map((v) => (v.variant_id === WITHHELD ? (({ current_own_offer_status: _s, ...rest }) => rest)(v as any) : v)) }
        : o)) }),
    );
  });

  it('an offer row that sells the withheld variant is never re-priced or re-stocked', () => {
    rejects(
      () => undefined,
      // The own row now names the WITHHELD variant as its selection: the producer's answer re-prices it,
      // which the browser refuses.
      (cur) => ({ ...cur, offers: cur.offers!.map((o) => (o.offer_id === OWN_OFFER ? { ...o, selected_variant_id: WITHHELD } : o)) }),
    );
  });

  it('offers that are added, dropped, renamed, duplicated, or change a verdict or destination', () => {
    rejects((r) => { r.patch.offers.offers.pop(); });
    rejects((r) => { r.patch.offers.offers.push({ ...r.patch.offers.offers[0], offer_id: 'of:new' }); });
    rejects((r) => { r.patch.offers.offers[1] = { ...r.patch.offers.offers[0] }; });
    rejects((r) => { r.patch.offers.offers[0].offer_id = 'of:renamed'; });
    rejects((r) => { r.patch.offers.offers[0].url = 'https://evil.example/'; });
    rejects((r) => { r.patch.offers.offers[0].merchant_checkout_url = 'https://evil.example/'; });
    rejects((r) => { r.patch.offers.offers[0].commerce_mode = 'merchant_checkout'; });
    rejects((r) => { r.patch.offers.offers[0].purchase_eligible = true; });
    rejects((r) => { r.patch.offers.offers[0].selected_variant_id = WITHHELD; });
    rejects((r) => { r.patch.offers.offers = 'none'; });
  });

  it('a best price that names no offer', () => {
    rejects((r) => { r.patch.offers.best_price_offer_id = 'of:nowhere'; });
    rejects((r) => { r.patch.product.set.best_price_offer_id = 'of:nowhere'; });
  });

  it('product_intel pointers for a page that sent none', () => {
    rejects((r) => { r.patch.product_intel = { offer_pointers: { best_price_offer_id: OWN_OFFER } }; });
    rejects((r) => { r.patch.product_intel = { offer_pointers: 'x' }; });
  });

  it('replaces product_intel offer_pointers when the page sent them', () => {
    const cur = mapped();
    const page = {
      ...cur,
      modules: [...cur.modules, { module_id: 'product_intel', type: 'product_intel', priority: 65,
        data: { display_name: 'x', offer_pointers: { best_price_offer_id: OTHER_OFFER } } }],
    } as PDPPayload;
    const res = priceDrop();
    res.patch.product_intel = { offer_pointers: { best_price_offer_id: OWN_OFFER } };
    const next = applyLiveRefreshPatch(page, sentFor(page), res);
    expect(moduleData(next, 'product_intel')).toEqual({ display_name: 'x', offer_pointers: { best_price_offer_id: OWN_OFFER } });
  });

  it('the selected variant id the token was read for is untouched by a passing patch (control)', () => {
    const cur = mapped();
    const next = applyLiveRefreshPatch(cur, sentFor(cur), priceDrop());
    expect(next.product.default_variant_id).toBe(SELECTED);
  });
});
