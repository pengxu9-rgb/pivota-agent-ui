import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { confirmOrderPayment, getOrderStatus } from '@/lib/api';

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('checkout gateway payloads', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/order/success?entry=aurora_chatbox');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends confirm_payment with payload.order.order_id', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ order_id: 'ord_123', payment_status: 'paid' }),
    );

    await confirmOrderPayment('ord_123');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/gateway');
    const body = JSON.parse(String(init.body || '{}'));
    expect(body).toMatchObject({
      operation: 'confirm_payment',
      payload: {
        order: {
          order_id: 'ord_123',
        },
      },
    });
  });

  it('sends get_order_status with payload.status.order_id', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ order_id: 'ord_123', payment_status: 'processing' }),
    );

    await getOrderStatus('ord_123');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/gateway');
    const body = JSON.parse(String(init.body || '{}'));
    expect(body).toMatchObject({
      operation: 'get_order_status',
      payload: {
        status: {
          order_id: 'ord_123',
        },
      },
    });
    expect(body?.payload?.order).toBeUndefined();
  });
});
