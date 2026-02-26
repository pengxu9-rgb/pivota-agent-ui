/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WriteReviewClient from './WriteReviewClient';
import { useAuthStore } from '@/store/authStore';

const pushMock = vi.fn();
const backMock = vi.fn();
const assignMock = vi.fn();

const getPdpV2Mock = vi.fn();
const getPdpV2PersonalizationMock = vi.fn();
const getReviewEligibilityMock = vi.fn();
const createReviewFromUserMock = vi.fn();
const attachReviewMediaFromUserMock = vi.fn();
const getProductDetailMock = vi.fn();
const mapPdpV2ToPdpPayloadMock = vi.fn();
const isAuroraEmbedModeMock = vi.fn();
const postRequestCloseToParentMock = vi.fn();

let searchParamsValue = 'product_id=prod_1&merchant_id=merch_1';

vi.mock('next/image', () => ({
  default: (
    props: React.ImgHTMLAttributes<HTMLImageElement> & {
      fill?: boolean;
      unoptimized?: boolean;
      priority?: boolean;
      fetchPriority?: string;
    },
  ) => {
    const {
      fill: _fill,
      unoptimized: _unoptimized,
      priority: _priority,
      fetchPriority: _fetchPriority,
      alt,
      ...rest
    } = props;
    return <img {...rest} alt={typeof alt === 'string' ? alt : ''} />;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    back: backMock,
  }),
  useSearchParams: () => new URLSearchParams(searchParamsValue),
}));

vi.mock('sonner', () => ({
  toast: {
    message: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/api', () => ({
  getPdpV2: (...args: unknown[]) => getPdpV2Mock(...args),
  getPdpV2Personalization: (...args: unknown[]) => getPdpV2PersonalizationMock(...args),
  getReviewEligibility: (...args: unknown[]) => getReviewEligibilityMock(...args),
  createReviewFromUser: (...args: unknown[]) => createReviewFromUserMock(...args),
  attachReviewMediaFromUser: (...args: unknown[]) => attachReviewMediaFromUserMock(...args),
  getProductDetail: (...args: unknown[]) => getProductDetailMock(...args),
}));

vi.mock('@/features/pdp/adapter/mapPdpV2ToPdpPayload', () => ({
  mapPdpV2ToPdpPayload: (...args: unknown[]) => mapPdpV2ToPdpPayloadMock(...args),
}));

vi.mock('@/lib/auroraEmbed', () => ({
  isAuroraEmbedMode: () => isAuroraEmbedModeMock(),
  postRequestCloseToParent: (...args: unknown[]) => postRequestCloseToParentMock(...args),
}));

vi.mock('@/features/pdp/tracking', () => ({
  pdpTracking: {
    track: vi.fn(),
  },
}));

const defaultMappedPayload = {
  schema_version: '1.0.0',
  page_type: 'product_detail',
  tracking: {
    page_request_id: 'pr_write_review',
    entry_point: 'agent',
  },
  product: {
    product_id: 'prod_1',
    merchant_id: 'merch_1',
    title: 'Test Product',
    image_url: 'https://example.com/prod.jpg',
    variants: [
      {
        variant_id: 'v_1',
        title: 'Default',
        price: { current: { amount: 12.34, currency: 'USD' } },
        availability: { in_stock: true, available_quantity: 5 },
      },
    ],
    price: { current: { amount: 12.34, currency: 'USD' } },
    availability: { in_stock: true, available_quantity: 5 },
  },
  modules: [],
  actions: [],
} as const;

async function submitInAppReviewAndGetReturnButton() {
  render(<WriteReviewClient />);
  const submitButton = await screen.findByRole('button', { name: /submit review/i });
  fireEvent.click(submitButton);
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /return to previous page/i })).toBeInTheDocument();
  });
  return screen.getByRole('button', { name: /return to previous page/i });
}

describe('WriteReviewClient success return flow', () => {
  beforeEach(() => {
    searchParamsValue = 'product_id=prod_1&merchant_id=merch_1';
    pushMock.mockReset();
    backMock.mockReset();
    assignMock.mockReset();
    getPdpV2Mock.mockReset();
    getPdpV2PersonalizationMock.mockReset();
    getReviewEligibilityMock.mockReset();
    createReviewFromUserMock.mockReset();
    attachReviewMediaFromUserMock.mockReset();
    getProductDetailMock.mockReset();
    mapPdpV2ToPdpPayloadMock.mockReset();
    isAuroraEmbedModeMock.mockReset();
    postRequestCloseToParentMock.mockReset();

    useAuthStore.setState({
      user: {
        id: 'user_123',
        email: 'buyer@example.com',
      } as any,
      memberships: [],
      activeMerchantId: null,
    });

    getPdpV2Mock.mockResolvedValue({
      subject: {
        canonical_product_ref: {
          merchant_id: 'merch_1',
          platform: 'shopify',
          platform_product_id: 'prod_1',
        },
      },
    });
    mapPdpV2ToPdpPayloadMock.mockReturnValue(defaultMappedPayload);
    getReviewEligibilityMock.mockResolvedValue({ eligible: true, canRate: true, action: 'CREATE' });
    getPdpV2PersonalizationMock.mockResolvedValue({
      ugcCapabilities: {
        canUploadMedia: true,
        canWriteReview: true,
        canRateReview: true,
        canAskQuestion: true,
        reasons: {},
      },
    });
    createReviewFromUserMock.mockResolvedValue({ status: 'success', review_id: 9304 });
    attachReviewMediaFromUserMock.mockResolvedValue(null);
    getProductDetailMock.mockResolvedValue(null);
    isAuroraEmbedModeMock.mockReturnValue(false);
    postRequestCloseToParentMock.mockReturnValue(false);

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
    vi.restoreAllMocks();
    useAuthStore.setState({ user: null, memberships: [], activeMerchantId: null });
  });

  it('navigates to validated return URL with submitted review params', async () => {
    searchParamsValue = 'product_id=prod_1&merchant_id=merch_1&return=%2Fproducts%2Fprod_1%3Ffrom%3Dagent';

    const returnButton = await submitInAppReviewAndGetReturnButton();
    fireEvent.click(returnButton);

    expect(assignMock).toHaveBeenCalledTimes(1);
    const target = String(assignMock.mock.calls[0]?.[0] || '');
    expect(target).toContain('/products/prod_1?from=agent');
    expect(target).toContain('review=submitted');
    expect(target).toContain('review_id=9304');
    expect(target).toContain('product_id=prod_1');
  });

  it('posts request_close in embed mode when return URL is missing', async () => {
    searchParamsValue = 'product_id=prod_1&merchant_id=merch_1&embed=1&entry=aurora_chatbox';
    isAuroraEmbedModeMock.mockReturnValue(true);
    postRequestCloseToParentMock.mockReturnValue(true);

    const returnButton = await submitInAppReviewAndGetReturnButton();
    fireEvent.click(returnButton);

    expect(postRequestCloseToParentMock).toHaveBeenCalledWith({ reason: 'review_submit_success' });
    expect(assignMock).not.toHaveBeenCalled();
    expect(backMock).not.toHaveBeenCalled();
  });

  it('falls back to router.back when local history is available', async () => {
    searchParamsValue = 'product_id=prod_1&merchant_id=merch_1';
    window.history.pushState({}, '', '/products/prod_1');

    const returnButton = await submitInAppReviewAndGetReturnButton();
    fireEvent.click(returnButton);

    expect(backMock).toHaveBeenCalledTimes(1);
    expect(assignMock).not.toHaveBeenCalled();
    expect(postRequestCloseToParentMock).not.toHaveBeenCalled();
  });
});
