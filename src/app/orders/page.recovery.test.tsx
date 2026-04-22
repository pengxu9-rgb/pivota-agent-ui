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
const SCOPE_HINT_STORAGE_KEY = 'aurora_orders_scope_hint_v1';

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

const makeOrderListPayload = (orderId: string, merchantId = 'merchant_test') => ({
  orders: [
    {
      order_id: orderId,
      merchant_id: merchantId,
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

const makeRefundedOrderListPayload = (orderId: string) => ({
  orders: [
    {
      order_id: orderId,
      merchant_id: 'merchant_test',
      currency: 'USD',
      total_amount_minor: 2500,
      status: 'partially_refunded',
      payment_status: 'partially_refunded',
      refund_status: 'partially_refunded',
      total_refunded_minor: 500,
      fulfillment_status: 'fulfilled',
      delivery_status: 'delivered',
      created_at: '2026-03-05T12:00:00.000Z',
      items_summary: 'Refunded item x1',
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
    window.localStorage.clear();
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

    let resolveList: (payload: unknown) => void = () => {};
    listMyOrdersMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );

    render(<OrdersPage />);

    await screen.findByText('Order #ORD_CACHE_1');
    expect(listMyOrdersMock).toHaveBeenCalledTimes(1);

    resolveList(makeOrderListPayload('ORD_NETWORK_1'));
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

  it('refines scope once when response provides active merchant id', async () => {
    listMyOrdersMock
      .mockResolvedValueOnce({
        orders: [
          {
            order_id: 'ORD_OTHER_SCOPE',
            merchant_id: 'merchant_other',
            currency: 'USD',
            total_amount_minor: 1299,
            status: 'paid',
            payment_status: 'paid',
            fulfillment_status: 'fulfilled',
            delivery_status: 'delivered',
            created_at: '2026-03-05T12:00:00.000Z',
            items_summary: 'Other scope item',
            permissions: { can_pay: false, can_cancel: false, can_reorder: false },
          },
        ],
        next_cursor: null,
        has_more: false,
        active_merchant_id: 'merchant_scope',
      })
      .mockResolvedValueOnce({
        ...makeOrderListPayload('ORD_SCOPE_REFINED', 'merchant_scope'),
        active_merchant_id: 'merchant_scope',
      });

    render(<OrdersPage />);

    await screen.findByText('Order #ORD_SCOPE_REFINED');
    expect(listMyOrdersMock).toHaveBeenCalledTimes(2);
    expect(listMyOrdersMock.mock.calls[0][1]).toBe(6);
    expect(listMyOrdersMock.mock.calls[0][2]).toBeUndefined();
    expect(listMyOrdersMock.mock.calls[1][2]).toEqual({ merchant_id: 'merchant_scope' });
  });

  it('uses persisted scope hint on initial request', async () => {
    window.localStorage.setItem(
      SCOPE_HINT_STORAGE_KEY,
      JSON.stringify({
        merchantId: 'merchant_hint',
        savedAt: Date.now(),
      }),
    );
    listMyOrdersMock.mockResolvedValue(makeOrderListPayload('ORD_SCOPE_HINT', 'merchant_hint'));

    render(<OrdersPage />);

    await screen.findByText('Order #ORD_SCOPE_HINT');
    expect(listMyOrdersMock).toHaveBeenCalledTimes(1);
    expect(listMyOrdersMock.mock.calls[0][1]).toBe(20);
    expect(listMyOrdersMock.mock.calls[0][2]).toEqual({ merchant_id: 'merchant_hint' });
  });

  it('renders partial refund summary from the orders list payload', async () => {
    listMyOrdersMock.mockResolvedValueOnce(makeRefundedOrderListPayload('ORD_REFUND_1'));

    render(<OrdersPage />);

    await screen.findByText('Order #ORD_REFUND_1');
    expect(screen.getByText('Partially refunded')).toBeInTheDocument();
    expect(screen.getByText('Partially refunded $5.00')).toBeInTheDocument();
  });
});
