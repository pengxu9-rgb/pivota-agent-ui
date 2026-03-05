import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import OrdersPage from './page';
import { useAuthStore } from '@/store/authStore';

const replaceMock = vi.fn();
const pushMock = vi.fn();

const listMyOrdersMock = vi.fn();
const cancelAccountOrderMock = vi.fn();
const ensureAuroraSessionMock = vi.fn();
const shouldUseAuroraAutoExchangeMock = vi.fn();
const isAuroraEmbedModeMock = vi.fn();

let pathnameValue = '/orders';
let searchParamsValue = 'entry=aurora_chatbox&embed=1';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: pushMock,
  }),
  usePathname: () => pathnameValue,
  useSearchParams: () => new URLSearchParams(searchParamsValue),
}));

vi.mock('@/lib/api', () => ({
  listMyOrders: (...args: unknown[]) => listMyOrdersMock(...args),
  cancelAccountOrder: (...args: unknown[]) => cancelAccountOrderMock(...args),
}));

vi.mock('@/lib/auroraOrdersAuth', () => ({
  ensureAuroraSession: (...args: unknown[]) => ensureAuroraSessionMock(...args),
  shouldUseAuroraAutoExchange: (...args: unknown[]) => shouldUseAuroraAutoExchangeMock(...args),
}));

vi.mock('@/lib/auroraEmbed', () => ({
  isAuroraEmbedMode: () => isAuroraEmbedModeMock(),
}));

const makeOrderListPayload = (orderId: string) => ({
  orders: [
    {
      order_id: orderId,
      merchant_id: 'merchant_test',
      currency: 'USD',
      total_amount_minor: 1299,
      status: 'paid',
      payment_status: 'paid',
      fulfillment_status: 'fulfilled',
      delivery_status: 'delivered',
      created_at: '2026-03-05T12:00:00.000Z',
      items_summary: 'Test item x1',
      permissions: {
        can_pay: false,
        can_cancel: false,
        can_reorder: false,
      },
    },
  ],
  next_cursor: null,
  has_more: false,
});

describe('Orders page recovery flow', () => {
  beforeEach(() => {
    pathnameValue = '/orders';
    searchParamsValue = 'entry=aurora_chatbox&embed=1';
    replaceMock.mockReset();
    pushMock.mockReset();
    listMyOrdersMock.mockReset();
    cancelAccountOrderMock.mockReset();
    ensureAuroraSessionMock.mockReset();
    shouldUseAuroraAutoExchangeMock.mockReset();
    isAuroraEmbedModeMock.mockReset();

    shouldUseAuroraAutoExchangeMock.mockReturnValue(true);
    ensureAuroraSessionMock.mockResolvedValue({ ok: true });
    isAuroraEmbedModeMock.mockReturnValue(true);
    window.sessionStorage.clear();
    useAuthStore.setState({
      user: null,
      memberships: [],
      activeMerchantId: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('recovers once on initial 401 and then renders orders', async () => {
    listMyOrdersMock
      .mockRejectedValueOnce({ status: 401, code: 'UNAUTHENTICATED' })
      .mockResolvedValueOnce(makeOrderListPayload('ORD_RECOVERED_1'));

    render(<OrdersPage />);

    await screen.findByText('Order #ORD_RECOVERED_1');
    expect(ensureAuroraSessionMock).toHaveBeenCalledTimes(1);
    expect(listMyOrdersMock).toHaveBeenCalledTimes(2);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('shows failed state actions when recovery cannot restore session', async () => {
    listMyOrdersMock.mockRejectedValue({ status: 401, code: 'UNAUTHENTICATED' });
    ensureAuroraSessionMock.mockResolvedValue({ ok: false, reason: 'BOOTSTRAP_TIMEOUT' });

    render(<OrdersPage />);

    await screen.findByText('Session recovery failed. Please retry or log in again.');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in again' })).toBeInTheDocument();
    expect(ensureAuroraSessionMock).toHaveBeenCalledTimes(1);
  });

  it('hydrates cached list immediately before network refresh returns', async () => {
    const cacheKey = 'orders_list_cache_v1:/orders:__none__';
    window.sessionStorage.setItem(
      cacheKey,
      JSON.stringify({
        savedAt: Date.now(),
        orders: [
          {
            id: 'ORD_CACHE_1',
            merchantId: null,
            currency: 'USD',
            totalAmountMinor: 2000,
            status: 'paid',
            paymentStatus: 'paid',
            fulfillmentStatus: 'fulfilled',
            deliveryStatus: 'delivered',
            createdAt: '2026-03-05T12:00:00.000Z',
            shippingCity: null,
            shippingCountry: null,
            itemsSummary: 'Cached item',
            creatorId: null,
            creatorName: null,
            creatorSlug: null,
            firstItemImageUrl: null,
            permissions: {
              canPay: false,
              canCancel: false,
              canReorder: false,
            },
          },
        ],
        cursor: null,
        hasMore: false,
      }),
    );

    let resolveList: ((payload: unknown) => void) | null = null;
    listMyOrdersMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );

    render(<OrdersPage />);

    await screen.findByText('Order #ORD_CACHE_1');
    expect(listMyOrdersMock).toHaveBeenCalledTimes(1);

    resolveList?.(makeOrderListPayload('ORD_NETWORK_1'));
    await waitFor(() => {
      expect(screen.getByText('Order #ORD_NETWORK_1')).toBeInTheDocument();
    });
  });

  it('manual retry triggers another list request after failure', async () => {
    listMyOrdersMock
      .mockRejectedValueOnce({ status: 401, code: 'UNAUTHENTICATED' })
      .mockResolvedValueOnce(makeOrderListPayload('ORD_AFTER_RETRY'));
    ensureAuroraSessionMock.mockResolvedValue({ ok: false, reason: 'NO_AURORA_SESSION' });

    render(<OrdersPage />);
    await screen.findByText('Session recovery failed. Please retry or log in again.');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('Order #ORD_AFTER_RETRY');
    expect(listMyOrdersMock).toHaveBeenCalledTimes(2);
  });
});
