import { afterEach, describe, expect, it, vi } from 'vitest';

// unstable_cache is exercised as a passthrough here: what matters is what the loader RETURNS (and so what
// may be cached) versus what it THROWS (never cached, and read by the page as "unknown").
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  unstable_noStore: () => undefined,
}));

import { getPdpRouteIdExistenceCached, PDP_ROUTE_ID_EXISTENCE_CONTRACT } from '@/lib/api';

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

const answer = (over: Record<string, unknown> = {}) => ({
  status: 'success',
  contract: PDP_ROUTE_ID_EXISTENCE_CONTRACT,
  product_id: 'foo',
  exists: false,
  matched: [],
  ...over,
});

const GATEWAY = 'https://agent.pivota.cc/api/gateway';

describe('getPdpRouteIdExistenceCached', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks pdp_route_id_exists for the id and returns a settled answer', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(answer()));
    await expect(getPdpRouteIdExistenceCached({ product_id: 'foo', gatewayBaseUrl: GATEWAY })).resolves.toEqual({
      exists: false,
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.operation).toBe('pdp_route_id_exists');
    expect(body.payload).toEqual({ product_ref: { product_id: 'foo' } });
  });

  it.each([true, null])('relays exists:%s', async (exists) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(answer({ exists })));
    await expect(getPdpRouteIdExistenceCached({ product_id: 'foo', gatewayBaseUrl: GATEWAY })).resolves.toEqual({
      exists,
    });
  });

  it.each([
    ['a different contract', { contract: 'pdp_route_id_existence.v0' }],
    ['no contract', { contract: undefined }],
    ['an answer about another id', { product_id: 'bar' }],
    ['a string exists', { exists: 'false' }],
    ['a missing exists', { exists: undefined }],
    ['a numeric exists', { exists: 0 }],
  ])('throws (never caches, never "absent") on %s', async (_label, over) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(answer(over)));
    await expect(getPdpRouteIdExistenceCached({ product_id: 'foo', gatewayBaseUrl: GATEWAY })).rejects.toThrow();
  });

  it('throws when the probe could not answer (503) or the gateway predates the operation (400)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ error: 'PDP_ROUTE_ID_EXISTENCE_UNAVAILABLE', message: 'Existence could not be determined' }, 503),
    );
    await expect(getPdpRouteIdExistenceCached({ product_id: 'foo', gatewayBaseUrl: GATEWAY })).rejects.toThrow();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'INVALID_REQUEST' }, 400));
    await expect(getPdpRouteIdExistenceCached({ product_id: 'foo', gatewayBaseUrl: GATEWAY })).rejects.toThrow();
  });

  it('refuses an empty id without calling the gateway', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(getPdpRouteIdExistenceCached({ product_id: '  ' })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
