import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// EVERY GATEWAY CALL CARRIES THE BUYER MARKET (src/lib/buyerMarket.ts).
//
// The gateway keys purchase claims on `metadata.market` and never on
// `metadata.scope.region` (the browser language). Before this, no call carried a
// market, so under an armed purchasability gate every PDP offer was declined. These
// tests drive the exported functions -- not callGateway in isolation -- because the
// defect was a property of every request the UI builds.

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const OK_BODY = { status: 'success', modules: [], products: [], items: [], total: 0 };

type FetchCalls = { mock: { calls: unknown[][] } };

function sentBodies(fetchMock: FetchCalls): any[] {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit)?.body || '{}')));
}

describe('every gateway call carries metadata.market', () => {
  let languageSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    window.localStorage.clear();
    // A browser language whose region is NOT the storefront market: the market must
    // not follow it (and scope.region, which does, must stay what it was).
    languageSpy = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('zh-CN');
  });

  afterEach(() => {
    languageSpy?.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('stamps the storefront market on every operation the UI sends, independent of the browser language', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(OK_BODY));
    const api = await import('./api');

    // One call per gateway-bound wrapper family: callGateway and
    // callGatewayWithTimeout -- PDP, search, discovery, similar, resolve, detail.
    // (Reviews and checkout ops share the envelope but the proxy sends them to the
    // backend, so they prove nothing about the gateway and are not listed.)
    const calls: Array<[string, () => Promise<unknown>]> = [
      ['get_pdp_v2', () => api.getPdpV2({ product_id: 'prod_1', merchant_id: 'merch_1', include: ['offers'] })],
      ['find_products_multi', () => api.sendMessage('moisturizer')],
      ['get_discovery_feed', () => api.getShoppingDiscoveryFeed({ surface: 'browse_products' } as any)],
      ['get_discovery_feed', () => api.getBrandDiscoveryFeed({ brandName: 'Probe Labs' } as any)],
      ['find_similar_products', () => api.getSimilarProductsMainline({ product_id: 'prod_1' } as any)],
      ['resolve_product_candidates', () => api.resolveProductCandidates({ product_id: 'prod_1' } as any)],
      ['resolve_product_group', () => api.resolveProductGroup({ product_id: 'prod_1' } as any)],
      ['get_product_detail', () => api.getProductDetail('prod_1', 'merch_1')],
    ];
    for (const [, call] of calls) {
      await call().catch(() => undefined);
    }

    const bodies = sentBodies(fetchMock);
    const operations = bodies.map((body) => body.operation);
    // Not vacuous: every operation above really reached fetch.
    for (const [operation] of calls) expect(operations).toContain(operation);
    for (const body of bodies) {
      expect(body.metadata?.market, body.operation).toBe('US');
      // The browser language still drives scope.region, and the market ignores it.
      expect(body.metadata?.scope?.region, body.operation).toBe('CN');
    }
  });

  it('the direct-to-Agent read and its proxy fallback both carry the market', async () => {
    vi.stubEnv('NEXT_PUBLIC_AGENT_API_KEY', `dummy_public_agent_key_${'c'.repeat(24)}`);
    vi.stubEnv('NEXT_PUBLIC_AGENT_DIRECT_READS_ENABLED', 'true');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ error: 'UNAUTHORIZED' }, 401))
      .mockResolvedValueOnce(jsonResponse(OK_BODY));
    const { getPdpV2 } = await import('./api');

    await getPdpV2({ product_id: 'prod_1', merchant_id: 'merch_1', include: ['offers'] });

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toEqual(['https://gateway.pivota.cc/agent/shop/v1/invoke', '/api/gateway']);
    for (const body of sentBodies(fetchMock)) expect(body.metadata.market).toBe('US');
  });

  it("a caller's own priceable market wins; anything else is replaced, never forwarded", async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(OK_BODY));
    const { sendMessage } = await import('./api');

    const cases: Array<[unknown, string]> = [
      ['sg', 'SG'],
      [' JP ', 'JP'],
      // The gateway reads each of these as "a market nothing is priced for" and
      // serves NOTHING -- so they must never leave the UI.
      ['en-US', 'US'],
      ['US,SG', 'US'],
      ['USA', 'US'],
      // Well-formed codes the gateway has no currency for: also a page of nothing.
      ['UK', 'US'],
      ['DE', 'US'],
      ['ZZ', 'US'],
      ['gb', 'GB'],
      [['US'], 'US'],
      ['', 'US'],
    ];
    for (const [market] of cases) {
      await sendMessage('serum', undefined, { metadata: { market } }).catch(() => undefined);
    }

    const markets = sentBodies(fetchMock)
      .filter((body) => body.operation === 'find_products_multi')
      .map((body) => body.metadata.market);
    expect(markets).toEqual(cases.map(([, expected]) => expected));
  });
});

// CHOICE > LOCATED > STOREFRONT, read from the browser's own cookie jar on every call.
describe('the buyer market follows the choice cookie, then the located cookie, then the storefront', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    for (const name of ['pv_market', 'pv_located_market']) document.cookie = `${name}=; path=/; max-age=0`;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    for (const name of ['pv_market', 'pv_located_market']) document.cookie = `${name}=; path=/; max-age=0`;
  });

  const stampedMarkets = async (cookies: string[]) => {
    vi.restoreAllMocks();
    vi.resetModules();
    for (const c of cookies) document.cookie = `${c}; path=/`;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(OK_BODY));
    const api = await import('./api');
    await api.sendMessage('serum').catch(() => undefined);
    await api.getPdpV2({ product_id: 'prod_1', merchant_id: 'merch_1', include: ['offers'] }).catch(() => undefined);
    const bodies = sentBodies(fetchMock);
    expect(bodies.map((b) => b.operation)).toEqual(['find_products_multi', 'get_pdp_v2']);
    return bodies.map((b) => b.metadata.market);
  };

  it('no cookie: the storefront market', async () => {
    expect(await stampedMarkets([])).toEqual(['US', 'US']);
  });
  it('a Japanese browser with no cookie is still the storefront market: navigator.language is never a market', async () => {
    const spy = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('ja-JP');
    try {
      expect(await stampedMarkets([])).toEqual(['US', 'US']);
    } finally {
      spy.mockRestore();
    }
  });
  it('a located cookie alone, naming a SERVED market: the located market', async () => {
    expect(await stampedMarkets(['pv_located_market=US'])).toEqual(['US', 'US']);
  });
  it('a located SG buyer is served SG (served since 2026-10-10); a located JP buyer (priceable, 6-row feed) the storefront market', async () => {
    expect(await stampedMarkets(['pv_located_market=SG'])).toEqual(['SG', 'SG']);
    for (const name of ['pv_market', 'pv_located_market']) document.cookie = `${name}=; path=/; max-age=0`;
    expect(await stampedMarkets(['pv_located_market=JP'])).toEqual(['US', 'US']);
  });
  it('a choice cookie beats the located cookie, and a CHOSEN SG is honoured', async () => {
    expect(await stampedMarkets(['pv_located_market=US', 'pv_market=sg'])).toEqual(['SG', 'SG']);
  });
  it("a cookie naming a market the gateway cannot price is skipped, not sent", async () => {
    expect(await stampedMarkets(['pv_market=DE', 'pv_located_market=US'])).toEqual(['US', 'US']);
    for (const name of ['pv_market', 'pv_located_market']) document.cookie = `${name}=; path=/; max-age=0`;
    expect(await stampedMarkets(['pv_market=en-US', 'pv_located_market=ZZ'])).toEqual(['US', 'US']);
  });
  it("the caller's own market still wins over both cookies", async () => {
    for (const c of ['pv_located_market=JP', 'pv_market=SG']) document.cookie = `${c}; path=/`;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(OK_BODY));
    const { sendMessage } = await import('./api');
    await sendMessage('serum', undefined, { metadata: { market: 'gb' } }).catch(() => undefined);
    expect(sentBodies(fetchMock)[0].metadata.market).toBe('GB');
  });
});

