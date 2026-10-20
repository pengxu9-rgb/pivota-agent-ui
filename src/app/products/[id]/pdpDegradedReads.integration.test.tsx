import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import receipt from '@/features/pdp/__fixtures__/canonicalOfferLive20261004/sig_6bb6c7ae7b7e71e838aefb564c60371a.json';
import ProductDetailPage, { generateMetadata } from './page';
import ProductDetailLayout from './layout';
import { PDP_DEGRADED_RENDER_ERROR } from './pdpServerPage';

// A get_pdp_v2 200 marked `degraded_reads` (the gateway built it while a catalog read could
// not reach the database), end to end through the REAL gateway client, layout, page and
// metadata. It must take the existing degraded path: the page throws the uncacheable
// sentinel (a 5xx ISR keeps out of its cache), and nothing maps it to a 404 or a noindex
// that would deindex a healthy product.

const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND_THROWN');
  }),
);

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  notFound: () => notFoundMock(),
}));

// unstable_cache as a passthrough: the cache-store semantics are pinned in
// src/lib/api.pdpDegradedReads.test.ts; this file pins what the route does with the throw.
const noStoreMock = vi.hoisted(() => vi.fn());
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  unstable_noStore: () => noStoreMock(),
}));

vi.mock('./ProductDetailClient', () => ({
  default: () => null,
}));

const SIG_ID = receipt.body.subject.id;
const healthy = () => structuredClone(receipt.body) as Record<string, unknown>;

function stubGateway(pdpBody: unknown) {
  const operations: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const operation = String(JSON.parse(String(init?.body || '{}'))?.operation || '');
      operations.push(operation);
      if (operation === 'get_pdp_v2') {
        return new Response(JSON.stringify(pdpBody), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'UNEXPECTED' }), { status: 500 });
    }),
  );
  return operations;
}

const routeProps = () => ({ params: Promise.resolve({ id: SIG_ID }), searchParams: Promise.resolve({}) });
const renderLayout = () => ProductDetailLayout({ params: Promise.resolve({ id: SIG_ID }), children: null });

describe('a degraded_reads 200 on the canonical PDP route', () => {
  beforeEach(() => {
    notFoundMock.mockClear();
    noStoreMock.mockClear();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('VERCEL_URL', '');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('control: the same body without the marker renders', async () => {
    stubGateway(healthy());
    await expect(ProductDetailPage(routeProps())).resolves.toBeTruthy();
    const metadata = await generateMetadata(routeProps());
    expect(metadata.alternates?.canonical).toContain(SIG_ID);
    const layout = (await renderLayout()) as { props: { children: unknown[] } };
    expect(layout.props.children[0]).toBeTruthy();
  });

  it('the page throws the degraded sentinel, once, with no retry and no existence probe', async () => {
    const operations = stubGateway({ ...healthy(), degraded_reads: ['catalog_signature_partial'] });
    await expect(ProductDetailPage(routeProps())).rejects.toThrow(PDP_DEGRADED_RENDER_ERROR);
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(operations).toEqual(['get_pdp_v2']);
    // Tripwire: on this ISR route Next 15.5 turns a noStore() during the fill into a
    // DynamicServerError / "static to dynamic at runtime" 500, so the degraded path must
    // throw the sentinel, never try to opt the request into dynamic rendering.
    expect(noStoreMock).not.toHaveBeenCalled();
  });

  it('the layout neither 404s nor emits JSON-LD built from the incomplete read', async () => {
    stubGateway({ ...healthy(), degraded_reads: ['catalog_signature_partial'] });
    const layout = (await renderLayout()) as { props: { children: unknown[] } };
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(layout.props.children[0]).toBeNull();
  });

  it('the metadata stays the transient default: no noindex on a sitemap route', async () => {
    stubGateway({ ...healthy(), degraded_reads: ['catalog_signature_partial'] });
    const metadata = await generateMetadata(routeProps());
    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates).toBeUndefined();
    expect(notFoundMock).not.toHaveBeenCalled();
  });
});

// The gateway stamps `degraded_reads` on EVERY JSON body it sends after the mark, error
// bodies included. A settled-looking 404 produced during the incident must stay the
// degraded 500: a 404 here is stored by ISR with s-maxage and deindexes the product
// for an hour after the database recovers.
const SETTLED_NOT_SERVABLE_404 = {
  error: 'PRODUCT_NOT_SERVABLE',
  message: 'Product not servable',
  details: { reason: 'low_quality', index_row_found: true, serving_eligible: false },
};
const SEED_NOT_ACTIVE_404 = {
  error: 'PRODUCT_NOT_FOUND',
  message: 'Product not found',
  details: { reason: 'external_seed_not_active', external_seed_status: 'inactive' },
};
const REASONLESS_404 = { error: 'PRODUCT_NOT_FOUND', message: 'Product not found', details: null };
const degraded = (body: Record<string, unknown>) => ({ ...body, degraded_reads: ['catalog_signature_partial'] });

function stubGatewayError(pdpBody: unknown, status: number) {
  const operations: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const operation = String(JSON.parse(String(init?.body || '{}'))?.operation || '');
      operations.push(operation);
      if (operation === 'get_pdp_v2') return new Response(JSON.stringify(pdpBody), { status });
      if (operation === 'pdp_route_id_exists') {
        // A settled "absent": what turns a reason-less 404 into a 404 page when the read was healthy.
        return new Response(
          JSON.stringify({ status: 'success', contract: 'pdp_route_id_existence.v1', product_id: SIG_ID, exists: false, matched: [] }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: 'UNEXPECTED' }), { status: 500 });
    }),
  );
  return operations;
}

describe('a degraded_reads ERROR body never becomes a 404', () => {
  beforeEach(() => {
    notFoundMock.mockClear();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('VERCEL_URL', '');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([
    ['a settled serving-ineligibility', SETTLED_NOT_SERVABLE_404],
    ['an allowlisted external_seed_not_active', SEED_NOT_ACTIVE_404],
    ['a reason-less not-found (existence probe)', REASONLESS_404],
  ])('control: %s without the marker 404s', async (_label, body) => {
    stubGatewayError(body, 404);
    await expect(renderLayout()).rejects.toThrow('NEXT_NOT_FOUND_THROWN');
    const metadata = await generateMetadata(routeProps());
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it.each([
    ['a settled serving-ineligibility', SETTLED_NOT_SERVABLE_404],
    ['an allowlisted external_seed_not_active', SEED_NOT_ACTIVE_404],
    ['a reason-less not-found', REASONLESS_404],
  ])('%s marked degraded stays the degraded 500: no notFound, no noindex, no probe', async (_label, body) => {
    const operations = stubGatewayError(degraded(body), 404);

    await expect(renderLayout()).resolves.toBeTruthy();
    await expect(ProductDetailPage(routeProps())).rejects.toThrow(PDP_DEGRADED_RENDER_ERROR);
    const metadata = await generateMetadata(routeProps());
    expect(metadata.robots).toBeUndefined();
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(operations).not.toContain('pdp_route_id_exists');
  });
});
