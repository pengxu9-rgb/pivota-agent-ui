import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import OrderSuccessPage from './page';

const pushMock = vi.fn();
const postRequestCloseToParentMock = vi.fn();
const getCheckoutTokenFromBrowserMock = vi.fn();
const confirmOrderPaymentMock = vi.fn();
const getOrderStatusMock = vi.fn();
const confirmPaymentWithRetryMock = vi.fn();
const pollOrderStatusUntilSettledMock = vi.fn();
const fetchMock = vi.fn();
const assignMock = vi.fn();
let embedModeValue = false;
let historyBackSpy: ReturnType<typeof vi.spyOn> | null = null;

let searchParamsValue = 'orderId=ord_123';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  useSearchParams: () => new URLSearchParams(searchParamsValue),
}));

vi.mock('@/lib/auroraEmbed', () => ({
  isAuroraEmbedMode: () => embedModeValue,
  postRequestCloseToParent: (...args: unknown[]) => postRequestCloseToParentMock(...args),
}));

vi.mock('@/lib/checkoutToken', () => ({
  getCheckoutTokenFromBrowser: () => getCheckoutTokenFromBrowserMock(),
  persistCheckoutToken: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  confirmOrderPayment: (...args: unknown[]) => confirmOrderPaymentMock(...args),
  getOrderStatus: (...args: unknown[]) => getOrderStatusMock(...args),
}));

vi.mock('@/lib/checkoutFinalization', () => ({
  confirmPaymentWithRetry: (...args: unknown[]) => confirmPaymentWithRetryMock(...args),
  pollOrderStatusUntilSettled: (...args: unknown[]) => pollOrderStatusUntilSettledMock(...args),
}));

describe('Order success action layout', () => {
  beforeEach(() => {
    searchParamsValue = 'orderId=ord_123';
    embedModeValue = false;
    pushMock.mockReset();
    postRequestCloseToParentMock.mockReset();
    getCheckoutTokenFromBrowserMock.mockReset();
    confirmOrderPaymentMock.mockReset();
    getOrderStatusMock.mockReset();
    confirmPaymentWithRetryMock.mockReset();
    pollOrderStatusUntilSettledMock.mockReset();
    fetchMock.mockReset();
    getCheckoutTokenFromBrowserMock.mockReturnValue(null);
    confirmPaymentWithRetryMock.mockResolvedValue({
      status: 'confirmed',
      attempts: 1,
      paymentStatus: 'paid',
      lastError: null,
    });
    pollOrderStatusUntilSettledMock.mockResolvedValue({
      status: 'confirmed',
      polls: 1,
      paymentStatus: 'paid',
      lastError: null,
    });
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);
    assignMock.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        assign: assignMock,
      },
    });
    historyBackSpy = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    historyBackSpy?.mockRestore();
    historyBackSpy = null;
    vi.unstubAllGlobals();
  });

  it('shows primary actions before details block for non-return flow', async () => {
    render(<OrderSuccessPage />);

    const trackButton = await screen.findByRole('button', { name: /track your order/i });
    const continueButton = screen.getByRole('button', { name: /continue shopping/i });
    const detailsSummary = screen.getByText(/order details & settings/i);
    const visibleDetailsBody = screen.getByText(/save for next time/i);

    expect(trackButton).toBeInTheDocument();
    expect(continueButton).toBeInTheDocument();
    expect(trackButton.compareDocumentPosition(detailsSummary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(continueButton.compareDocumentPosition(detailsSummary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(visibleDetailsBody).toBeInTheDocument();
    expect(screen.queryByText(/order details & settings/i, { selector: 'summary' })).toBeNull();
  });

  it('keeps return button in the primary action area when return URL exists', async () => {
    searchParamsValue = 'orderId=ord_123&return=%2Fproducts%2Ford_123';
    render(<OrderSuccessPage />);

    const returnButton = await screen.findByRole('button', { name: /return to previous page/i });
    const detailsSummary = screen.getByText(/order details & settings/i);
    const visibleDetailsBody = screen.getByText(/save for next time/i);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /track your order/i })).toBeNull();
    });
    expect(returnButton.compareDocumentPosition(detailsSummary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(visibleDetailsBody).toBeInTheDocument();
    expect(screen.queryByText(/order details & settings/i, { selector: 'summary' })).toBeNull();
  });

  it('routes continue shopping back to creator agent when source indicates creator entry', async () => {
    searchParamsValue = 'orderId=ord_123&source=creator_agent';
    render(<OrderSuccessPage />);

    const continueButton = await screen.findByRole('button', { name: /continue shopping/i });
    continueButton.click();

    expect(assignMock).toHaveBeenCalledWith('https://creator.pivota.cc/');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('prioritizes parent_origin over source when both are present', async () => {
    searchParamsValue =
      'orderId=ord_123&source=creator_agent&parent_origin=https%3A%2F%2Faurora.pivota.cc';
    render(<OrderSuccessPage />);

    const continueButton = await screen.findByRole('button', { name: /continue shopping/i });
    continueButton.click();

    expect(assignMock).toHaveBeenCalledWith('https://aurora.pivota.cc/');
    expect(pushMock).not.toHaveBeenCalled();
    expect(postRequestCloseToParentMock).not.toHaveBeenCalled();
  });

  it('keeps embed fallback when no external source is available', async () => {
    searchParamsValue = 'orderId=ord_123&embed=1';
    embedModeValue = true;
    postRequestCloseToParentMock.mockReturnValue(false);
    render(<OrderSuccessPage />);

    const continueButton = await screen.findByRole('button', { name: /continue shopping/i });
    continueButton.click();

    expect(postRequestCloseToParentMock).toHaveBeenCalledWith({ reason: 'order_success_continue' });
    expect(historyBackSpy).toHaveBeenCalledTimes(1);
    expect(assignMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('runs finalization recovery on success page when finalizing=1 is present', async () => {
    searchParamsValue = 'orderId=ord_123&finalizing=1';
    let resolvePoll: ((value: {
      status: 'confirmed' | 'pending';
      polls: number;
      paymentStatus: string | null;
      lastError: unknown | null;
    }) => void) | null = null;
    confirmPaymentWithRetryMock.mockResolvedValueOnce({
      status: 'pending',
      attempts: 1,
      paymentStatus: null,
      lastError: new Error('temporary'),
    });
    pollOrderStatusUntilSettledMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePoll = resolve;
      }),
    );

    render(<OrderSuccessPage />);

    expect(await screen.findByRole('heading', { name: /confirming payment/i })).toBeInTheDocument();
    expect(
      await screen.findByText(/syncing the final payment confirmation with the payment provider/i),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(confirmPaymentWithRetryMock).toHaveBeenCalledTimes(1);
      expect(pollOrderStatusUntilSettledMock).toHaveBeenCalledTimes(1);
    });
    resolvePoll?.({
      status: 'confirmed',
      polls: 2,
      paymentStatus: 'paid',
      lastError: null,
    });
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /confirming payment/i })).toBeNull();
      expect(screen.getByRole('heading', { name: /order successful/i })).toBeInTheDocument();
      expect(
        screen.queryByText(/syncing the final payment confirmation with the payment provider/i),
      ).toBeNull();
    });
  });

  it('shows a non-blocking note when finalization stays pending', async () => {
    searchParamsValue = 'orderId=ord_123&finalizing=1';
    confirmPaymentWithRetryMock.mockResolvedValueOnce({
      status: 'pending',
      attempts: 1,
      paymentStatus: null,
      lastError: new Error('temporary'),
    });
    pollOrderStatusUntilSettledMock.mockResolvedValueOnce({
      status: 'pending',
      polls: 3,
      paymentStatus: 'pending',
      lastError: null,
    });

    render(<OrderSuccessPage />);

    expect(
      await screen.findByText(/waiting for the final paid confirmation/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /confirming payment/i })).toBeInTheDocument();
    expect(confirmPaymentWithRetryMock).toHaveBeenCalledTimes(1);
    expect(pollOrderStatusUntilSettledMock).toHaveBeenCalledTimes(1);
  });
});
