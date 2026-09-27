// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// THE SERVER-RENDERED PATHS CARRY THE MARKET TOO. On SSR there is no `window`, so
// `scope.region` is null -- the market must not depend on anything the browser has.

const jsonResponse = (payload: unknown) =>
  new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });

const cacheKeys: string[][] = [];
vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown, keyParts: string[]) => {
    cacheKeys.push(keyParts);
    return fn;
  },
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'agent.pivota.cc', 'x-forwarded-proto': 'https' }),
}));

const sentBodies = (fetchMock: { mock: { calls: unknown[][] } }): any[] =>
  fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit)?.body || '{}')));

describe('SSR gateway calls carry metadata.market', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    cacheKeys.length = 0;
  });
  afterEach(() => vi.restoreAllMocks());

  it('the anonymous cached PDP read sends the market and is cached per market', async () => {
    expect(typeof window).toBe('undefined');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ status: 'success', modules: [{ type: 'canonical' }] }));
    const { getPdpV2Cached } = await import('./api');

    await getPdpV2Cached({ product_id: 'prod_1', include: ['offers'] });

    const [body] = sentBodies(fetchMock);
    expect(body.operation).toBe('get_pdp_v2');
    expect(body.metadata.market).toBe('US');
    expect(body.metadata.scope.region).toBeNull();
    expect(cacheKeys).toHaveLength(1);
    expect(cacheKeys[0]).toContain('market:US');
  });

  it('the indexability feed (a direct /api/gateway POST) sends the market', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ products: [] }));
    const { fetchIndexabilityPage } = await import('@/app/products/indexability/productsIndexability');

    await fetchIndexabilityPage(1).catch(() => undefined);

    const bodies = sentBodies(fetchMock).filter((b) => b.operation === 'get_product_entity_index_feed');
    expect(bodies).toHaveLength(1);
    expect(bodies[0].metadata.market).toBe('US');
  });
});

// STRUCTURAL: a gateway envelope built anywhere but callGateway must go through
// withBuyerMarket. The sweep asserts it FOUND the known direct senders, so it cannot
// pass by matching nothing.
describe('no gateway envelope skips the market', () => {
  const SRC = path.resolve(__dirname, '..');
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });

  // Files that POST an invoke envelope themselves, and why each is compliant.
  const EXPECTED: Record<string, string> = {
    'lib/api.ts': 'callGateway stamps metadata.market on every request it builds',
    'app/brands/[slug]/page.tsx': 'withBuyerMarket',
    'app/products/indexability/productsIndexability.ts': 'withBuyerMarket',
    // The proxy forwards the client's envelope verbatim (already stamped). Its one
    // envelope of its own, the PDP reviews overlay, goes to the BACKEND reviews lane
    // (REVIEWS_UPSTREAM_BASE), not to the gateway.
    'app/api/gateway/route.ts': 'proxy: forwards stamped bodies; own call is backend-bound',
  };

  it('every file that sends an operation envelope is a known, compliant sender', () => {
    const senders = walk(SRC)
      .filter((file) => {
        const text = fs.readFileSync(file, 'utf8');
        return /fetch\(/.test(text) && /\boperation\s*:\s*['"`]/.test(text) && /(api\/gateway|agent\/shop\/v1\/invoke|InvokeUrl)/.test(text);
      })
      .map((file) => path.relative(SRC, file).split(path.sep).join('/'))
      .sort();

    expect(senders).toEqual(Object.keys(EXPECTED).sort());
    for (const file of ['app/brands/[slug]/page.tsx', 'app/products/indexability/productsIndexability.ts']) {
      expect(fs.readFileSync(path.join(SRC, file), 'utf8'), file).toMatch(/JSON\.stringify\(withBuyerMarket\(\{/);
    }
    expect(fs.readFileSync(path.join(SRC, 'lib/api.ts'), 'utf8')).toMatch(
      /market: resolveBuyerMarket\(requestMetadata\.market\)/,
    );
  });
});
