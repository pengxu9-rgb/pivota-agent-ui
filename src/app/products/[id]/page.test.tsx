import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProductDetailPage from './page';

const pushMock = vi.fn();
const replaceMock = vi.fn();
const getPdpV2Mock = vi.fn();
const getPdpV2PersonalizationMock = vi.fn();
const getProductDetailMock = vi.fn();
const getSimilarProductsMainlineMock = vi.fn();
const resolveProductCandidatesMock = vi.fn();
const recordBrowseHistoryEventMock = vi.fn();
const mapPdpV2ToPdpPayloadMock = vi.fn();
const mapToPdpPayloadMock = vi.fn();
const addItemMock = vi.fn();
const openCartMock = vi.fn();
let authUser: { id: string } | null = null;

let searchParamsValue = '';

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    use: (value: unknown) => value,
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
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

vi.mock('@/store/cartStore', () => ({
  useCartStore: (selector?: (state: { addItem: typeof addItemMock; open: typeof openCartMock }) => unknown) => {
    const state = { addItem: addItemMock, open: openCartMock };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector?: (state: { user: { id: string } | null }) => unknown) => {
    const state = { user: authUser };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('@/lib/productRouteLoading', () => ({
  hideProductRouteLoading: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  getPdpV2: (...args: unknown[]) => getPdpV2Mock(...args),
  getPdpV2Personalization: (...args: unknown[]) => getPdpV2PersonalizationMock(...args),
  getProductDetail: (...args: unknown[]) => getProductDetailMock(...args),
  getSimilarProductsMainline: (...args: unknown[]) => getSimilarProductsMainlineMock(...args),
  recordBrowseHistoryEvent: (...args: unknown[]) => recordBrowseHistoryEventMock(...args),
  resolveProductCandidates: (...args: unknown[]) => resolveProductCandidatesMock(...args),
}));

vi.mock('@/features/pdp/adapter/mapPdpV2ToPdpPayload', () => ({
  mapPdpV2ToPdpPayload: (...args: unknown[]) => mapPdpV2ToPdpPayloadMock(...args),
}));

vi.mock('@/features/pdp/adapter/mapToPdpPayload', () => ({
  mapToPdpPayload: (...args: unknown[]) => mapToPdpPayloadMock(...args),
}));

vi.mock('@/features/pdp/containers/BeautyPDPContainer', () => ({
  BeautyPDPContainer: ({ payload }: { payload: { product: { title: string } } }) => (
    <div data-testid="beauty-pdp">{payload.product.title}</div>
  ),
}));

vi.mock('@/features/pdp/containers/GenericPDPContainer', () => ({
  GenericPDPContainer: ({
    payload,
  }: {
    payload: {
      product: { title: string };
      modules?: Array<{ type?: string; data?: { items?: unknown[] } }>;
      x_recommendations_state?: string;
    };
  }) => (
    <div data-testid="generic-pdp">
      <div>{payload.product.title}</div>
      <div data-testid="recommendations-count">
        {payload.modules?.find((module) => module.type === 'recommendations')?.data?.items?.length ?? 0}
      </div>
      <div data-testid="recommendations-state">{payload.x_recommendations_state ?? ''}</div>
    </div>
  ),
}));

vi.mock('@/features/pdp/tracking', () => ({
  pdpTracking: {
    track: vi.fn(),
  },
}));

vi.mock('@/lib/returnUrl', () => ({
  isExternalAgentEntry: vi.fn(() => false),
  resolveExternalAgentHomeUrl: vi.fn(() => null),
  safeReturnUrl: vi.fn(() => null),
}));

vi.mock('@/features/pdp/state/freezePolicy', () => ({
  DEFAULT_MODULE_SOURCE_LOCKS: {
    reviews: false,
    similar: false,
    ugc: false,
  },
  upsertLockedModule: vi.fn(
    ({
      currentModules,
      type,
      nextModule,
      locked,
    }: {
      currentModules?: Array<{ type?: string }>;
      type?: string;
      nextModule?: { type?: string } | null;
      locked?: boolean;
    }) => ({
      modules: [
        ...(Array.isArray(currentModules)
          ? currentModules.filter((module) => module?.type !== type)
          : []),
        ...(nextModule ? [nextModule] : []),
      ],
      locked: Boolean(locked),
    }),
  ),
}));

function renderPage(productId = 'prod_1') {
  return render(<ProductDetailPage params={{ id: productId } as any} />);
}

function buildApiError(args: {
  message: string;
  code?: string;
  status?: number;
  gatewayRequestId?: string;
  upstreamRequestId?: string;
}) {
  const error = new Error(args.message) as Error & {
    code?: string;
    status?: number;
    detail?: Record<string, unknown>;
  };
  error.code = args.code;
  error.status = args.status;
  error.detail = {
    ...(args.code ? { reason_code: args.code, error: args.code } : {}),
    ...(args.status ? { status: args.status } : {}),
    ...(args.gatewayRequestId ? { gateway_request_id: args.gatewayRequestId } : {}),
    ...(args.upstreamRequestId ? { upstream_request_id: args.upstreamRequestId } : {}),
    message: args.message,
  };
  return error;
}

const canonicalPayload = {
  schema_version: '1.0.0',
  page_type: 'product_detail',
  tracking: {
    page_request_id: 'pr_test',
    entry_point: 'agent',
  },
  product: {
    product_id: 'prod_1',
    merchant_id: 'external_seed',
    title: 'Canonical PDP Product',
    default_variant_id: 'v_1',
    variants: [
      {
        variant_id: 'v_1',
        title: 'Default',
        price: { current: { amount: 28, currency: 'USD' } },
        availability: { in_stock: true, available_quantity: 5 },
      },
    ],
    price: { current: { amount: 28, currency: 'USD' } },
    availability: { in_stock: true, available_quantity: 5 },
  },
  offers: [
    {
      offer_id: 'offer_1',
      merchant_id: 'external_seed',
      price: { amount: 28, currency: 'USD' },
    },
  ],
  modules: [
    {
      module_id: 'reviews_preview',
      type: 'reviews_preview',
      priority: 50,
      data: { scale: 5, rating: 4.5, review_count: 12, preview_items: [] },
    },
    {
      module_id: 'recommendations',
      type: 'recommendations',
      priority: 90,
      data: { strategy: 'related_products', items: [] },
    },
  ],
  actions: [],
} as const;

const canonicalLoadingPayload = {
  ...canonicalPayload,
  modules: canonicalPayload.modules.filter((module) => module.type !== 'recommendations'),
  x_recommendations_state: 'loading',
} as const;

const canonicalSimilarItems = [
  { product_id: 'sim_1', merchant_id: 'external_seed', title: 'Similar 1' },
  { product_id: 'sim_2', merchant_id: 'external_seed', title: 'Similar 2' },
];

const canonicalWithSimilarPayload = {
  ...canonicalLoadingPayload,
  modules: [
    ...canonicalLoadingPayload.modules,
    {
      module_id: 'recommendations',
      type: 'recommendations',
      priority: 90,
      data: {
        strategy: 'related_products',
        items: canonicalSimilarItems,
      },
    },
  ],
  x_recommendations_state: 'ready',
} as const;

describe('ProductDetailPage canonical PDP loading', () => {
  beforeEach(() => {
    searchParamsValue = '';
    window.localStorage.clear();
    pushMock.mockReset();
    replaceMock.mockReset();
    getPdpV2Mock.mockReset();
    getPdpV2PersonalizationMock.mockReset();
    getProductDetailMock.mockReset();
    getSimilarProductsMainlineMock.mockReset();
    resolveProductCandidatesMock.mockReset();
    recordBrowseHistoryEventMock.mockReset();
    mapPdpV2ToPdpPayloadMock.mockReset();
    mapToPdpPayloadMock.mockReset();
    addItemMock.mockReset();
    openCartMock.mockReset();
    authUser = null;

    getPdpV2PersonalizationMock.mockResolvedValue({});
    recordBrowseHistoryEventMock.mockResolvedValue(null);
    mapPdpV2ToPdpPayloadMock.mockReturnValue(canonicalPayload);
    mapToPdpPayloadMock.mockReturnValue(canonicalPayload);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('requests canonical PDP modules on the first get_pdp_v2 call', async () => {
    getPdpV2Mock.mockResolvedValue({ status: 'success', modules: [] });

    renderPage();

    await screen.findByTestId('generic-pdp');
    expect(getPdpV2Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: 'prod_1',
        include: [
          'offers',
          'variant_selector',
          'active_ingredients',
          'ingredients_inci',
          'how_to_use',
          'product_details',
        ],
        timeout_ms: 9000,
      }),
    );
    expect(getPdpV2Mock).toHaveBeenCalledTimes(1);
  });

  it('shows seller chooser on canonical failure and does not revive legacy product detail', async () => {
    getPdpV2Mock.mockRejectedValue(new Error('The request timed out'));
    resolveProductCandidatesMock.mockResolvedValue({
      offers: [
        {
          offer_id: 'offer_1',
          product_id: 'prod_1',
          merchant_id: 'merchant_a',
          merchant_name: 'Merchant A',
          price: { amount: 19, currency: 'USD' },
          inventory: { in_stock: true },
        },
        {
          offer_id: 'offer_2',
          product_id: 'prod_1',
          merchant_id: 'merchant_b',
          merchant_name: 'Merchant B',
          price: { amount: 22, currency: 'USD' },
          inventory: { in_stock: true },
        },
      ],
    });

    renderPage();

    await screen.findByText('Choose a seller');
    expect(getProductDetailMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('generic-pdp')).not.toBeInTheDocument();
  });

  it('shows timeout-specific PDP errors with request ids when canonical PDP fails', async () => {
    getPdpV2Mock.mockRejectedValue(
      buildApiError({
        message: 'The product service timed out. Please retry.',
        code: 'UPSTREAM_TIMEOUT',
        status: 504,
        gatewayRequestId: 'gw_test_timeout_123',
        upstreamRequestId: 'up_test_timeout_456',
      }),
    );
    resolveProductCandidatesMock.mockResolvedValue({ offers: [] });

    renderPage();

    await screen.findByText('Product request timed out');
    expect(screen.getByText('The product service timed out. Please retry.')).toBeInTheDocument();
    expect(screen.getByText(/Request ID:/)).toBeInTheDocument();
    expect(screen.getByText('gw_test_timeout_123')).toBeInTheDocument();
    expect(screen.getByText('up_test_timeout_456')).toBeInTheDocument();
    expect(getProductDetailMock).not.toHaveBeenCalled();
  });

  it('shows product-not-found errors without collapsing them into timeout messaging', async () => {
    getPdpV2Mock.mockRejectedValue(
      buildApiError({
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND',
        status: 404,
        gatewayRequestId: 'gw_test_missing_123',
      }),
    );
    resolveProductCandidatesMock.mockResolvedValue({ offers: [] });

    renderPage();

    await screen.findByText('Product not found');
    expect(screen.getByText('This product is no longer available.')).toBeInTheDocument();
    expect(screen.queryByText('Product request timed out')).not.toBeInTheDocument();
    expect(screen.getByText(/Request ID:/)).toBeInTheDocument();
    expect(screen.getByText('gw_test_missing_123')).toBeInTheDocument();
  });

  it('canonicalizes external_seed merchant routes back to the unscoped product URL', async () => {
    searchParamsValue = 'merchant_id=external_seed';
    getPdpV2Mock.mockResolvedValue({ status: 'success', modules: [] });

    renderPage();

    await screen.findByTestId('generic-pdp');
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/products/prod_1'));
  });

  it('infers external_seed merchant ids for ext_ product routes on the first get_pdp_v2 call', async () => {
    getPdpV2Mock.mockResolvedValue({ status: 'success', modules: [] });

    renderPage('ext_8e7b0abf06e2ebc11f1356ae');

    await screen.findByTestId('generic-pdp');
    expect(getPdpV2Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: 'ext_8e7b0abf06e2ebc11f1356ae',
        merchant_id: 'external_seed',
      }),
    );
    expect(resolveProductCandidatesMock).not.toHaveBeenCalled();
  });

  it('ignores mismatched merchant hints for ext_ product routes and rewrites back to canonical URL', async () => {
    searchParamsValue = 'merchant_id=merchant_wrong&return=%2Fbrands%2Ftom-ford';
    getPdpV2Mock.mockResolvedValue({
      status: 'success',
      modules: [],
      product: {
        product_id: 'ext_8e7b0abf06e2ebc11f1356ae',
        merchant_id: 'external_seed',
      },
    });
    mapPdpV2ToPdpPayloadMock.mockReturnValue({
      ...canonicalPayload,
      product: {
        ...canonicalPayload.product,
        product_id: 'ext_8e7b0abf06e2ebc11f1356ae',
      },
    });

    renderPage('ext_8e7b0abf06e2ebc11f1356ae');

    await screen.findByTestId('generic-pdp');
    expect(getPdpV2Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: 'ext_8e7b0abf06e2ebc11f1356ae',
        merchant_id: 'external_seed',
      }),
    );
    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        '/products/ext_8e7b0abf06e2ebc11f1356ae?return=%2Fbrands%2Ftom-ford',
      ),
    );
  });

  it('does not post remote browse history events for guests', async () => {
    getPdpV2Mock.mockResolvedValue({ status: 'success', modules: [] });

    renderPage();

    await screen.findByTestId('generic-pdp');
    await waitFor(() => {
      expect(recordBrowseHistoryEventMock).not.toHaveBeenCalled();
    });
  });

  it('loads similar backfill from the mainline path before falling back to get_pdp_v2', async () => {
    window.localStorage.setItem(
      'browse_history',
      JSON.stringify([
        {
          product_id: 'recent_1',
          merchant_id: 'external_seed',
          title: 'Barrier repair serum',
          category: 'Serum',
          timestamp: Date.parse('2026-04-09T10:00:00.000Z'),
        },
      ]),
    );
    getPdpV2Mock.mockResolvedValue({ kind: 'initial' });
    getSimilarProductsMainlineMock.mockResolvedValue({
      strategy: 'related_products',
      items: canonicalSimilarItems,
      metadata: null,
      page_info: { page: 1, page_size: 2, has_more: false },
    });

    mapPdpV2ToPdpPayloadMock.mockReturnValue(canonicalLoadingPayload);

    renderPage();

    await screen.findByTestId('generic-pdp');
    await waitFor(() => {
      expect(screen.getByTestId('recommendations-count')).toHaveTextContent('2');
      expect(screen.getByTestId('recommendations-state')).toHaveTextContent('ready');
    });

    expect(getSimilarProductsMainlineMock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: 'prod_1',
        limit: 6,
        recentViews: expect.arrayContaining([
          expect.objectContaining({
            product_id: 'recent_1',
            merchant_id: 'external_seed',
            title: 'Barrier repair serum',
            category: 'Serum',
          }),
        ]),
        timeout_ms: 3200,
      }),
    );
    expect(getPdpV2Mock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        include: ['similar'],
      }),
    );
  });

  it('falls back to get_pdp_v2 similar backfill after a mainline timeout', async () => {
    const timeoutErr = Object.assign(new Error('The request timed out. Please retry.'), {
      code: 'UPSTREAM_TIMEOUT',
    });

    getSimilarProductsMainlineMock.mockRejectedValue(timeoutErr);
    getPdpV2Mock.mockImplementation(async (args: { include?: string[]; cache_bypass?: boolean }) => {
      if (Array.isArray(args?.include) && args.include.length === 1 && args.include[0] === 'similar') {
        if (args.cache_bypass) {
          return { kind: 'similar-success' };
        }
        throw timeoutErr;
      }
      return { kind: 'initial' };
    });

    mapPdpV2ToPdpPayloadMock.mockImplementation((response: { kind?: string }) => {
      if (response?.kind === 'similar-success') {
        return canonicalWithSimilarPayload;
      }
      return canonicalLoadingPayload;
    });

    renderPage();

    await screen.findByTestId('generic-pdp');
    await waitFor(() => {
      expect(screen.getByTestId('recommendations-count')).toHaveTextContent('2');
      expect(screen.getByTestId('recommendations-state')).toHaveTextContent('ready');
    });

    expect(getSimilarProductsMainlineMock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: 'prod_1',
        limit: 6,
        timeout_ms: 3200,
      }),
    );
    expect(getPdpV2Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: 'prod_1',
        include: ['similar'],
        timeout_ms: 4200,
      }),
    );
    expect(getPdpV2Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: 'prod_1',
        include: ['similar'],
        timeout_ms: 2200,
        cache_bypass: true,
      }),
    );
  });
});
