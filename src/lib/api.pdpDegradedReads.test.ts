import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import receipt from '@/features/pdp/__fixtures__/canonicalOfferLive20261004/sig_6bb6c7ae7b7e71e838aefb564c60371a.json';

// A Data Cache stand-in with the one property of Next 15.5's unstable_cache that matters here
// (next/dist/server/web/spec-extension/unstable-cache.js): on a miss it awaits the callback and
// only THEN stores the result (cacheNewResult runs after `await cb()`), so a rejection is never
// stored and the next call runs the callback again. A hit returns the stored value without
// running it.
const dataCache = vi.hoisted(() => new Map<string, unknown>());
vi.mock('next/cache', () => ({
  unstable_cache:
    (fn: () => Promise<unknown>, keyParts: string[]) =>
    async () => {
      const key = keyParts.join('|');
      if (dataCache.has(key)) return dataCache.get(key);
      const value = await fn();
      dataCache.set(key, value);
      return value;
    },
  unstable_noStore: () => undefined,
}));

import { getPdpV2, getPdpV2Cached } from '@/lib/api';
import { hasDegradedReads, PDP_DEGRADED_READS_LOG_TOKEN, PDP_DEGRADED_RENDER_ERROR } from '@/lib/pdpDegradedRender';

const GATEWAY = 'https://gateway.example.test/api/gateway';
const PRODUCT_ID = receipt.body.subject.id;
const healthy = () => structuredClone(receipt.body) as Record<string, unknown>;
const withDegradedReads = (degraded_reads: unknown) => ({ ...healthy(), degraded_reads });

function stubPdpBodies(...bodies: unknown[]) {
  const queue = [...bodies];
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    const body = queue.length > 1 ? queue.shift() : queue[0];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}

const readCached = () =>
  getPdpV2Cached({ product_id: PRODUCT_ID, allow_read_only: true, gatewayBaseUrl: GATEWAY });

describe('getPdpV2Cached: a 200 the gateway marked degraded is never cached', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dataCache.clear();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws PDP_DEGRADED_RENDER_ERROR, stores nothing, and the next read goes back to the gateway', async () => {
    const fetchMock = stubPdpBodies(withDegradedReads(['catalog_signature_partial']), healthy());

    await expect(readCached()).rejects.toThrow(PDP_DEGRADED_RENDER_ERROR);
    expect(dataCache.size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(PDP_DEGRADED_READS_LOG_TOKEN);

    // The recovered gateway answer is read fresh (not replayed from a cached degraded value),
    // and that one IS stored: the third read never reaches the gateway.
    const recovered = await readCached();
    expect(recovered.modules?.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(dataCache.size).toBe(1);
    await readCached();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('treats a reason this client does not know yet as degraded too', async () => {
    stubPdpBodies(withDegradedReads(['some_future_read', 'catalog_signature_partial']));
    await expect(readCached()).rejects.toThrow(PDP_DEGRADED_RENDER_ERROR);
    expect(dataCache.size).toBe(0);
  });

  it.each([
    ['absent', undefined],
    ['null', null],
    ['an empty array', []],
  ])('caches a complete answer when degraded_reads is %s', async (_label, value) => {
    const body = healthy();
    if (value !== undefined) body.degraded_reads = value;
    const fetchMock = stubPdpBodies(body);

    const response = await readCached();
    expect(response.modules?.length).toBeGreaterThan(0);
    expect(dataCache.size).toBe(1);
    await readCached();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not change the uncached read (personalized route / browser), which has nothing to poison', async () => {
    stubPdpBodies(withDegradedReads(['catalog_signature_partial']));
    const response = await getPdpV2({ product_id: PRODUCT_ID, allow_read_only: true, gatewayBaseUrl: GATEWAY });
    expect(response.degraded_reads).toEqual(['catalog_signature_partial']);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('hasDegradedReads', () => {
  it.each([
    [{ degraded_reads: ['catalog_signature_partial'] }, true],
    [{ degraded_reads: ['anything_else'] }, true],
    [{ degraded_reads: [] }, false],
    [{ degraded_reads: null }, false],
    [{}, false],
    [null, false],
    [undefined, false],
    ['degraded_reads', false],
  ])('%j -> %s', (response, expected) => {
    expect(hasDegradedReads(response)).toBe(expected);
  });
});
