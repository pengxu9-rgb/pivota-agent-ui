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
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  unstable_noStore: vi.fn(),
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
