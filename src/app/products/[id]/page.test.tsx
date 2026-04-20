import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProductDetailPage from './page';

const pushMock = vi.fn();
const replaceMock = vi.fn();
const getPdpV2Mock = vi.fn();
const getPdpV2PersonalizationMock = vi.fn();
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
    onAddToCart,
    onBuyNow,
  }: {
    payload: {
      product: { title: string; merchant_id?: string; product_id?: string; variants?: any[] };
      offers?: any[];
      offers_count?: number;
      x_offers_state?: string;
      modules?: Array<{ type?: string; data?: { items?: unknown[]; review_count?: number } }>;
      x_reviews_state?: string;
      x_recommendations_state?: string;
    };
    onAddToCart: (args: any) => void;
    onBuyNow: (args: any) => void;
  }) => (
    <div data-testid="generic-pdp">
      <div>{payload.product.title}</div>
      <button
        type="button"
        onClick={() => {
          const offer = payload.offers?.[0] || null;
          onAddToCart({
            variant: payload.product.variants?.[0] || { variant_id: 'variant_1', title: 'Default' },
            quantity: 1,
            merchant_id: offer?.merchant_id || payload.product.merchant_id,
            product_id: offer?.product_id || payload.product.product_id,
            offer_id: offer?.offer_id,
          });
        }}
      >
        Add to Cart
      </button>
      <button
        type="button"
        onClick={() => {
          const offer = payload.offers?.[0] || null;
          onBuyNow({
            variant: payload.product.variants?.[0] || { variant_id: 'variant_1', title: 'Default' },
            quantity: 1,
            merchant_id: offer?.merchant_id || payload.product.merchant_id,
            product_id: offer?.product_id || payload.product.product_id,
            offer_id: offer?.offer_id,
          });
        }}
      >
        Buy Now
      </button>
      <div data-testid="recommendations-count">
        {payload.modules?.find((module) => module.type === 'recommendations')?.data?.items?.length ?? 0}
      </div>
      <div data-testid="offers-count">{payload.offers?.length ?? 0}</div>
      <div data-testid="offers-state">{payload.x_offers_state ?? ''}</div>
      <div data-testid="reviews-count">
        {payload.modules?.find((module) => module.type === 'reviews_preview')?.data?.review_count ?? 0}
      </div>
      <div data-testid="reviews-state">{payload.x_reviews_state ?? ''}</div>
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

const canonicalBackfillLoadingPayload = {
  ...canonicalPayload,
  modules: [],
  x_reviews_state: 'loading',
  x_recommendations_state: 'loading',
} as const;

const canonicalWithReviewsPayload = {
  ...canonicalBackfillLoadingPayload,
  modules: canonicalPayload.modules.filter((module) => module.type === 'reviews_preview'),
  x_reviews_state: 'ready',
  x_recommendations_state: 'loading',
} as const;

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
        items: [
          { product_id: 'sim_1', merchant_id: 'external_seed', title: 'Similar 1' },
          { product_id: 'sim_2', merchant_id: 'external_seed', title: 'Similar 2' },
        ],
      },
    },
  ],
  x_recommendations_state: 'ready',
} as const;

const staleEmptySimilarPayload = {
  ...canonicalLoadingPayload,
  modules: [
    ...canonicalLoadingPayload.modules,
    {
      module_id: 'recommendations',
      type: 'recommendations',
      priority: 90,
      data: {
        strategy: 'related_products',
        status: 'empty',
        items: [],
        metadata: {
          similar_status: 'unavailable',
          low_confidence_reason_codes: ['UNDERFILL_FOR_QUALITY'],
        },
      },
    },
  ],
  x_recommendations_state: 'ready',
} as const;

describe('ProductDetailPage canonical PDP loading', () => {
  beforeEach(() => {
    searchParamsValue = '';
    pushMock.mockReset();
    replaceMock.mockReset();
    getPdpV2Mock.mockReset();
    getPdpV2PersonalizationMock.mockReset();
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

  it('shows the centered PDP loading status while the canonical payload is pending', () => {
    getPdpV2Mock.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('pdp-loading-scrim')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading products');
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
          'product_intel',
          'active_ingredients',
          'ingredients_inci',
          'how_to_use',
          'product_overview',
          'supplemental_details',
          'reviews_preview',
          'similar',
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
    expect(screen.queryByTestId('generic-pdp')).not.toBeInTheDocument();
  });

  it('shows an error when canonical PDP fails without seller disambiguation', async () => {
    getPdpV2Mock.mockRejectedValue(new Error('The request timed out'));
    resolveProductCandidatesMock.mockResolvedValue({ offers: [] });

    renderPage();

    await screen.findByText('Failed to load product');
  });

  it('retries with a core-only get_pdp_v2 request after a timeout and renders the recovered PDP', async () => {
    getPdpV2Mock
      .mockRejectedValueOnce(Object.assign(new Error('The request timed out. Please retry.'), { code: 'UPSTREAM_TIMEOUT' }))
      .mockResolvedValueOnce({ status: 'success', modules: [] });
    resolveProductCandidatesMock.mockResolvedValue({ offers: [] });

    renderPage();

    await screen.findByTestId('generic-pdp');
    expect(getPdpV2Mock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        product_id: 'prod_1',
        include: [
          'offers',
          'variant_selector',
          'product_intel',
          'active_ingredients',
          'ingredients_inci',
          'how_to_use',
          'product_overview',
          'supplemental_details',
          'reviews_preview',
          'similar',
        ],
        timeout_ms: 9000,
      }),
    );
    expect(getPdpV2Mock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        product_id: 'prod_1',
        include: [],
        timeout_ms: 3500,
      }),
    );
    expect(screen.queryByText('Failed to load product')).not.toBeInTheDocument();
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

  it('opens external seed merchant URLs from PDP v2 offer metadata', async () => {
    const merchantUrl = 'https://merchant.example/products/ext-seed-1';
    const openMock = vi.spyOn(window, 'open').mockImplementation(() => null);
    mapPdpV2ToPdpPayloadMock.mockReturnValue({
      ...canonicalPayload,
      product: {
        ...canonicalPayload.product,
        product_id: 'ext_seed_1',
        source: 'external_seed',
        external_redirect_url: merchantUrl,
      },
      offers: [
        {
          ...canonicalPayload.offers[0],
          product_id: 'ext_seed_1',
          purchase_route: 'affiliate_outbound',
          commerce_mode: 'links_out',
          checkout_handoff: 'redirect',
          external_redirect_url: merchantUrl,
          merchant_checkout_url: merchantUrl,
          url: merchantUrl,
          action: {
            type: 'redirect_url',
            url: merchantUrl,
          },
        },
      ],
    });
    getPdpV2Mock.mockResolvedValue({ status: 'success', modules: [] });

    renderPage('ext_seed_1');

    await screen.findByTestId('generic-pdp');
    fireEvent.click(screen.getByRole('button', { name: 'Buy Now' }));

    await waitFor(() => {
      expect(openMock).toHaveBeenCalledWith(merchantUrl, '_blank', 'noopener,noreferrer');
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('keeps internal checkout offers on /order even when canonical product has an external URL', async () => {
    const merchantUrl = 'https://merchant.example/products/ext-seed-1';
    const openMock = vi.spyOn(window, 'open').mockImplementation(() => null);
    mapPdpV2ToPdpPayloadMock.mockReturnValue({
      ...canonicalPayload,
      product: {
        ...canonicalPayload.product,
        product_id: 'ext_seed_1',
        source: 'external_seed',
        external_redirect_url: merchantUrl,
      },
      offers: [
        {
          offer_id: 'offer_internal',
          product_id: 'prod_internal_1',
          merchant_id: 'merch_internal',
          price: { amount: 28, currency: 'USD' },
          purchase_route: 'internal_checkout',
          commerce_mode: 'merchant_embedded_checkout',
          checkout_handoff: 'embedded',
        },
      ],
    });
    getPdpV2Mock.mockResolvedValue({ status: 'success', modules: [] });

    renderPage('ext_seed_1');

    await screen.findByTestId('generic-pdp');
    fireEvent.click(screen.getByRole('button', { name: 'Buy Now' }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(expect.stringMatching(/^\/order\?/));
    });
    expect(openMock).not.toHaveBeenCalled();
    const pushedUrl = String(pushMock.mock.calls[0]?.[0] || '');
    const params = new URLSearchParams(pushedUrl.split('?')[1] || '');
    const items = JSON.parse(params.get('items') || '[]');
    expect(items[0]).toEqual(
      expect.objectContaining({
        product_id: 'prod_internal_1',
        merchant_id: 'merch_internal',
      }),
    );
  });

  it('checks out internal offers with seller-specific selected variants', async () => {
    mapPdpV2ToPdpPayloadMock.mockReturnValue({
      ...canonicalPayload,
      product: {
        ...canonicalPayload.product,
        product_id: 'ext_seed_1',
        merchant_id: 'external_seed',
        default_variant_id: 'ext_standard',
        variants: [
          {
            variant_id: 'ext_standard',
            title: 'Standard',
            options: [{ name: 'Size', value: '45 mL' }],
            price: { current: { amount: 28, currency: 'EUR' } },
            availability: { in_stock: true, available_quantity: 5 },
          },
          {
            variant_id: 'ext_jumbo',
            title: 'Jumbo',
            options: [{ name: 'Size', value: '100 mL' }],
            price: { current: { amount: 50, currency: 'EUR' } },
            availability: { in_stock: true, available_quantity: 5 },
          },
        ],
      },
      offers: [
        {
          offer_id: 'offer_internal',
          product_id: 'prod_internal_1',
          merchant_id: 'merch_internal',
          price: { amount: 28, currency: 'EUR' },
          purchase_route: 'internal_checkout',
          commerce_mode: 'merchant_embedded_checkout',
          checkout_handoff: 'embedded',
          selected_variant_id: '52876964495688',
          selected_options: [{ name: 'Size', value: '45 mL' }],
        },
      ],
    });
    getPdpV2Mock.mockResolvedValue({ status: 'success', modules: [] });

    renderPage('ext_seed_1');

    await screen.findByTestId('generic-pdp');
    fireEvent.click(screen.getByRole('button', { name: 'Buy Now' }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(expect.stringMatching(/^\/order\?/));
    });
    const pushedUrl = String(pushMock.mock.calls[0]?.[0] || '');
    const params = new URLSearchParams(pushedUrl.split('?')[1] || '');
    const items = JSON.parse(params.get('items') || '[]');
    expect(items[0]).toEqual(
      expect.objectContaining({
        product_id: 'prod_internal_1',
        merchant_id: 'merch_internal',
        variant_id: '52876964495688',
        selected_options: { Size: '45 mL' },
      }),
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

  it('keeps reviews and similar on the main PDP request instead of client backfills', async () => {
    getPdpV2Mock.mockResolvedValue({ kind: 'initial' });
    mapPdpV2ToPdpPayloadMock.mockReturnValue(canonicalWithSimilarPayload);

    renderPage();

    await screen.findByTestId('generic-pdp');
    expect(screen.getByTestId('reviews-state')).toHaveTextContent('ready');
    expect(screen.getByTestId('reviews-count')).toHaveTextContent('12');
    expect(screen.getByTestId('recommendations-state')).toHaveTextContent('ready');
    expect(screen.getByTestId('recommendations-count')).toHaveTextContent('2');
    expect(getPdpV2Mock).toHaveBeenCalledTimes(1);
  });

  it('keeps partial offers ready instead of running a slow client offer backfill', async () => {
    const initialPayload = {
      ...canonicalPayload,
      product: {
        ...canonicalPayload.product,
        merchant_id: 'merch_a',
        product_id: 'prod_1',
      },
      offers: [
        {
          offer_id: 'offer_initial',
          merchant_id: 'merch_a',
          product_id: 'prod_1',
          price: { amount: 28, currency: 'USD' },
        },
      ],
      offers_count: 2,
    };
    getPdpV2Mock.mockResolvedValue({ kind: 'initial' });
    mapPdpV2ToPdpPayloadMock.mockReturnValue(initialPayload);

    renderPage();

    await screen.findByTestId('generic-pdp');
    expect(screen.getByTestId('offers-count')).toHaveTextContent('1');
    expect(screen.getByTestId('offers-state')).toHaveTextContent('ready');
    expect(getPdpV2Mock).toHaveBeenCalledTimes(1);
  });

  it('keeps stale empty similar results ready without a cache-bypass retry', async () => {
    getPdpV2Mock.mockResolvedValue({ kind: 'initial' });
    mapPdpV2ToPdpPayloadMock.mockReturnValue(staleEmptySimilarPayload);

    renderPage();

    await screen.findByTestId('generic-pdp');
    await waitFor(() => {
      expect(screen.getByTestId('recommendations-count')).toHaveTextContent('0');
      expect(screen.getByTestId('recommendations-state')).toHaveTextContent('ready');
    });

    expect(getPdpV2Mock).toHaveBeenCalledTimes(1);
  });
});
