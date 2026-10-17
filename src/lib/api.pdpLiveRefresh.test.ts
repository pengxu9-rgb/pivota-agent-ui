import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cacheKeys = vi.hoisted(() => [] as string[][]);
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown, key: string[]) => {
    cacheKeys.push(key);
    return fn;
  },
  unstable_noStore: () => undefined,
}));

import { getPdpLiveRefresh, getPdpV2, getPdpV2Cached } from '@/lib/api';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
const PDP = { status: 'success', modules: [{ type: 'canonical', data: { pdp_payload: { product: { product_id: 'p1' } } } }] };
const PAGE = { modules: [{ type: 'canonical', data: { pdp_payload: { product: { product_id: 'p1' } } } }] };
const TOKEN = 'v1.eyJ2IjoxfQ.bWFj';
const requestOf = (fetchMock: ReturnType<typeof vi.spyOn>, i = 0) =>
  JSON.parse(String((fetchMock.mock.calls[i] as [string, RequestInit])[1].body));

beforeEach(() => {
  cacheKeys.length = 0;
  document.cookie = 'pv_market=; path=/; max-age=0';
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.cookie = 'pv_market=; path=/; max-age=0';
});

describe('get_pdp_v2 opts in to the live-refresh descriptor only when asked', () => {
  it('sets options.live_refresh for live_refresh: true, and nothing otherwise', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json(PDP));
    await getPdpV2({ product_id: 'p1', live_refresh: true });
    await getPdpV2({ product_id: 'p1' });
    await getPdpV2({ product_id: 'p1', live_refresh: false });
    expect(requestOf(fetchMock, 0).payload.options.live_refresh).toBe(true);
    expect(requestOf(fetchMock, 1).payload.options).not.toHaveProperty('live_refresh');
    expect(requestOf(fetchMock, 2).payload.options).not.toHaveProperty('live_refresh');
  });

  it('the cached read keys an opted-in response apart (live-refresh-v1) and forwards the opt-in', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json(PDP));
    await getPdpV2Cached({ product_id: 'p1', live_refresh: true });
    await getPdpV2Cached({ product_id: 'p1' });
    expect(cacheKeys[0]).toContain('live-refresh-v1');
    expect(cacheKeys[1]).not.toContain('live-refresh-v1');
    expect(cacheKeys[0].filter((part) => part !== 'live-refresh-v1')).toEqual(cacheKeys[1]);
    expect(requestOf(fetchMock, 0).payload.options.live_refresh).toBe(true);
    expect(requestOf(fetchMock, 1).payload.options).not.toHaveProperty('live_refresh');
  });
});

describe('getPdpLiveRefresh', () => {
  it('sends pdp_live_read with the token and the page, through the gateway proxy, with the buyer market', async () => {
    const answer = { status: 'success', live_refresh: { mode: 'shadow', outcome: 'confirmed', reason: null } };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json(answer));
    await expect(getPdpLiveRefresh({ token: TOKEN, page: PAGE as any })).resolves.toEqual(answer);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toMatch(/\/api\/gateway/);
    expect(init.method).toBe('POST');
    const request = JSON.parse(String(init.body));
    expect(request.operation).toBe('pdp_live_read');
    expect(request.payload).toEqual({ live_refresh_token: TOKEN, page: PAGE });
    expect(request.metadata.market).toBe('US');
  });

  it('carries the buyer\'s declared market, like every call', async () => {
    document.cookie = 'pv_market=SG; path=/';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ status: 'success' }));
    await getPdpLiveRefresh({ token: TOKEN, page: PAGE as any });
    expect(requestOf(fetchMock).metadata.market).toBe('SG');
  });

  it('rejects on an older gateway\'s 400 for an operation it does not know', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ error: 'Invalid request', details: { error: 'INVALID_OPERATION' } }, 400));
    await expect(getPdpLiveRefresh({ token: TOKEN, page: PAGE as any })).rejects.toMatchObject({ status: 400 });
  });

  it('aborts after 4.5 s by default', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, rejectFetch) => {
      signal = (init as RequestInit).signal as AbortSignal;
      signal.addEventListener('abort', () => rejectFetch(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const pending = getPdpLiveRefresh({ token: TOKEN, page: PAGE as any });
    const settled = pending.catch((err) => err);
    await vi.advanceTimersByTimeAsync(4499);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    await expect(settled).resolves.toMatchObject({ code: 'UPSTREAM_TIMEOUT' });
  });
});
