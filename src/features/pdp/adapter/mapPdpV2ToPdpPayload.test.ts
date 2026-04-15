import { describe, expect, it } from 'vitest';

import { mapPdpV2ToPdpPayload } from './mapPdpV2ToPdpPayload';

function buildMinimalResponse() {
  return {
    modules: [
      {
        type: 'canonical',
        data: {
          sellable_item_group_id: 'sig_krave_45',
          product_line_id: 'pl_krave_gbr',
          review_family_id: 'rf_krave_gbr',
          identity_confidence: 0.94,
          match_basis: ['official_url:https://kravebeauty.com/products/great-barrier-relief'],
          canonical_scope: 'synthetic',
          pdp_payload: {
            product: {
              product_id: 'ext_123',
              merchant_id: 'external_seed',
              title: 'Noir Extreme Eau de Parfum Set',
              image_url: 'https://sdcdn.io/tf/product-main.png',
              variants: [
                {
                  variant_id: 'T14Q01',
                  title: 'Default',
                  image_url: 'https://sdcdn.io/tf/variant-main.png',
                  label_image_url: 'https://sdcdn.io/tf/swatch.png',
                },
              ],
            },
            modules: [
              {
                module_id: 'm_media',
                type: 'media_gallery',
                data: {
                  items: [
                    {
                      type: 'image',
                      url: 'https://sdcdn.io/tf/hero.png',
                    },
                    {
                      type: 'video',
                      url: 'https://cdn.example.com/video.mp4',
                    },
                  ],
                  gallery_scope: 'exact_item',
                  preview_scope: 'product_line',
                  preview_items: [
                    {
                      type: 'image',
                      url: 'https://sdcdn.io/tf/preview.png',
                    },
                  ],
                },
              },
              {
                module_id: 'm_recs',
                type: 'recommendations',
                data: {
                  items: [
                    {
                      product_id: 'ext_456',
                      merchant_id: 'external_seed',
                      title: 'Related perfume',
                      image_url: 'https://sdcdn.io/tf/related.png',
                    },
                  ],
                },
              },
              {
                module_id: 'm_reviews',
                type: 'reviews_preview',
                data: {
                  aggregation_scope: 'product_line',
                  exact_item_review_count: 12,
                  product_line_review_count: 42,
                  scope_label: 'Based on product-line reviews (42)',
                  tabs: [
                    { id: 'product_line', label: 'Product line', count: 42, default: true },
                    { id: 'exact_item', label: 'Exact item', count: 12, default: false },
                  ],
                  scoped_summaries: {
                    exact_item: {
                      scale: 5,
                      rating: 4.5,
                      review_count: 12,
                      preview_items: [
                        {
                          review_id: 'r-exact-1',
                          media: [
                            {
                              type: 'image',
                              url: 'https://sdcdn.io/tf/review-exact.png',
                            },
                          ],
                        },
                      ],
                    },
                  },
                  preview_items: [
                    {
                      review_id: 'r1',
                      media: [
                        {
                          type: 'image',
                          url: 'https://sdcdn.io/tf/review.png',
                        },
                      ],
                    },
                  ],
                },
              },
              {
                module_id: 'm_actives',
                type: 'active_ingredients',
                data: {
                  title: 'Active ingredients',
                  items: ['Niacinamide', 'Ceramide NP'],
                  source_origin: 'retail_pdp',
                  source_quality_status: 'captured',
                },
              },
              {
                module_id: 'm_how_to_use',
                type: 'how_to_use',
                data: {
                  title: 'How to use',
                  raw_text: 'Apply after cleansing.',
                  steps: ['Apply after cleansing.'],
                },
              },
            ],
            actions: [],
          },
        },
      },
    ],
  } as any;
}

function unwrapProxyTarget(url: string): string {
  try {
    const parsed = new URL(url, 'http://localhost');
    if (parsed.pathname !== '/api/image-proxy') return url;
    return parsed.searchParams.get('url') || url;
  } catch {
    return url;
  }
}

describe('mapPdpV2ToPdpPayload image normalization', () => {
  it('normalizes external image URLs in canonical payload and modules', () => {
    const payload = mapPdpV2ToPdpPayload(buildMinimalResponse());
    expect(payload).not.toBeNull();

    expect(payload?.product.image_url).toBe('https://sdcdn.io/tf/product-main.png');
    expect(payload?.product.variants?.[0]?.image_url).toBe('https://sdcdn.io/tf/variant-main.png');
    expect(payload?.product.variants?.[0]?.label_image_url).toBe('https://sdcdn.io/tf/swatch.png');

    const mediaGallery = payload?.modules.find((m) => m.type === 'media_gallery') as any;
    expect(mediaGallery?.data?.items?.[0]?.url).toBe('https://sdcdn.io/tf/hero.png');
    expect(mediaGallery?.data?.items?.[1]?.url).toBe('https://cdn.example.com/video.mp4');
    expect(mediaGallery?.data?.preview_items?.[0]?.url).toBe('https://sdcdn.io/tf/preview.png');

    expect(payload?.modules.find((m) => m.type === 'recommendations')).toBeUndefined();
    expect(payload?.modules.find((m) => m.type === 'reviews_preview')).toBeUndefined();
    expect(payload?.sellable_item_group_id).toBe('sig_krave_45');
    expect(payload?.product_line_id).toBe('pl_krave_gbr');
    expect(payload?.review_family_id).toBe('rf_krave_gbr');
    expect(payload?.canonical_scope).toBe('synthetic');
  });

  it('does not promote stale response-owned modules from canonical payload', () => {
    const payload = mapPdpV2ToPdpPayload(buildMinimalResponse());

    expect(payload?.modules.map((module) => module.type)).not.toContain('recommendations');
    expect(payload?.modules.map((module) => module.type)).not.toContain('reviews_preview');
    expect(payload?.x_recommendations_state).toBeUndefined();
  });

  it('does not double-wrap already proxied URLs', () => {
    const response = buildMinimalResponse();
    response.modules[0].data.pdp_payload.product.image_url =
      '/api/image-proxy?url=https%3A%2F%2Fsdcdn.io%2Ftf%2Falready.png';
    response.modules[0].data.pdp_payload.modules[0].data.items[0].url =
      '/api/image-proxy?url=https%3A%2F%2Fsdcdn.io%2Ftf%2Falready-media.png';

    const payload = mapPdpV2ToPdpPayload(response);
    expect(payload?.product.image_url).toBe('https://sdcdn.io/tf/already.png');
    const mediaGallery = payload?.modules.find((m) => m.type === 'media_gallery') as any;
    expect(mediaGallery?.data?.items?.[0]?.url).toBe('https://sdcdn.io/tf/already-media.png');
  });

  it('preserves additive structured PDP modules from canonical payload', () => {
    const payload = mapPdpV2ToPdpPayload(buildMinimalResponse());
    const activeIngredients = payload?.modules.find((module) => module.type === 'active_ingredients') as any;
    const howToUse = payload?.modules.find((module) => module.type === 'how_to_use') as any;

    expect(activeIngredients?.data?.items).toEqual(['Niacinamide', 'Ceramide NP']);
    expect(activeIngredients?.data?.source_origin).toBe('retail_pdp');
    expect(howToUse?.data?.steps).toEqual(['Apply after cleansing.']);
  });

  it('upserts structured modules when v2 returns them outside canonical payload', () => {
    const response = buildMinimalResponse();
    response.modules.push(
      {
        type: 'ingredients_inci',
        data: {
          title: 'Ingredients',
          items: ['Water', 'Glycerin', 'Niacinamide'],
        },
      },
      {
        type: 'product_facts',
        data: {
          sections: [
            {
              heading: 'Clinical Results',
              content_type: 'text',
              content: 'Supports the skin barrier in 7 days.',
            },
          ],
        },
      },
    );

    const payload = mapPdpV2ToPdpPayload(response);
    const ingredients = payload?.modules.find((module) => module.type === 'ingredients_inci') as any;
    const facts = payload?.modules.find((module) => module.type === 'product_facts') as any;

    expect(ingredients?.data?.items).toEqual(['Water', 'Glycerin', 'Niacinamide']);
    expect(facts?.data?.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          heading: 'Clinical Results',
          content: 'Supports the skin barrier in 7 days.',
        }),
      ]),
    );
  });

  it('bridges top-level product_intel into payload modules', () => {
    const response = buildMinimalResponse();
    response.modules.push({
      type: 'product_intel',
      data: {
        display_name: 'Pivota Insights',
        evidence_profile: 'seller_only',
        product_intel_core: {
          evidence_profile: 'seller_only',
          quality_state: 'limited',
          what_it_is: {
            body: 'A lightweight serum focused on daily brightening support.',
          },
          best_for: [{ label: 'Dullness' }],
        },
      },
    });

    const payload = mapPdpV2ToPdpPayload(response);
    const intelModule = payload?.modules.find((m) => m.type === 'product_intel') as any;

    expect(intelModule).toBeTruthy();
    expect(intelModule?.title).toBe('Pivota Insights');
    expect(intelModule?.data?.product_intel_core?.best_for?.[0]?.label).toBe('Dullness');
  });

  it('normalizes seller display names from real store fields returned by PDP v2', () => {
    const response = buildMinimalResponse();
    response.modules.push({
      type: 'offers',
      data: {
        offers: [
          {
            offer_id: 'of:internal_checkout:merch_efbc46b4619cfbdf:10008793153864',
            product_id: '10008793153864',
            merchant_id: 'merch_efbc46b4619cfbdf',
            store_name: 'Pivota Market',
            seller_of_record: 'merchant',
            vendor: 'KraveBeauty',
            price: { amount: 28, currency: 'EUR' },
          },
          {
            offer_id: 'of:internal_checkout:merch_missing:missing',
            product_id: 'missing',
            merchant_id: 'merch_missing',
            seller_of_record: 'merchant',
            vendor: 'KraveBeauty',
            price: { amount: 28, currency: 'EUR' },
          },
        ],
      },
    });

    const payload = mapPdpV2ToPdpPayload(response);

    expect(payload?.offers?.[0]?.merchant_name).toBe('Pivota Market');
    expect(payload?.offers?.[1]?.merchant_name).toBeUndefined();
  });

  it('normalizes image-bearing modules returned outside canonical payload', () => {
    const response = buildMinimalResponse();
    response.modules.push(
      {
        type: 'media_gallery',
        data: {
          items: [
            {
              type: 'image',
              url: 'https://cdn.shopify.com/s/files/1/0761/9690/5173/files/tf_sku_T1QT01_2000x2000_1_83740e89-85dd-4360-acb4-699df069e0f3.jpg?v=1774376799',
            },
          ],
        },
      },
      {
        type: 'reviews_preview',
        data: {
          preview_items: [
            {
              review_id: 'r-ext',
              media: [
                {
                  type: 'image',
                  url: 'https://cdn.shopify.com/s/files/1/0761/9690/5173/files/tf_sku_T1QT01_2000x2000_1_83740e89-85dd-4360-acb4-699df069e0f3.jpg?v=1774376799',
                },
              ],
            },
          ],
        },
      },
      {
        type: 'similar',
        data: {
          strategy: 'related_products',
          items: [
            {
              product_id: 'ext_999',
              merchant_id: 'external_seed',
              title: 'Related quad',
              image_url:
                'https://cdn.shopify.com/s/files/1/0761/9690/5173/files/tf_sku_T1QS01_2000x2000_1.jpg?v=1774376799',
            },
          ],
        },
      },
    );

    const payload = mapPdpV2ToPdpPayload(response);
    const mediaGallery = payload?.modules.find((module) => module.type === 'media_gallery') as any;
    const reviews = payload?.modules.find((module) => module.type === 'reviews_preview') as any;
    const recommendations = payload?.modules.find((module) => module.type === 'recommendations') as any;

    expect(unwrapProxyTarget(String(mediaGallery?.data?.items?.[0]?.url || ''))).toBe(
      'https://cdn.shopify.com/s/files/1/0761/9690/5173/files/tf_sku_T1QT01_2000x2000_1_83740e89-85dd-4360-acb4-699df069e0f3.jpg',
    );
    expect(
      unwrapProxyTarget(String(reviews?.data?.preview_items?.[0]?.media?.[0]?.url || '')),
    ).toBe(
      'https://cdn.shopify.com/s/files/1/0761/9690/5173/files/tf_sku_T1QT01_2000x2000_1_83740e89-85dd-4360-acb4-699df069e0f3.jpg',
    );
    expect(
      unwrapProxyTarget(String(recommendations?.data?.items?.[0]?.image_url || '')),
    ).toBe('https://cdn.shopify.com/s/files/1/0761/9690/5173/files/tf_sku_T1QS01_2000x2000_1.jpg');
  });

  it('deduplicates official media image URLs while keeping videos', () => {
    const response = buildMinimalResponse();
    response.modules[0].data.pdp_payload.modules[0].data.items = [
      {
        type: 'image',
        url: 'https://sdcdn.io/tf/hero.png?width=1200&height=1200',
      },
      {
        type: 'image',
        url: 'https://sdcdn.io/tf/hero.png?w=640&h=640',
      },
      {
        type: 'image',
        url: '/api/image-proxy?url=https%3A%2F%2Fsdcdn.io%2Ftf%2Fhero.png%3Fquality%3D80',
      },
      {
        type: 'image',
        url: 'https://sdcdn.io/tf/detail.png?width=640',
      },
      {
        type: 'video',
        url: 'https://cdn.example.com/video.mp4',
      },
      {
        type: 'video',
        url: 'https://cdn.example.com/video.mp4',
      },
    ];

    const payload = mapPdpV2ToPdpPayload(response);
    const mediaGallery = payload?.modules.find((m) => m.type === 'media_gallery') as any;
    const items = Array.isArray(mediaGallery?.data?.items) ? mediaGallery.data.items : [];
    const imageItems = items.filter((item: any) => item?.type === 'image');
    const videoItems = items.filter((item: any) => item?.type === 'video');

    expect(imageItems).toHaveLength(2);
    expect(
      imageItems.map((item: any) => unwrapProxyTarget(String(item?.url || ''))),
    ).toEqual([
      'https://sdcdn.io/tf/hero.png?width=1200&height=1200',
      'https://sdcdn.io/tf/detail.png?width=640',
    ]);
    expect(videoItems).toHaveLength(2);
    expect(videoItems.map((item: any) => item.url)).toEqual([
      'https://cdn.example.com/video.mp4',
      'https://cdn.example.com/video.mp4',
    ]);
  });

  it('deduplicates known external-seed SKU slot duplicates across sku codes and extensions', () => {
    const response = buildMinimalResponse();
    response.modules[0].data.pdp_payload.modules[0].data.items = [
      {
        type: 'image',
        url: 'https://sdcdn.io/tf/tf_sku_T14Q01_3000x3000_0.png',
      },
      {
        type: 'image',
        url: 'https://sdcdn.io/tf/tf_sku_T14S01_3000x3000_0.jpg?width=650px&height=750px',
      },
      {
        type: 'image',
        url: 'https://sdcdn.io/tf/tf_sku_T16S01_3000x3000_0.png?width=650px&height=750px',
      },
      {
        type: 'image',
        url: 'https://sdcdn.io/tf/tf_sku_T14Q01_2000x2000_1.jpg',
      },
      {
        type: 'image',
        url: 'https://sdcdn.io/tf/tf_sku_T13S01_2000x2000_1.png?width=650px&height=750px',
      },
      {
        type: 'image',
        url: 'https://sdcdn.io/tf/tf_sku_T2TL01_2000x2000_0.png?width=650px&height=750px',
      },
      {
        type: 'image',
        url: 'https://sdcdn.io/tf/tf_sku_T4DB01_US_3000x3000_0.png?width=650px&height=750px',
      },
      {
        type: 'image',
        url: 'https://sdcdn.io/tf/tf_sku_T14Z01_2000x2000_2.jpg?width=650px&height=750px',
      },
    ];

    const payload = mapPdpV2ToPdpPayload(response);
    const mediaGallery = payload?.modules.find((m) => m.type === 'media_gallery') as any;
    const items = Array.isArray(mediaGallery?.data?.items) ? mediaGallery.data.items : [];
    const imageItems = items.filter((item: any) => item?.type === 'image');

    expect(imageItems).toHaveLength(4);
    expect(
      imageItems.map((item: any) => unwrapProxyTarget(String(item?.url || ''))),
    ).toEqual([
      'https://sdcdn.io/tf/tf_sku_T14Q01_3000x3000_0.png',
      'https://sdcdn.io/tf/tf_sku_T14Q01_2000x2000_1.jpg',
      'https://sdcdn.io/tf/tf_sku_T2TL01_2000x2000_0.png',
      'https://sdcdn.io/tf/tf_sku_T14Z01_2000x2000_2.jpg',
    ]);
  });

  it('upserts structured canonical PDP modules from the v2 response', () => {
    const response = buildMinimalResponse();
    response.modules.push(
      {
        type: 'active_ingredients',
        data: {
          title: 'Active Ingredients',
          items: ['Niacinamide', 'Panthenol'],
        },
      },
      {
        type: 'ingredients_inci',
        data: {
          title: 'Ingredients (INCI)',
          items: ['Water', 'Niacinamide'],
        },
      },
      {
        type: 'how_to_use',
        data: {
          title: 'How to Use',
          steps: ['Apply after cleansing', 'Follow with moisturizer'],
        },
      },
      {
        type: 'product_overview',
        data: {
          sections: [{ heading: 'Details', content_type: 'text', content: 'Barrier-support serum.' }],
        },
      },
    );

    const payload = mapPdpV2ToPdpPayload(response);

    expect(payload?.modules.find((module) => module.type === 'active_ingredients')).toEqual(
      expect.objectContaining({
        title: 'Active Ingredients',
        data: expect.objectContaining({
          items: ['Niacinamide', 'Panthenol'],
        }),
      }),
    );
    expect(payload?.modules.find((module) => module.type === 'ingredients_inci')).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          items: ['Water', 'Niacinamide'],
        }),
      }),
    );
    expect(payload?.modules.find((module) => module.type === 'how_to_use')).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          steps: ['Apply after cleansing', 'Follow with moisturizer'],
        }),
      }),
    );
  });

  it('carries PDP schema profile and generic structured modules', () => {
    const response = buildMinimalResponse();
    const canonical = response.modules.find((module) => module.type === 'canonical') as any;
    canonical.data.pdp_schema_profile = 'generic_merch';
    canonical.data.pdp_payload.pdp_schema_profile = 'generic_merch';
    canonical.data.pdp_payload.modules.push(
      {
        module_id: 'm_materials',
        type: 'materials',
        data: {
          title: 'Materials',
          sections: [
            { heading: 'Materials', content_type: 'text', content: 'Quilted nylon.' },
          ],
        },
      },
      {
        module_id: 'm_care',
        type: 'care_instructions',
        data: {
          title: 'Care',
          sections: [
            { heading: 'Care', content_type: 'text', content: 'Spot clean only.' },
          ],
        },
      },
    );

    const payload = mapPdpV2ToPdpPayload(response);

    expect(payload?.pdp_schema_profile).toBe('generic_merch');
    expect(payload?.product.pdp_schema_profile).toBe('generic_merch');
    expect(payload?.modules.find((module) => module.type === 'materials')).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          sections: [expect.objectContaining({ content: 'Quilted nylon.' })],
        }),
      }),
    );
    expect(payload?.modules.find((module) => module.type === 'care_instructions')).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          sections: [expect.objectContaining({ content: 'Spot clean only.' })],
        }),
      }),
    );
  });
});
