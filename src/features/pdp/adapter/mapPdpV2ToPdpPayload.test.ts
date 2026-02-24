import { describe, expect, it } from 'vitest';

import { mapPdpV2ToPdpPayload } from './mapPdpV2ToPdpPayload';

function buildMinimalResponse() {
  return {
    modules: [
      {
        type: 'canonical',
        data: {
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
  it('proxies external image URLs in canonical payload and modules', () => {
    const payload = mapPdpV2ToPdpPayload(buildMinimalResponse());
    expect(payload).not.toBeNull();

    expect(payload?.product.image_url).toBe(
      '/api/image-proxy?url=https%3A%2F%2Fsdcdn.io%2Ftf%2Fproduct-main.png',
    );
    expect(payload?.product.variants?.[0]?.image_url).toBe(
      '/api/image-proxy?url=https%3A%2F%2Fsdcdn.io%2Ftf%2Fvariant-main.png',
    );
    expect(payload?.product.variants?.[0]?.label_image_url).toBe(
      '/api/image-proxy?url=https%3A%2F%2Fsdcdn.io%2Ftf%2Fswatch.png',
    );

    const mediaGallery = payload?.modules.find((m) => m.type === 'media_gallery') as any;
    expect(mediaGallery?.data?.items?.[0]?.url).toBe(
      '/api/image-proxy?url=https%3A%2F%2Fsdcdn.io%2Ftf%2Fhero.png',
    );
    expect(mediaGallery?.data?.items?.[1]?.url).toBe('https://cdn.example.com/video.mp4');

    const recs = payload?.modules.find((m) => m.type === 'recommendations') as any;
    expect(recs?.data?.items?.[0]?.image_url).toBe(
      '/api/image-proxy?url=https%3A%2F%2Fsdcdn.io%2Ftf%2Frelated.png',
    );

    const reviews = payload?.modules.find((m) => m.type === 'reviews_preview') as any;
    expect(reviews?.data?.preview_items?.[0]?.media?.[0]?.url).toBe(
      '/api/image-proxy?url=https%3A%2F%2Fsdcdn.io%2Ftf%2Freview.png',
    );
  });

  it('does not double-wrap already proxied URLs', () => {
    const response = buildMinimalResponse();
    response.modules[0].data.pdp_payload.product.image_url =
      '/api/image-proxy?url=https%3A%2F%2Fsdcdn.io%2Ftf%2Falready.png';
    response.modules[0].data.pdp_payload.modules[0].data.items[0].url =
      '/api/image-proxy?url=https%3A%2F%2Fsdcdn.io%2Ftf%2Falready-media.png';

    const payload = mapPdpV2ToPdpPayload(response);
    expect(payload?.product.image_url).toBe(
      '/api/image-proxy?url=https%3A%2F%2Fsdcdn.io%2Ftf%2Falready.png',
    );
    const mediaGallery = payload?.modules.find((m) => m.type === 'media_gallery') as any;
    expect(mediaGallery?.data?.items?.[0]?.url).toBe(
      '/api/image-proxy?url=https%3A%2F%2Fsdcdn.io%2Ftf%2Falready-media.png',
    );
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

  it('deduplicates known external-seed SKU filename duplicates', () => {
    const response = buildMinimalResponse();
    response.modules[0].data.pdp_payload.modules[0].data.items = [
      {
        type: 'image',
        url: 'https://sdcdn.io/tf/tf_sku_T14Q01_3000x3000_0.png',
      },
      {
        type: 'image',
        url: 'https://sdcdn.io/tf/tf_sku_T14S01_3000x3000_0.png?width=650px&height=750px',
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
        url: 'https://sdcdn.io/tf/tf_sku_T13S01_2000x2000_1.jpg?width=650px&height=750px',
      },
      {
        type: 'image',
        url: 'https://sdcdn.io/tf/tf_sku_T2TL01_2000x2000_1.png?width=650px&height=750px',
      },
    ];

    const payload = mapPdpV2ToPdpPayload(response);
    const mediaGallery = payload?.modules.find((m) => m.type === 'media_gallery') as any;
    const items = Array.isArray(mediaGallery?.data?.items) ? mediaGallery.data.items : [];
    const imageItems = items.filter((item: any) => item?.type === 'image');

    expect(imageItems).toHaveLength(3);
    expect(
      imageItems.map((item: any) => unwrapProxyTarget(String(item?.url || ''))),
    ).toEqual([
      'https://sdcdn.io/tf/tf_sku_T14Q01_3000x3000_0.png',
      'https://sdcdn.io/tf/tf_sku_T14Q01_2000x2000_1.jpg',
      'https://sdcdn.io/tf/tf_sku_T2TL01_2000x2000_1.png?width=650px&height=750px',
    ]);
  });
});
