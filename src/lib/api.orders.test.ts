import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ensureAuroraSessionMock = vi.fn();
const shouldUseAuroraAutoExchangeMock = vi.fn();

vi.mock('@/lib/auroraOrdersAuth', () => ({
  ensureAuroraSession: (...args: unknown[]) => ensureAuroraSessionMock(...args),
  shouldUseAuroraAutoExchange: (...args: unknown[]) => shouldUseAuroraAutoExchangeMock(...args),
}));

import { listMyOrders, publicOrderResume } from '@/lib/api';

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('listMyOrders request options', () => {
  beforeEach(() => {
    ensureAuroraSessionMock.mockReset();
    shouldUseAuroraAutoExchangeMock.mockReset();
    shouldUseAuroraAutoExchangeMock.mockReturnValue(true);
    ensureAuroraSessionMock.mockResolvedValue({ ok: true });
    window.history.replaceState({}, '', '/orders?embed=1&entry=aurora_chatbox');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps legacy behavior when request options are omitted', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ orders: [], next_cursor: null, has_more: false }),
    );

    await listMyOrders('cursor_1', 20, { merchant_id: 'merchant_1' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url, 'https://agent.pivota.cc');
    expect(parsed.pathname).toBe('/api/accounts/orders/list');
    expect(parsed.searchParams.get('limit')).toBe('20');
    expect(parsed.searchParams.get('cursor')).toBe('cursor_1');
    expect(parsed.searchParams.get('merchant_id')).toBe('merchant_1');
  });

  it('passes timeout option to request via abort signal', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ orders: [], next_cursor: null, has_more: false }),
    );

    await listMyOrders(undefined, 20, { merchant_id: 'merchant_1' }, { timeout_ms: 2500 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('skips aurora recovery when aurora_recovery is off', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ detail: { error: { code: 'UNAUTHENTICATED', message: 'Unauthorized' } } }, 401),
    );

    await expect(
      listMyOrders(undefined, 20, undefined, { aurora_recovery: 'off' }),
    ).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ensureAuroraSessionMock).not.toHaveBeenCalled();
  });

  it('attempts aurora recovery once when aurora_recovery is auto', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ detail: { error: { code: 'UNAUTHENTICATED', message: 'Unauthorized' } } }, 401),
      )
      .mockResolvedValueOnce(
        jsonResponse({ orders: [{ order_id: 'ORD_1' }], next_cursor: null, has_more: false }),
      );

    const data = await listMyOrders(undefined, 20, undefined, { aurora_recovery: 'auto' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(ensureAuroraSessionMock).toHaveBeenCalledTimes(1);
    expect(Array.isArray((data as any).orders)).toBe(true);
    expect((data as any).orders[0]?.order_id).toBe('ORD_1');
  });

  it('calls the public order resume endpoint with order id and email', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ order: { order_id: 'ORD_RESUME_1' }, items: [], payment: { current: null }, customer: {} }),
    );

    await publicOrderResume('ORD_RESUME_1', 'buyer@example.com');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url, 'https://agent.pivota.cc');
    expect(parsed.pathname).toBe('/api/accounts/public/order-resume');
    expect(parsed.searchParams.get('order_id')).toBe('ORD_RESUME_1');
    expect(parsed.searchParams.get('email')).toBe('buyer@example.com');
  });
});
