import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import OrderSuccessPage from './page';

const pushMock = vi.fn();
const postRequestCloseToParentMock = vi.fn();
const getCheckoutTokenFromBrowserMock = vi.fn();
const fetchMock = vi.fn();
const assignMock = vi.fn();

let searchParamsValue = 'orderId=ord_123';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  useSearchParams: () => new URLSearchParams(searchParamsValue),
}));

vi.mock('@/lib/auroraEmbed', () => ({
  isAuroraEmbedMode: () => false,
  postRequestCloseToParent: (...args: unknown[]) => postRequestCloseToParentMock(...args),
}));

vi.mock('@/lib/checkoutToken', () => ({
  getCheckoutTokenFromBrowser: () => getCheckoutTokenFromBrowserMock(),
}));

describe('Order success action layout', () => {
  beforeEach(() => {
    searchParamsValue = 'orderId=ord_123';
    pushMock.mockReset();
    postRequestCloseToParentMock.mockReset();
    getCheckoutTokenFromBrowserMock.mockReset();
    fetchMock.mockReset();
    getCheckoutTokenFromBrowserMock.mockReturnValue(null);
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
  });

  afterEach(() => {
    cleanup();
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
});
