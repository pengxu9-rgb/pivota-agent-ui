import type { ProductResponse } from '@/lib/api';
import type {
  DetailSection,
  MediaGalleryData,
  Offer,
  PDPPayload,
  PricePromoData,
  ProductDetailsData,
  RecommendationsData,
  Variant,
  ReviewsPreviewData,
  VariantPrice,
} from '@/features/pdp/types';

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

function normalizeImageUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.includes('amazon') || url.startsWith('http')) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

function normalizeAvailableQuantity(value: unknown): number | undefined {
  if (value == null) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Math.floor(parsed));
}

function toVariant(product: ProductResponse, raw?: any): Variant {
  const currency = product.currency || 'USD';
  const availableQuantity = normalizeAvailableQuantity(
    raw?.available_quantity ??
      raw?.availableQuantity ??
      raw?.inventory_quantity ??
      raw?.inventoryQuantity ??
      raw?.quantity ??
      raw?.stock,
  );
  const inStock = availableQuantity != null ? availableQuantity > 0 : !!product.in_stock;
  return {
    variant_id: product.product_id,
    sku_id: product.product_id,
    title: 'Default',
    options: [],
    price: { current: { amount: Number(product.price) || 0, currency } },
    availability: {
      in_stock: inStock,
      ...(availableQuantity != null ? { available_quantity: availableQuantity } : {}),
    },
    image_url: normalizeImageUrl(product.image_url),
  };
}

function toVariantPrice(input: any, currency: string): VariantPrice | undefined {
  if (!input) return undefined;
  if (typeof input === 'number' || typeof input === 'string') {
    return { current: { amount: Number(input) || 0, currency } };
  }

  const amount =
    input.amount ??
    input.current?.amount ??
    input.price ??
    input.price_amount ??
    input.value;
  const compareAt =
    input.compare_at ??
    input.compareAt ??
    input.compare_at_price ??
    input.list_price;

  return {
    current: { amount: Number(amount) || 0, currency: input.currency || currency },
    ...(compareAt != null
      ? {
          compare_at: {
            amount: Number(compareAt) || 0,
            currency: input.currency || currency,
          },
        }
      : {}),
  };
}

function buildVariants(product: ProductResponse, raw: any): Variant[] {
  const currency = product.currency || 'USD';
  const rawVariants = Array.isArray(raw?.variants)
    ? raw.variants
    : Array.isArray(product.variants)
      ? product.variants
      : [];

  if (!rawVariants.length) return [toVariant(product, raw)];

  const mapped = rawVariants
    .map((v: any, idx: number) => {
      const variantId = v.variant_id || v.id || v.sku || v.sku_id || `${product.product_id}-${idx + 1}`;
      const title = v.title || v.name || v.option_title || v.sku_name || `Variant ${idx + 1}`;
      const options = Array.isArray(v.options)
        ? v.options
        : typeof v.options === 'object' && v.options
          ? Object.entries(v.options).map(([name, value]) => ({ name, value: String(value) }))
          : [];

      const price = toVariantPrice(v.price || v.pricing, currency) || toVariantPrice(product.price, currency);
      const availableQuantity = normalizeAvailableQuantity(
        v.available_quantity ??
          v.availableQuantity ??
          v.availability?.available_quantity ??
          v.availability?.availableQuantity ??
          v.inventory_quantity ??
          v.inventoryQuantity ??
          v.quantity ??
          v.stock,
      );
      const inStock =
        typeof v.in_stock === 'boolean'
          ? v.in_stock
          : typeof v.available === 'boolean'
            ? v.available
            : availableQuantity != null
              ? availableQuantity > 0
              : (v.inventory_quantity || v.quantity || 0) > 0;

      const swatchHex =
        v.color_hex ||
        v.swatch?.hex ||
        v.beauty_meta?.shade_hex ||
        v.shade_hex ||
        v.hex;

      const beautyMeta = v.beauty_meta || v.beautyMeta || {
        shade_hex: v.shade_hex || v.shadeHex,
        finish: v.finish,
        coverage: v.coverage,
        undertone: v.undertone,
      };

      return {
        variant_id: String(variantId),
        sku_id: v.sku_id || v.sku || v.sku_code,
        title: String(title),
        options,
        swatch: swatchHex ? { hex: swatchHex } : undefined,
        beauty_meta: beautyMeta,
        price,
        availability: {
          in_stock: inStock,
          ...(availableQuantity != null ? { available_quantity: availableQuantity } : {}),
        },
        image_url: normalizeImageUrl(v.image_url || v.image || v.images?.[0]),
      } as Variant;
    })
    .filter(Boolean);

  return mapped.length ? mapped : [toVariant(product)];
}

function buildMediaItems(product: ProductResponse, raw: any, variants: Variant[]): MediaGalleryData {
  const items: MediaGalleryData['items'] = [];
  const rawMedia = Array.isArray(raw?.media) ? raw.media : [];
  const rawImages = Array.isArray(raw?.images)
    ? raw.images
    : Array.isArray(raw?.image_urls)
      ? raw.image_urls
      : [];

  rawMedia.forEach((m: any) => {
    const url = normalizeImageUrl(m.url || m.image_url || m.src);
    if (!url) return;
    items.push({
      type: m.type || m.media_type || 'image',
      url,
      thumbnail_url: normalizeImageUrl(m.thumbnail_url || m.thumbnail),
      alt_text: m.alt_text || product.title,
      source: m.source,
      duration_ms: m.duration_ms,
    });
  });

  rawImages.forEach((img: any) => {
    const url = normalizeImageUrl(typeof img === 'string' ? img : img.url || img.image_url);
    if (!url) return;
    items.push({
      type: 'image',
      url,
      alt_text: typeof img === 'object' ? img.alt_text : product.title,
      source: typeof img === 'object' ? img.source : undefined,
      thumbnail_url: normalizeImageUrl(typeof img === 'object' ? img.thumbnail_url : undefined),
    });
  });

  variants.forEach((v) => {
    if (v.image_url && !items.some((i) => i.url === v.image_url)) {
      items.push({
        type: 'image',
        url: v.image_url,
        alt_text: product.title,
      });
    }
  });

  if (!items.length && product.image_url) {
    items.push({
      type: 'image',
      url: normalizeImageUrl(product.image_url) || product.image_url,
      alt_text: product.title,
    });
  }

  return { items };
}

function buildDetailSections(product: ProductResponse, raw: any): DetailSection[] {
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

  const rawSections = Array.isArray(raw?.details_sections)
    ? raw.details_sections
    : Array.isArray(raw?.detail_sections)
      ? raw.detail_sections
      : Array.isArray(raw?.details)
        ? raw.details
        : [];

  rawSections.forEach((s: any) => {
    const heading = s.heading || s.title || s.name;
    const content = s.content || s.value || s.text;
    if (!heading || !content) return;
    sections.push({
      heading: String(heading),
      content_type: 'text',
      content: stripHtml(String(content)),
      collapsed_by_default: s.collapsed_by_default ?? true,
    });
  });

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

function buildReviewsPreview(product: ProductResponse, raw: any): ReviewsPreviewData | null {
  const summary =
    raw?.review_summary ||
    raw?.reviews_summary ||
    raw?.reviews?.summary ||
    (product as any).review_summary ||
    null;

  if (!summary) {
    return {
      scale: 5,
      rating: 0,
      review_count: 0,
      entry_points: {
        write_review: {
          action_type: 'open_embed',
          label: 'Write a review',
          target: {
            embed_intent_type: 'buyer_review_submission',
            resolve_params: {
              product_id: product.product_id,
              merchant_id: product.merchant_id || '',
            },
          },
        },
      },
    };
  }

  const scale = Number(summary.scale || summary.rating_scale || 5) || 5;
  const rating =
    Number(summary.rating || summary.average_rating || summary.avg_rating || 0) || 0;
  const reviewCount =
    Number(summary.review_count || summary.count || summary.total || 0) || 0;
  const previewItems = Array.isArray(summary.preview_items)
    ? summary.preview_items
    : Array.isArray(summary.snippets)
      ? summary.snippets
      : [];

  return {
    scale,
    rating,
    review_count: reviewCount,
    star_distribution: Array.isArray(summary.star_distribution)
      ? summary.star_distribution.map((item: any) => ({
          stars: Number(item.stars || item.rating || 0) || 0,
          count: item.count ?? item.total,
          percent: item.percent ?? item.ratio,
        }))
      : undefined,
    dimension_ratings: Array.isArray(summary.dimension_ratings)
      ? summary.dimension_ratings.map((item: any) => ({
          label: String(item.label || item.name || ''),
          score: Number(item.score || item.value || 0) || 0,
        }))
      : undefined,
    filter_chips: Array.isArray(summary.filter_chips)
      ? summary.filter_chips.map((item: any) => ({
          label: String(item.label || item.name || ''),
          count: item.count ?? item.total,
        }))
      : undefined,
    questions: Array.isArray(summary.questions)
      ? summary.questions.map((item: any) => ({
          question: String(item.question || item.title || ''),
          answer: item.answer ? String(item.answer) : undefined,
          replies: item.replies ?? item.reply_count,
        }))
      : undefined,
    brand_card: summary.brand_card
      ? {
          name: String(summary.brand_card.name || ''),
          subtitle: summary.brand_card.subtitle ? String(summary.brand_card.subtitle) : undefined,
        }
      : undefined,
    preview_items: previewItems.slice(0, 3).map((item: any, idx: number) => ({
      review_id: String(item.review_id || item.id || idx),
      rating: Number(item.rating || item.score || scale) || scale,
      author_label: item.author_label || item.author || item.user,
      text_snippet: String(item.text_snippet || item.text || item.body || ''),
      media: Array.isArray(item.media)
        ? item.media.map((m: any) => ({
            type: m.type || 'image',
            url: normalizeImageUrl(m.url || m.image_url) || '',
            thumbnail_url: normalizeImageUrl(m.thumbnail_url),
          }))
        : undefined,
    })),
    entry_points: {
      open_reviews: {
        action_type: 'open_embed',
        label: 'See all reviews',
        target: {
          embed_intent_type: 'reviews_read',
          resolve_params: {
            product_id: product.product_id,
            merchant_id: product.merchant_id || '',
          },
        },
      },
      write_review: {
        action_type: 'open_embed',
        label: 'Write a review',
        target: {
          embed_intent_type: 'buyer_review_submission',
          resolve_params: {
            product_id: product.product_id,
            merchant_id: product.merchant_id || '',
          },
        },
      },
    },
  };
}

export function mapToPdpPayload(args: {
  product: ProductResponse;
  rawDetail?: any;
  relatedProducts?: ProductResponse[];
  entryPoint?: string;
  experiment?: string;
}): PDPPayload {
  const { product, rawDetail, relatedProducts = [], entryPoint = 'products_list', experiment } = args;
  const raw = rawDetail || (product as any).raw_detail || (product as any)._raw || {};

  const currency = product.currency || 'USD';
  const productGroupId: string | undefined =
    raw.product_group_id ||
    raw.productGroupId ||
    raw.product_group ||
    raw.productGroup ||
    undefined;
  const offersRaw = Array.isArray(raw.offers) ? raw.offers : [];
  const offers: Offer[] = offersRaw
    .map((offer: any) => {
      const offerId = String(offer?.offer_id || offer?.offerId || '').trim();
      const merchantId = String(
        offer?.merchant_id || offer?.merchantId || offer?.seller_id || '',
      ).trim();
      if (!offerId || !merchantId) return null;

      const priceAmount = Number(
        offer?.price?.amount ??
          offer?.price_amount ??
          offer?.price ??
          offer?.item_price?.amount ??
          offer?.item_price ??
          0,
      );
      const priceCurrency = String(
        offer?.price?.currency || offer?.currency || currency || 'USD',
      );

      const etaRaw = offer?.shipping?.eta_days_range || offer?.shipping?.etaDaysRange || null;
      const etaRange =
        Array.isArray(etaRaw) && etaRaw.length >= 2
          ? ([Number(etaRaw[0]) || 0, Number(etaRaw[1]) || 0] as [number, number])
          : undefined;

      const shipCostRaw =
        offer?.shipping?.cost ?? offer?.shipping_cost ?? offer?.shippingFee ?? null;
      const shipCostAmount =
        shipCostRaw == null
          ? undefined
          : Number(typeof shipCostRaw === 'object' ? shipCostRaw.amount : shipCostRaw);
      const shipCostCurrency =
        shipCostRaw && typeof shipCostRaw === 'object'
          ? String(shipCostRaw.currency || priceCurrency)
          : priceCurrency;

      const returnsRaw = offer?.returns || null;

      const shipping =
        offer?.shipping || etaRange || shipCostAmount != null
          ? {
              method_label: offer?.shipping?.method_label || offer?.shipping?.methodLabel,
              eta_days_range: etaRange,
              ...(shipCostAmount != null && Number.isFinite(shipCostAmount)
                ? { cost: { amount: shipCostAmount, currency: shipCostCurrency } }
                : {}),
            }
          : undefined;

      const returns = returnsRaw
        ? {
            return_window_days:
              returnsRaw.return_window_days ??
              returnsRaw.returnWindowDays ??
              returnsRaw.window_days ??
              returnsRaw.windowDays ??
              undefined,
            free_returns:
              typeof returnsRaw.free_returns === 'boolean'
                ? returnsRaw.free_returns
                : typeof returnsRaw.freeReturns === 'boolean'
                  ? returnsRaw.freeReturns
                  : undefined,
          }
        : undefined;

      return {
        offer_id: offerId,
        product_group_id: String(
          offer?.product_group_id || productGroupId || '',
        ).trim() || undefined,
        merchant_id: merchantId,
        merchant_name:
          offer?.merchant_name || offer?.merchantName || offer?.seller_name || undefined,
        tier: offer?.tier ? String(offer.tier) : undefined,
        fulfillment_type: offer?.fulfillment_type || offer?.fulfillmentType || undefined,
        inventory: offer?.inventory || undefined,
        price: { amount: Number.isFinite(priceAmount) ? priceAmount : 0, currency: priceCurrency },
        shipping,
        returns,
      } satisfies Offer;
    })
    .filter(Boolean) as Offer[];

  const offersCount: number | undefined =
    raw.offers_count != null ? Number(raw.offers_count) : offers.length || undefined;
  const defaultOfferId: string | undefined =
    raw.default_offer_id || raw.defaultOfferId || undefined;
  const bestPriceOfferId: string | undefined =
    raw.best_price_offer_id || raw.bestPriceOfferId || undefined;

  const variants = buildVariants(product, raw);
  const defaultVariant = variants[0] || toVariant(product);

  const media = buildMediaItems(product, raw, variants);

  const pricePromo: PricePromoData = {
    price: { amount: Number(defaultVariant.price?.current.amount ?? product.price) || 0, currency },
    compare_at: defaultVariant.price?.compare_at,
  };

  const details: ProductDetailsData = {
    sections: buildDetailSections(product, raw),
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

  const reviewsPreview = buildReviewsPreview(product, raw);
  const recentPurchases = Array.isArray(raw?.recent_purchases)
    ? raw.recent_purchases
        .map((item: any) => ({
          user_label: String(item.user_label || item.user || ''),
          variant_label: item.variant_label || item.variant || undefined,
          time_label: item.time_label || item.time || undefined,
          price_label:
            item.price_label ||
            (item.price != null ? String(item.price) : undefined),
        }))
        .filter((item: any) => item.user_label)
    : [];
  const brandStory = raw?.brand_story || raw?.brand?.story || raw?.brand_story_text;
  const beautyMetaRaw = raw?.beauty_meta || raw?.beautyMeta || {};
  const beautyMeta = {
    popular_looks: Array.isArray(beautyMetaRaw.popular_looks)
      ? beautyMetaRaw.popular_looks.map((item: any) => String(item))
      : undefined,
    best_for: Array.isArray(beautyMetaRaw.best_for)
      ? beautyMetaRaw.best_for.map((item: any) => String(item))
      : undefined,
    important_info: Array.isArray(beautyMetaRaw.important_info)
      ? beautyMetaRaw.important_info.map((item: any) => String(item))
      : undefined,
  };
  const hasBeautyMeta = Object.values(beautyMeta).some(
    (value) => Array.isArray(value) && value.length > 0,
  );
  const sizeGuideRaw = raw?.size_guide || raw?.sizeGuide;
  const sizeGuide = sizeGuideRaw
    ? {
        columns: Array.isArray(sizeGuideRaw.columns)
          ? sizeGuideRaw.columns.map((col: any) => String(col))
          : Array.isArray(sizeGuideRaw.headers)
            ? sizeGuideRaw.headers.map((col: any) => String(col))
            : [],
        rows: Array.isArray(sizeGuideRaw.rows)
          ? sizeGuideRaw.rows.map((row: any) => ({
              label: String(row.label || row.size || ''),
              values: Array.isArray(row.values)
                ? row.values.map((value: any) => String(value))
                : [],
            }))
          : [],
        note: sizeGuideRaw.note ? String(sizeGuideRaw.note) : undefined,
        model_info: sizeGuideRaw.model_info ? String(sizeGuideRaw.model_info) : undefined,
      }
    : undefined;
  const hasSizeGuide =
    sizeGuide &&
    Array.isArray(sizeGuide.columns) &&
    sizeGuide.columns.length > 0 &&
    Array.isArray(sizeGuide.rows) &&
    sizeGuide.rows.length > 0;
  const modules = [
    ...(media.items.length
      ? [
          {
            module_id: 'm_media',
            type: 'media_gallery' as const,
            priority: 100,
            data: media,
          },
        ]
      : []),
    ...(variants.length > 1
      ? [
          {
            module_id: 'm_variant',
            type: 'variant_selector' as const,
            priority: 95,
            data: { selected_variant_id: defaultVariant.variant_id },
          },
        ]
      : []),
    {
      module_id: 'm_price',
      type: 'price_promo' as const,
      priority: 90,
      data: pricePromo,
    },
    {
      module_id: 'm_details',
      type: 'product_details' as const,
      priority: 70,
      data: details,
    },
    ...(reviewsPreview
      ? [
          {
            module_id: 'm_reviews',
            type: 'reviews_preview' as const,
            priority: 50,
            data: reviewsPreview,
          },
        ]
      : []),
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
  ];

  return {
    schema_version: '1.0.0',
    page_type: 'product_detail',
    tracking: {
      page_request_id: createPageRequestId(),
      entry_point: entryPoint,
      ...(experiment ? { experiment } : {}),
    },
    ...(productGroupId ? { product_group_id: String(productGroupId) } : {}),
    ...(offers.length
      ? {
          offers,
          offers_count: offersCount,
          default_offer_id: defaultOfferId,
          best_price_offer_id: bestPriceOfferId,
        }
      : {}),
    product: {
      product_id: product.product_id,
      merchant_id: product.merchant_id,
      title: product.title,
      subtitle: raw.subtitle || raw.sub_title || '',
      brand: raw.brand
        ? { name: String(raw.brand?.name || raw.brand) }
        : product.brand
          ? { name: String(product.brand) }
          : undefined,
      brand_story: brandStory ? String(brandStory) : undefined,
      category_path: inferCategoryPath(product),
      image_url: normalizeImageUrl(product.image_url),
      tags: Array.isArray(raw.tags) ? raw.tags : product.tags,
      department: raw.department || product.department,
      beauty_meta: hasBeautyMeta ? beautyMeta : undefined,
      recent_purchases: recentPurchases.length ? recentPurchases : undefined,
      size_guide: hasSizeGuide ? sizeGuide : undefined,
      default_variant_id: defaultVariant.variant_id,
      variants,
      price: defaultVariant.price,
      availability: {
        in_stock: !!product.in_stock,
        ...(defaultVariant.availability?.available_quantity != null
          ? { available_quantity: defaultVariant.availability.available_quantity }
          : {}),
      },
      shipping: raw.shipping || product.shipping || undefined,
      returns: raw.returns || product.returns || undefined,
      description: product.description || '',
    },
    modules,
    actions: [
      {
        action_type: 'add_to_cart',
        label: product.external_redirect_url || product.source === 'external_seed' ? 'Open' : 'Add to Cart',
        priority: 20,
        target: {},
      },
      {
        action_type: 'buy_now',
        label: product.external_redirect_url || product.source === 'external_seed' ? 'Visit Site' : 'Buy Now',
        priority: 10,
        target: {},
      },
    ],
  };
}

export function mapProductToPdpViewModel(args: {
  product: ProductResponse;
  rawDetail?: any;
  relatedProducts?: ProductResponse[];
  entryPoint?: string;
  experiment?: string;
}): PDPPayload {
  return mapToPdpPayload(args);
}
