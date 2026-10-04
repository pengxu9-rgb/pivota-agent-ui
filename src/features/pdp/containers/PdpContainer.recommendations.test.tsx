/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdpContainer } from './PdpContainer';
import type { PDPPayload } from '@/features/pdp/types';

const routerPushMock = vi.fn();
const getSimilarProductsMainlineMock = vi.fn();
const getPdpV2Mock = vi.fn();
const toastMessageMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const windowOpenMock = vi.fn();

class IntersectionObserverMock {
  static instances: IntersectionObserverMock[] = [];

  callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    IntersectionObserverMock.instances.push(this);
  }

  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();

  trigger(isIntersecting = true) {
    this.callback(
      [
        {
          isIntersecting,
          target: document.createElement('div'),
          boundingClientRect: {} as DOMRectReadOnly,
          intersectionRatio: isIntersecting ? 1 : 0,
          intersectionRect: {} as DOMRectReadOnly,
          rootBounds: null,
          time: Date.now(),
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    );
  }
}

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
    push: routerPushMock,
  }),
}));

vi.mock('@/lib/api', () => ({
  listQuestions: vi.fn(async () => ({ items: [] })),
  postQuestion: vi.fn(async () => ({ question_id: 1 })),
  getSimilarProductsMainline: (...args: unknown[]) => getSimilarProductsMainlineMock(...args),
  getPdpV2: (...args: unknown[]) => getPdpV2Mock(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    message: (...args: unknown[]) => toastMessageMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

function buildSimilar(count: number, merchantId = 'external_seed') {
  return Array.from({ length: count }).map((_, index) => ({
    product_id: `prod_${index + 1}`,
    merchant_id: merchantId,
    title: `Product ${index + 1}`,
    image_url: `https://example.com/p_${index + 1}.jpg`,
    price: { amount: 99 + index, currency: 'USD' },
  }));
}

function buildPayload(args?: {
  items?: ReturnType<typeof buildSimilar>;
  metadata?: Record<string, unknown>;
}): PDPPayload {
  return {
    schema_version: '1.0.0',
    page_type: 'product_detail',
    tracking: {
      page_request_id: 'pr_test_reco',
      entry_point: 'agent',
    },
    product: {
      product_id: 'P_SIMILAR_001',
      merchant_id: 'external_seed',
      title: 'Similar Test Product',
      default_variant_id: 'V001',
      variants: [
        {
          variant_id: 'V001',
          title: 'Default',
          price: { current: { amount: 12.35, currency: 'USD' } },
          availability: { in_stock: true, available_quantity: 12 },
        },
      ],
      price: { current: { amount: 12.35, currency: 'USD' } },
      availability: { in_stock: true, available_quantity: 12 },
    },
    modules: [
      {
        module_id: 'm_media',
        type: 'media_gallery',
        priority: 100,
        data: { items: [{ type: 'image', url: 'https://example.com/hero.jpg' }] },
      },
      {
        module_id: 'm_price',
        type: 'price_promo',
        priority: 90,
        data: { price: { amount: 12.35, currency: 'USD' }, promotions: [] },
      },
      {
        module_id: 'm_product_overview',
        type: 'product_overview',
        priority: 70,
        data: { sections: [] },
      },
      {
        module_id: 'm_recs',
        type: 'recommendations',
        priority: 20,
        data: {
          strategy: 'related_products',
          items: args?.items || buildSimilar(6),
          ...(args?.metadata ? { metadata: args.metadata } : {}),
        },
      },
    ],
    actions: [
      { action_type: 'add_to_cart', label: 'Add to Cart', priority: 20, target: {} },
      { action_type: 'buy_now', label: 'Buy Now', priority: 10, target: {} },
    ],
  };
}

function buildQuickActionPdpV2Response(args?: {
  product_id?: string;
  merchant_id?: string;
  merchant_name?: string;
  title?: string;
  description?: string;
  image_url?: string;
  source?: string;
  destination_url?: string;
  variants?: any[];
  offers?: any[];
  default_variant_id?: string;
}) {
  const productId = args?.product_id || 'prod_1';
  const merchantId = args?.merchant_id || 'external_seed';
  const variants =
    args?.variants || [
      {
        variant_id: 'default',
        title: 'Default',
        price: { current: { amount: 99, currency: 'USD' } },
        availability: { in_stock: true, available_quantity: 3 },
      },
    ];
  const firstVariant = variants[0];
  const defaultVariantId = args?.default_variant_id || firstVariant?.variant_id || 'default';
  const price = firstVariant?.price?.current || { amount: 99, currency: 'USD' };
  const offers = args?.offers || [];

  return {
    subject: {
      type: 'product',
      id: productId,
    },
    modules: [
      {
        type: 'canonical',
        data: {
          pdp_payload: {
            schema_version: '1.0.0',
            page_type: 'product_detail',
            tracking: {
              page_request_id: 'pdp_quick_action',
              entry_point: 'agent',
            },
            product: {
              product_id: productId,
              merchant_id: merchantId,
              title: args?.title || 'Product 1',
              description: args?.description || 'Quick action product',
              image_url: args?.image_url || 'https://example.com/product.jpg',
              ...(args?.source ? { source: args.source } : {}),
              ...(args?.destination_url ? { destination_url: args.destination_url } : {}),
              default_variant_id: defaultVariantId,
              variants,
              price: { current: price },
              availability: { in_stock: true, available_quantity: 9 },
            },
            modules: [],
            actions: [],
          },
        },
      },
      {
        type: 'offers',
        data: {
          offers,
          offers_count: offers.length,
          ...(offers[0]?.offer_id ? { default_offer_id: offers[0].offer_id } : {}),
        },
      },
    ],
  };
}

beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock as unknown as typeof IntersectionObserver);
  vi.spyOn(window, 'open').mockImplementation(windowOpenMock as any);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('PdpContainer recommendations interactions', () => {
  beforeEach(() => {
    routerPushMock.mockReset();
    getSimilarProductsMainlineMock.mockReset();
    getPdpV2Mock.mockReset();
    toastMessageMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    windowOpenMock.mockReset();
    IntersectionObserverMock.instances = [];
  });

  afterEach(() => {
    cleanup();
  });

  it('renders first-fold similar cards with compact CTAs and no legacy browse controls', async () => {
    render(
      <PdpContainer
        payload={buildPayload()}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Product 6')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /view all similar/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /load more similar products/i })).toBeNull();
    expect(screen.getByRole('button', { name: /open product 1/i })).toBeInTheDocument();
    expect(getPdpV2Mock).not.toHaveBeenCalled();
  });

  it('shows neutral deferred recommendation copy instead of internal mainline diagnostics', async () => {
    render(
      <PdpContainer
        payload={{
          ...buildPayload({
            items: [],
            metadata: {
              similar_status: 'deferred',
              reason_code: 'SIMILAR_STAGE_BUDGET_EXCEEDED',
              sync_budget_ms: 1800,
            },
          }),
          x_recommendations_state: 'ready',
        }}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    expect(screen.getByText('Recommendations are updating')).toBeInTheDocument();
    expect(
      screen.getByText('Related products are still being prepared for this item.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/mainline/i)).toBeNull();
    expect(screen.queryByText(/fallback/i)).toBeNull();
    expect(screen.queryByText('No similar products yet.')).toBeNull();
  });

  it('auto-loads more similar products when the sentinel intersects', async () => {
    getSimilarProductsMainlineMock.mockResolvedValue({
      strategy: 'related_products',
      items: buildSimilar(6).map((item, index) => ({
        ...item,
        product_id: `prod_${index + 7}`,
        title: `Product ${index + 7}`,
      })),
      metadata: { has_more: false },
      page_info: {
        page: 1,
        page_size: 6,
        total: 6,
        has_more: false,
      },
    });

    render(
      <PdpContainer
        payload={buildPayload({ metadata: { has_more: true } })}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    await waitFor(() => {
      expect(IntersectionObserverMock.instances.length).toBeGreaterThan(0);
    });

    await act(async () => {
      IntersectionObserverMock.instances[0]?.trigger(true);
    });

    await waitFor(() => {
      expect(screen.getByText('Product 12')).toBeInTheDocument();
    });

    expect(getSimilarProductsMainlineMock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: 'P_SIMILAR_001',
        merchant_id: 'external_seed',
        limit: 6,
        exclude_items: expect.arrayContaining([
          expect.objectContaining({ product_id: 'prod_1', merchant_id: 'external_seed' }),
          expect.objectContaining({ product_id: 'prod_6', merchant_id: 'external_seed' }),
        ]),
      }),
    );
  });

  it('shows inline retry when auto-load fails and succeeds on retry', async () => {
    getSimilarProductsMainlineMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({
        strategy: 'related_products',
        items: buildSimilar(6).map((item, index) => ({
          ...item,
          product_id: `prod_${index + 7}`,
          title: `Product ${index + 7}`,
        })),
        metadata: { has_more: false },
        page_info: {
          page: 1,
          page_size: 6,
          total: 6,
          has_more: false,
        },
      });

    render(
      <PdpContainer
        payload={buildPayload({ metadata: { has_more: true } })}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    await act(async () => {
      IntersectionObserverMock.instances[0]?.trigger(true);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText('Product 12')).toBeInTheDocument();
    });
  });

  it('opens a quick-buy sheet for multi-variant internal products and routes to checkout after selection', async () => {
    getPdpV2Mock.mockResolvedValue(
      buildQuickActionPdpV2Response({
        product_id: 'prod_1',
        merchant_id: 'merch_internal',
        merchant_name: 'Internal Shop',
        title: 'Product 1',
        description: 'Internal product',
        image_url: 'https://example.com/internal.jpg',
        default_variant_id: 'var_s',
        variants: [
          {
            variant_id: 'var_s',
            title: 'Small',
            price: { current: { amount: 39, currency: 'USD' } },
            availability: { in_stock: true, available_quantity: 4 },
          },
          {
            variant_id: 'var_l',
            title: 'Large',
            price: { current: { amount: 49, currency: 'USD' } },
            availability: { in_stock: true, available_quantity: 6 },
          },
        ],
        offers: [
          {
            offer_id: 'offer_internal',
            merchant_id: 'merch_internal',
            merchant_name: 'Internal Shop',
            product_id: 'prod_1',
            price: { amount: 39, currency: 'USD' },
            checkout_url: 'https://checkout.example.com',
          },
        ],
      }),
    );

    render(
      <PdpContainer
        payload={buildPayload({ items: buildSimilar(1, 'merch_internal') })}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /buy product 1/i }));

    await waitFor(() => {
      expect(screen.getByText('Select option')).toBeInTheDocument();
      expect(screen.getByText('Recommended seller:')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /large/i }));
    fireEvent.click(screen.getByRole('button', { name: /^buy$/i }));

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith(expect.stringMatching(/^\/order\?/));
    });
    expect(getPdpV2Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: 'prod_1',
        merchant_id: 'merch_internal',
        include: ['offers', 'variant_selector'],
      }),
    );
  });

  it('opens the external merchant site for single-variant external products', async () => {
    getPdpV2Mock.mockResolvedValue(
      buildQuickActionPdpV2Response({
        product_id: 'prod_1',
        merchant_id: 'external_seed',
        title: 'Product 1',
        description: 'External product',
        image_url: 'https://example.com/external.jpg',
        source: 'external_seed',
        destination_url: 'https://merchant.example.com/products/prod_1',
        variants: [
          {
            variant_id: 'default',
            title: 'Default',
            price: { current: { amount: 99, currency: 'USD' } },
            availability: { in_stock: true, available_quantity: 3 },
          },
        ],
      }),
    );

    render(
      <PdpContainer
        payload={buildPayload()}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /open product 1/i }));

    await waitFor(() => {
      expect(windowOpenMock).toHaveBeenCalledWith(
        'https://merchant.example.com/products/prod_1',
        '_blank',
        'noopener,noreferrer',
      );
    });
    expect(getPdpV2Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: 'prod_1',
        merchant_id: 'external_seed',
        include: ['offers', 'variant_selector'],
      }),
    );
  });

  it('enriches placeholder external-seed variants from exact pdp v2 before opening the quick-action sheet', async () => {
    getPdpV2Mock.mockResolvedValue({
      subject: {
        type: 'product',
        id: 'prod_1',
      },
      modules: [
        {
          type: 'canonical',
          data: {
            pdp_payload: {
              schema_version: '1.0.0',
              page_type: 'product_detail',
              tracking: {
                page_request_id: 'pdp_quick_action',
                entry_point: 'agent',
              },
              product: {
                product_id: 'prod_1',
                merchant_id: 'external_seed',
                title: 'Oil La La',
                image_url: 'https://example.com/oil-la-la.jpg',
                destination_url: 'https://merchant.example.com/products/oil-la-la',
                default_variant_id: 'variant_1',
                variants: [
                  {
                    variant_id: 'variant_1',
                    title: '1 Pack - 45 mL',
                    options: [{ name: 'Pack size', value: '1 Pack - 45 mL' }],
                    price: { current: { amount: 28, currency: 'USD' } },
                    availability: { in_stock: true, available_quantity: 9 },
                  },
                  {
                    variant_id: 'variant_2',
                    title: '2 Pack - 2x45 mL',
                    options: [{ name: 'Pack size', value: '2 Pack - 2x45 mL' }],
                    price: { current: { amount: 52, currency: 'USD' } },
                    availability: { in_stock: true, available_quantity: 4 },
                  },
                ],
                price: { current: { amount: 28, currency: 'USD' } },
                availability: { in_stock: true, available_quantity: 9 },
                source: 'external_seed',
              },
              modules: [],
              actions: [],
            },
            product_group_id: 'pg_oil_lala',
          },
        },
        {
          type: 'offers',
          data: {
            offers: [
              {
                offer_id: 'offer_external',
                merchant_id: 'external_seed',
                merchant_name: 'KraveBeauty',
                product_id: 'prod_1',
                price: { amount: 28, currency: 'USD' },
                external_redirect_url: 'https://merchant.example.com/products/oil-la-la',
                variants: [
                  {
                    variant_id: 'variant_1',
                    title: '1 Pack - 45 mL',
                    options: [{ name: 'Pack size', value: '1 Pack - 45 mL' }],
                  },
                  {
                    variant_id: 'variant_2',
                    title: '2 Pack - 2x45 mL',
                    options: [{ name: 'Pack size', value: '2 Pack - 2x45 mL' }],
                  },
                ],
              },
            ],
            offers_count: 1,
            default_offer_id: 'offer_external',
          },
        },
      ],
    });

    render(
      <PdpContainer
        payload={buildPayload({ items: buildSimilar(1, 'external_seed') })}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /open product 1/i }));

    await waitFor(() => {
      expect(screen.getByText('1 Pack - 45 mL')).toBeInTheDocument();
      expect(screen.getByText('2 Pack - 2x45 mL')).toBeInTheDocument();
    });

    expect(screen.queryByText('Option 1')).toBeNull();
    expect(screen.queryByText('Option 2')).toBeNull();
    expect(getPdpV2Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: 'prod_1',
        merchant_id: 'external_seed',
        include: ['offers', 'variant_selector'],
      }),
    );
  });

  it('falls back to the full PDP when quick-action PDP v2 lookup fails', async () => {
    getPdpV2Mock.mockRejectedValue(new Error('boom'));

    render(
      <PdpContainer
        payload={buildPayload()}
        mode="generic"
        onAddToCart={() => {}}
        onBuyNow={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /open product 1/i }));

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith(expect.stringContaining('/products/prod_1'));
    });
    expect(getPdpV2Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: 'prod_1',
        merchant_id: 'external_seed',
        include: ['offers', 'variant_selector'],
      }),
    );
  });
  // Independent reviewer cases, reproduced against this revision.
  it('adversarial: similar external selection must warn before losing variant', async () => {
    const confirmSpy=vi.spyOn(window,'confirm').mockReturnValue(false);
    getPdpV2Mock.mockResolvedValue(buildQuickActionPdpV2Response({
      product_id:'prod_1',merchant_id:'external_seed',title:'Product 1',source:'external_seed',
      destination_url:'https://moogoousa.com/products/full-cream-moisturizer',
      variants:[
        {variant_id:'45890202206515',title:'120 g',options:[{name:'Size',value:'120 g'}],price:{current:{amount:11.9,currency:'USD'}},availability:{in_stock:true}},
        {variant_id:'45890202272051',title:'500 g',options:[{name:'Size',value:'500 g'}],price:{current:{amount:28.9,currency:'USD'}},availability:{in_stock:true}}
      ]
    }));
    render(<PdpContainer payload={buildPayload({items:buildSimilar(1,'external_seed')})} mode="generic" onAddToCart={()=>{}} onBuyNow={()=>{}}/>);
    fireEvent.click(screen.getByRole('button',{name:/open product 1/i}));
    await waitFor(()=>expect(screen.getByRole('button',{name:/500 g/i})).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button',{name:/500 g/i}));
    fireEvent.click(screen.getByRole('button',{name:/^open$/i}));
    await waitFor(()=>expect(windowOpenMock.mock.calls.length+confirmSpy.mock.calls.length).toBeGreaterThan(0));
    console.log('ACTUAL_SIMILAR_HANDOFF',JSON.stringify({confirm:confirmSpy.mock.calls,open:windowOpenMock.mock.calls}));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('500 g'));
    expect(windowOpenMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: /^open$/i })).not.toBeDisabled());
    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /^open$/i }));
    await waitFor(() => expect(windowOpenMock).toHaveBeenCalledWith('https://moogoousa.com/products/full-cream-moisturizer', '_blank', 'noopener,noreferrer'));
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(confirmSpy).toHaveBeenLastCalledWith(expect.stringContaining('USD 28.90'));
    confirmSpy.mockRestore();
  });

  it('adversarial: unknown exact review scope stays unknown', () => {
    const payload=buildPayload();payload.x_reviews_state='ready';
    payload.modules.push({module_id:'reviews',type:'reviews_preview',priority:50,data:{
      scale:5,rating:4.7,review_count:20,availability_state:'ready',aggregation_scope:'exact_item',exact_item_review_count:0,product_line_review_count:20,
      tabs:[{id:'product_line',label:'Product line',count:20},{id:'exact_item',label:'Exact item',count:0,default:true}],
      scoped_summaries:{exact_item:{scale:5,review_count:0,rating:0,availability_state:'unavailable',preview_items:[]},product_line:{scale:5,review_count:20,rating:4.7,availability_state:'ready',preview_items:[]}}
    }} as any);
    render(<PdpContainer payload={payload} mode="generic" onAddToCart={()=>{}} onBuyNow={()=>{}}/>);
    console.log('ACTUAL_UNKNOWN_REVIEW',JSON.stringify({zero:!!screen.queryByText('Reviews (0)'),empty:!!screen.queryByText(/No reviews yet. Be the first to share your thoughts/i),canSelectFamily:!!screen.queryByRole('button',{name:/Product line/i})}));
    expect(screen.getByText(/Review information is unavailable/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Product line/ }));
    expect(screen.queryByText(/Review information is unavailable/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Product line/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Exact item/ }));
    expect(screen.getByText(/Review information is unavailable/)).toBeInTheDocument();
  });
  it('adversarial: exact media cross-pair rejected in rendered customer section', () => {
    const payload=buildPayload();payload.x_reviews_state='ready';
    payload.content_base_ref={product_id:'foreignProduct',merchant_id:'foreignMerchant'};
    payload.modules.push({module_id:'reviews',type:'reviews_preview',priority:50,data:{scale:5,rating:5,review_count:1,availability_state:'ready',preview_items:[{review_id:'r',rating:5,text_snippet:'Hi',media:[{type:'image',url:'https://example.com/wrong-pair.jpg',role:'customer_review',provenance:{source_type:'customer_review',verification_status:'review_linked',moderation_status:'active',scope:'exact_item',review_id:'r',merchant_id:payload.product.merchant_id,product_id:'foreignProduct'}}]}]}} as any);
    render(<PdpContainer payload={payload} mode="beauty" onAddToCart={()=>{}} onBuyNow={()=>{}}/>);
    console.log('ACTUAL_CROSS_PAIR',screen.queryAllByRole('button',{name:/Customer review photo/}).map(el=>el.getAttribute('aria-label')));
    expect(screen.queryByRole('button',{name:/Customer review photo/})).not.toBeInTheDocument();
  });
});
