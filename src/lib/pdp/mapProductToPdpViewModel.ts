import type { ProductResponse } from '@/lib/api';
import type {
  DetailSection,
  MediaGalleryData,
  PDPPayload,
  PricePromoData,
  ProductDetailsData,
  RecommendationsData,
  Variant,
} from '@/lib/pdp/types';

function createPageRequestId() {
  try {
    // eslint-disable-next-line no-restricted-globals
    const c = crypto as Crypto | undefined;
    if (c?.randomUUID) return `pr_${c.randomUUID()}`;
  } catch {
    // ignore
  }
  return `pr_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function stripHtml(input: string): string {
  return (input || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferCategoryPath(product: ProductResponse): string[] {
  const category = String(product.category || '').trim();
  if (!category) return [];
  return category.split('/').map((s) => s.trim()).filter(Boolean);
}

function toVariant(product: ProductResponse): Variant {
  const currency = product.currency || 'USD';
  return {
    variant_id: product.product_id,
    sku_id: product.product_id,
    title: 'Default',
    options: [],
    price: { current: { amount: Number(product.price) || 0, currency } },
    availability: { in_stock: !!product.in_stock },
    image_url: product.image_url,
  };
}

function buildDetailSections(product: ProductResponse): DetailSection[] {
  const desc = stripHtml(product.description || '');
  const sections: DetailSection[] = [];

  if (desc) {
    sections.push({
      heading: 'Description',
      content_type: 'text',
      content: desc,
      collapsed_by_default: false,
    });
  }

  if (product.category) {
    sections.push({
      heading: 'Category',
      content_type: 'text',
      content: String(product.category),
      collapsed_by_default: true,
    });
  }

  return sections.length
    ? sections
    : [
        {
          heading: 'Details',
          content_type: 'text',
          content: 'No details available.',
          collapsed_by_default: false,
        },
      ];
}

export function mapProductToPdpViewModel(args: {
  product: ProductResponse;
  relatedProducts?: ProductResponse[];
  entryPoint?: string;
  experiment?: string;
}): PDPPayload {
  const { product, relatedProducts = [], entryPoint = 'products_list', experiment } = args;

  const currency = product.currency || 'USD';
  const defaultVariant = toVariant(product);

  const media: MediaGalleryData = {
    items: product.image_url
      ? [
          {
            type: 'image',
            url: product.image_url,
            source: 'product',
            alt_text: product.title,
          },
        ]
      : [],
  };

  const pricePromo: PricePromoData = {
    price: { amount: Number(product.price) || 0, currency },
  };

  const details: ProductDetailsData = {
    sections: buildDetailSections(product),
  };

  const recommendations: RecommendationsData = {
    strategy: 'related_products',
    items: relatedProducts.map((p) => ({
      product_id: p.product_id,
      merchant_id: p.merchant_id,
      title: p.title,
      image_url: p.image_url,
      price: { amount: Number(p.price) || 0, currency: p.currency || currency },
    })),
  };

  return {
    schema_version: '1.0.0',
    page_type: 'product_detail',
    tracking: {
      page_request_id: createPageRequestId(),
      entry_point: entryPoint,
      ...(experiment ? { experiment } : {}),
    },
    product: {
      product_id: product.product_id,
      merchant_id: product.merchant_id,
      title: product.title,
      subtitle: '',
      brand: undefined,
      category_path: inferCategoryPath(product),
      default_variant_id: defaultVariant.variant_id,
      variants: [defaultVariant],
      price: defaultVariant.price,
      availability: { in_stock: !!product.in_stock },
      description: product.description || '',
    },
    modules: [
      {
        module_id: 'm_media',
        type: 'media_gallery',
        priority: 100,
        data: media,
      },
      {
        module_id: 'm_variant',
        type: 'variant_selector',
        priority: 95,
        data: { selected_variant_id: defaultVariant.variant_id },
      },
      {
        module_id: 'm_price',
        type: 'price_promo',
        priority: 90,
        data: pricePromo,
      },
      {
        module_id: 'm_details',
        type: 'product_details',
        priority: 70,
        data: details,
      },
      ...(recommendations.items.length
        ? [
            {
              module_id: 'm_recs',
              type: 'recommendations' as const,
              priority: 20,
              data: recommendations,
            },
          ]
        : []),
    ],
    actions: [
      { action_type: 'add_to_cart', label: 'Add to Cart', priority: 20, target: {} },
      { action_type: 'buy_now', label: 'Buy Now', priority: 10, target: {} },
    ],
  };
}

