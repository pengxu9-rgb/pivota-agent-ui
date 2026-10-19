import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProductDetailPage from './page';
import ProductDetailLayout from './layout';
import { PDP_DEGRADED_RENDER_ERROR } from './pdpServerPage';

// A retired product's sig_ URL, end to end through the REAL gateway client.
//
// Prod, 2026-10-18 21:59Z: GET /products/sig_bec7d5736761a4cbba05e35d7d9ab4d3 answered 500
// after ~5.6s on every bingbot crawl, which is about half of the LB 5xx alert. The gateway
// answered get_pdp_v2 with the 404 body below. It has no `details.reason`, so
// classifyPdpFetchFailure keeps it `degraded`, and pdp_route_id_exists says
// `exists: true` because the catalog signature row outlived its seed. The result
// is the degraded 500, which is correct for a reason-less 404: a swallowed DB error
// in the gateway's entry precheck produces the same body, and ISR would store a 404 for an hour.
//
// The fix is on the gateway (PIVOTA-Agent: name `external_seed_not_active` for a
// re-keyed merch_obs_ sig row whose seed is retired). These tests pin both halves of
// the contract against the real callGateway error shape, not a hand-built Error.
// The prod body still gives the 500, and the fixed body gives a 404 from the layout before the shell flushes.

const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND_THROWN');
  }),
);

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  notFound: () => notFoundMock(),
}));

// unstable_cache as a passthrough: what is under test is the gateway answer's
// classification, not the Data Cache.
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  unstable_noStore: vi.fn(),
}));

vi.mock('./ProductDetailClient', () => ({
  default: () => null,
}));

const SIG_ID = 'sig_bec7d5736761a4cbba05e35d7d9ab4d3';

// Captured from prod 2026-10-19 (route_health trimmed).
const PROD_REASONLESS_404 = {
  error: 'PRODUCT_NOT_FOUND',
  message: 'Product not found',
  reason_code: 'PRODUCT_NOT_FOUND',
  gateway_request_id: '5d7578d5-c388-4c75-b96e-6184f461a5fc',
  details: null,
  metadata: {
    identity_resolution: {
      requested_product_id: SIG_ID,
      requested_merchant_id: null,
      resolved_product_id: 'coscorea-com:d26860c6915342c2',
      resolved_merchant_id: 'merch_obs_5a931cc7ff5382e9',
      canonicalization_applied: true,
      canonicalization_reason_code: 'PIVOTA_SIGNATURE_ID',
      entry_precheck_missing: true,
      resolution_source: 'catalog_products_signature_exact',
    },
  },
};

// The same answer once the gateway names the settled reason.
const FIXED_GATEWAY_404 = {
  ...PROD_REASONLESS_404,
  details: {
    reason: 'external_seed_not_active',
    external_seed_status: 'inactive',
    external_seed_id: 'eps_1',
    external_product_id: 'coscorea-com:d26860c6915342c2',
  },
};

// Captured from prod 2026-10-19.
const PROD_EXISTENCE_ANSWER = {
  status: 'success',
  contract: 'pdp_route_id_existence.v1',
  product_id: SIG_ID,
  exists: true,
  matched: ['catalog_signature', 'content_election_sig'],
};

function stubGateway(pdpBody: unknown) {
  const operations: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const operation = String(JSON.parse(String(init?.body || '{}'))?.operation || '');
      operations.push(operation);
      if (operation === 'get_pdp_v2') {
        return new Response(JSON.stringify(pdpBody), { status: 404 });
      }
      if (operation === 'pdp_route_id_exists') {
        return new Response(JSON.stringify(PROD_EXISTENCE_ANSWER), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'UNEXPECTED' }), { status: 500 });
    }),
  );
  return operations;
}

const renderLayout = () => ProductDetailLayout({ params: Promise.resolve({ id: SIG_ID }), children: null });
const renderPage = () =>
  ProductDetailPage({ params: Promise.resolve({ id: SIG_ID }), searchParams: Promise.resolve({}) });

describe('a retired sig_ PDP through the real gateway client', () => {
  beforeEach(() => {
    notFoundMock.mockClear();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('VERCEL_URL', '');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('the prod reason-less 404 stays the degraded 500: nothing in it is settled', async () => {
    const operations = stubGateway(PROD_REASONLESS_404);

    await expect(renderLayout()).resolves.toBeTruthy();
    expect(notFoundMock).not.toHaveBeenCalled();
    await expect(renderPage()).rejects.toThrow(PDP_DEGRADED_RENDER_ERROR);
    expect(notFoundMock).not.toHaveBeenCalled();
    // The existence probe WAS asked, and its exists:true is what keeps this a 500.
    expect(operations).toContain('pdp_route_id_exists');
  });

  it('the fixed gateway answer 404s in the LAYOUT, without asking the probe', async () => {
    const operations = stubGateway(FIXED_GATEWAY_404);

    await expect(renderLayout()).rejects.toThrow('NEXT_NOT_FOUND_THROWN');
    expect(notFoundMock).toHaveBeenCalledTimes(1);
    expect(operations).toEqual(['get_pdp_v2']);
  });

  it('the page 404s it too, instead of throwing the degraded 500', async () => {
    stubGateway(FIXED_GATEWAY_404);

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND_THROWN');
  });
});
