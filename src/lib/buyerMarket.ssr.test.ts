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
      return /\.(ts|tsx|js|jsx|mjs)$/.test(entry.name) && !/\.test\.(ts|tsx|js|mjs)$/.test(entry.name) ? [full] : [];
    });
  // Comments removed first, so a wrap or a stamp that survives only in a comment
  // does not count.
  const code = (file: string) =>
    fs
      .readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const rel = (file: string) => path.relative(SRC, file).split(path.sep).join('/');
  // An invoke envelope: an `operation` key (bare or quoted) next to a fetch.
  const ENVELOPE = /['"]?\boperation['"]?\s*:/;
  const GATEWAY_BOUND = /(api\/gateway|agent\/shop\/v1\/invoke|InvokeUrl)/;

  // Files that POST an invoke envelope themselves, and why each is compliant.
  const EXPECTED: Record<string, string> = {
    'lib/api.ts': 'callGateway stamps metadata.market on every request it builds',
    'app/brands/[slug]/page.tsx': 'withBuyerMarket',
    'app/products/indexability/productsIndexability.ts': 'withBuyerMarket',
    // The proxy forwards the client's envelope verbatim (already stamped). Its one
    // envelope of its own, the PDP reviews overlay, goes to the BACKEND reviews lane
    // (REVIEWS_UPSTREAM_BASE), not to the gateway -- pinned below as exactly one.
    'app/api/gateway/route.ts': 'proxy: forwards stamped bodies; own call is backend-bound',
  };

  it('every file that sends an operation envelope is a known, compliant sender', () => {
    const senders = walk(SRC)
      .filter((file) => {
        const text = code(file);
        return /fetch\(/.test(text) && ENVELOPE.test(text) && GATEWAY_BOUND.test(text);
      })
      .map(rel)
      .sort();

    expect(senders).toEqual(Object.keys(EXPECTED).sort());
    for (const file of ['app/brands/[slug]/page.tsx', 'app/products/indexability/productsIndexability.ts']) {
      const text = code(path.join(SRC, file));
      // Every JSON body in these files is wrapped -- not just one of them.
      const bodies = text.match(/body:\s*JSON\.stringify\(/g) || [];
      const wrapped = text.match(/body:\s*JSON\.stringify\(withBuyerMarket\(/g) || [];
      expect(bodies.length, file).toBeGreaterThan(0);
      expect(wrapped.length, file).toBe(bodies.length);
    }
    expect(code(path.join(SRC, 'lib/api.ts'))).toMatch(/market: resolveBuyerMarket\(requestMetadata\.market\)/);
  });

  it('the proxy builds exactly one envelope of its own, and it is the backend reviews overlay', () => {
    const text = code(path.join(SRC, 'app/api/gateway/route.ts'));
    // Any envelope literal, whatever its op (digits and dots included: get_pdp_v2, offers.resolve).
    const own = text.match(/JSON\.stringify\(\{\s*['"]?operation['"]?\s*:/g) || [];
    expect(own).toHaveLength(1);
    expect(text).toMatch(/JSON\.stringify\(\{\s*['"]?operation['"]?\s*:\s*['"]get_review_summary['"]/);
    expect(text).toMatch(/buildShopUpstreamInvokeUrl\(REVIEWS_UPSTREAM_BASE\)/);
  });
});
