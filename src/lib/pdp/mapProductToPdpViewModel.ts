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

function toOptionPairs(raw: any): Array<{ name: string; value: string }> {
  if (!raw || typeof raw !== 'object') return [];
  return Object.entries(raw)
    .map(([name, value]) => ({
      name: String(name),
      value: String(value ?? ''),
    }))
    .filter((o) => o.name && o.value);
}

function toNumber(value: any): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return Number(value) || 0;
  if (value && typeof value === 'object') {
    if (typeof value.amount === 'number') return value.amount;
    if (typeof value.amount === 'string') return Number(value.amount) || 0;
    if (value.current) return toNumber(value.current);
  }
  return 0;
}

function toCurrency(value: any, fallback: string): string {
  const c =
    (value && typeof value === 'object' && (value.currency || value.currency_code || value.currencyCode)) ||
    (value && typeof value === 'object' && value.current && value.current.currency) ||
    fallback;
  const s = String(c || '').trim();
  return s || 'USD';
}

function toVariantFromRaw(product: ProductResponse, raw: any): Variant | null {
  const variantId = String(raw?.variant_id || raw?.id || '').trim();
  if (!variantId) return null;

  const skuIdRaw = raw?.sku_id || raw?.skuId || raw?.sku || undefined;
  const skuId = skuIdRaw != null ? String(skuIdRaw).trim() : undefined;

  const title = String(raw?.title || 'Variant').trim() || 'Variant';
  const options = toOptionPairs(raw?.options);

  const currency = toCurrency(raw, product.currency || 'USD');
  const amount = toNumber(raw?.price) || Number(product.price) || 0;

  const inStock =
    typeof raw?.in_stock === 'boolean'
      ? raw.in_stock
      : typeof raw?.inventory_quantity === 'number'
        ? raw.inventory_quantity > 0
        : typeof raw?.inventoryQuantity === 'number'
          ? raw.inventoryQuantity > 0
          : !!product.in_stock;

  const imageUrl =
    (typeof raw?.image_url === 'string' && raw.image_url) ||
    (typeof raw?.imageUrl === 'string' && raw.imageUrl) ||
    (typeof raw?.image?.src === 'string' && raw.image.src) ||
    product.image_url;

  return {
    variant_id: variantId,
    sku_id: skuId || undefined,
    title,
    options,
    price: { current: { amount, currency } },
    availability: { in_stock: inStock },
    image_url: imageUrl,
  };
}

function toFallbackVariant(product: ProductResponse): Variant {
  const currency = product.currency || 'USD';
  const anyP = product as any;
  const ref = anyP.product_ref || anyP.productRef || product.product_ref || null;
  const refVariantId =
    product.variant_id ||
    (ref && (ref.variant_id || ref.variantId || ref.sku_id || ref.skuId)) ||
    product.sku_id ||
    null;
  const variantId = String(refVariantId || product.product_id).trim();
  const skuId = String(product.sku_id || product.sku || variantId).trim();
  return {
    variant_id: variantId,
    sku_id: skuId || undefined,
    title: 'Default',
    options: [],
    price: { current: { amount: Number(product.price) || 0, currency } },
    availability: { in_stock: !!product.in_stock },
    image_url: product.image_url,
  };
}

function normalizeVariants(product: ProductResponse): Variant[] {
  const anyP = product as any;
  const source = Array.isArray(anyP?.attributes?.variants)
    ? anyP.attributes.variants
    : Array.isArray(anyP?.variants)
      ? anyP.variants
      : null;

  if (Array.isArray(source) && source.length > 0) {
    const mapped = source
      .map((v: any) => toVariantFromRaw(product, v))
      .filter((v): v is Variant => v !== null);
    if (mapped.length > 0) return mapped;
  }

  return [toFallbackVariant(product)];
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

  const variants = normalizeVariants(product);
  const defaultVariant = variants[0];
  const currency = defaultVariant?.price?.current.currency || product.currency || 'USD';

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
    price: { amount: Number(defaultVariant?.price?.current.amount) || Number(product.price) || 0, currency },
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
      variants,
      price: defaultVariant.price,
      availability: defaultVariant.availability || { in_stock: !!product.in_stock },
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
