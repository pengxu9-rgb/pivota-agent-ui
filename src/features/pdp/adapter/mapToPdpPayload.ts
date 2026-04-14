import type { ProductResponse } from '@/lib/api';
import type {
  DetailSection,
  MediaGalleryData,
  Offer,
  PDPPayload,
  PricePromoData,
  ProductDetailsData,
  RecommendationsData,
  SizeGuide,
  Variant,
  ReviewsPreviewData,
} from '@/features/pdp/types';
import { formatDescriptionText } from '@/features/pdp/utils/formatDescriptionText';
import { buildProductVariants } from '@/features/pdp/utils/productVariants';

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

function normalizeTextForLineParsing(input: unknown): string {
  const raw = typeof input === 'string' ? input : '';
  if (!raw) return '';
  return raw
    .replace(/\r/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[–—−]/g, '-') // normalize dashes
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .trim();
}

function isLikelySizeLabel(label: string): boolean {
  const normalized = label.trim().toUpperCase().replace(/\s+/g, ' ');
  return [
    'XXS',
    'XS',
    'S',
    'M',
    'L',
    'XL',
    'XXL',
    'XXXL',
    '2XL',
    '3XL',
    '4XL',
    '5XL',
    'ONE SIZE',
    'ONESIZE',
    'OS',
    'FREE SIZE',
    'FREESIZE',
  ].includes(normalized);
}

function parseWeightSizeRow(line: string): { label: string; kg?: string; lb?: string } | null {
  const cleaned = String(line || '')
    .replace(/\s*kg\b/gi, ' kg')
    .replace(/\s*lbs?\b/gi, ' lb')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;

  // Example: "M - 40.0-52.5 kg / 88.2-115.7 lb"
  const m = cleaned.match(
    /^([A-Za-z0-9][A-Za-z0-9 ]{0,14}?)\s*[-:]\s*([0-9]+(?:\.[0-9]+)?)\s*-\s*([0-9]+(?:\.[0-9]+)?)\s*kg\b(?:\s*\/\s*([0-9]+(?:\.[0-9]+)?)\s*-\s*([0-9]+(?:\.[0-9]+)?)\s*lb\b)?\s*$/i,
  );
  if (!m) return null;

  const label = String(m[1] || '').trim();
  if (!label) return null;

  const kgMin = String(m[2] || '').trim();
  const kgMax = String(m[3] || '').trim();
  const lbMin = String(m[4] || '').trim();
  const lbMax = String(m[5] || '').trim();

  const kg = kgMin && kgMax ? `${kgMin}–${kgMax}` : undefined;
  const lb = lbMin && lbMax ? `${lbMin}–${lbMax}` : undefined;
  if (!kg && !lb) return null;

  return { label, kg, lb };
}

function inferSizeGuideFromDescription(input: unknown): SizeGuide | null {
  const normalized = normalizeTextForLineParsing(input);
  if (!normalized) return null;

  const rawLines = normalized.split('\n');
  const lines = rawLines.map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  const headerIdx = lines.findIndex((l) => /^size\b/i.test(l));

  const collectRows = (startIdx: number): Array<{ label: string; kg?: string; lb?: string }> => {
    const rows: Array<{ label: string; kg?: string; lb?: string }> = [];
    let started = false;
    for (let i = startIdx; i < lines.length; i += 1) {
      const row = parseWeightSizeRow(lines[i] || '');
      if (row) {
        rows.push(row);
        started = true;
        continue;
      }
      if (started) break;
    }
    return rows;
  };

  let rows: Array<{ label: string; kg?: string; lb?: string }> = [];
  if (headerIdx >= 0) {
    rows = collectRows(headerIdx + 1);
  }

  if (rows.length < 2) {
    const scanned = lines.map((l) => parseWeightSizeRow(l)).filter(Boolean) as Array<{
      label: string;
      kg?: string;
      lb?: string;
    }>;
    const likely = scanned.filter((r) => isLikelySizeLabel(r.label));
    if (likely.length >= 3) {
      rows = likely;
    }
  }

  if (rows.length < 2) return null;

  const uniqueByLabel = new Map<string, { label: string; kg?: string; lb?: string }>();
  rows.forEach((r) => {
    const key = r.label.trim().toUpperCase();
    if (!key) return;
    if (!uniqueByLabel.has(key)) uniqueByLabel.set(key, r);
  });
  const deduped = Array.from(uniqueByLabel.values());
  if (deduped.length < 2) return null;

  const hasKg = deduped.some((r) => Boolean(r.kg));
  const hasLb = deduped.some((r) => Boolean(r.lb));
  const columns = hasKg && hasLb ? ['Suitable Weight (kg)', 'Suitable Weight (lb)'] : ['Suitable Weight (kg)'];

  return {
    columns,
    rows: deduped.map((r) => ({
      label: r.label.trim(),
      values:
        columns.length === 2
          ? [r.kg || '--', r.lb || '--']
          : [r.kg || '--'],
    })),
    note:
      columns.length === 2
        ? '* Suitable weight ranges. Units: kg / lb.'
        : '* Suitable weight ranges. Units: kg.',
  };
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

function buildMediaItems(product: ProductResponse, raw: any, variants: Variant[]): MediaGalleryData {
  const items: MediaGalleryData['items'] = [];
  const seenKeys = new Set<string>();

  const unwrapProxiedImageUrl = (url: string): string => {
    try {
      const u = new URL(url, 'http://localhost');
      if (u.pathname === '/api/image-proxy') {
        const inner = u.searchParams.get('url');
        if (inner) return inner;
      }
    } catch {
      // ignore
    }
    return url;
  };

  const canonicalImageKey = (url: string): string => {
    const rawUrl = unwrapProxiedImageUrl(url);
    try {
      const u = new URL(rawUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return rawUrl;

      const host = u.hostname.toLowerCase();
      let path = u.pathname;
      if (host.includes('cdn.shopify.com')) {
        path = path.replace(/_(\d{2,4})x(\d{0,4})?(?=\.(?:jpe?g|png|webp|gif|avif))/i, '');
      }
      const params = new URLSearchParams(u.search);
      ['width', 'w', 'height', 'h', 'dpr', 'quality', 'q'].forEach((k) => params.delete(k));
      const sorted = Array.from(params.entries()).sort(([a, av], [b, bv]) => {
        const kc = a.localeCompare(b);
        return kc !== 0 ? kc : av.localeCompare(bv);
      });
      const normalized = new URLSearchParams(sorted);
      const qs = normalized.toString();
      return `${host}${path}${qs ? `?${qs}` : ''}`;
    } catch {
      return rawUrl;
    }
  };

  const mediaDedupeKey = (item: MediaGalleryData['items'][number]) => {
    const t = item.type || 'image';
    if (t !== 'image') return `${t}:${item.url}`;
    return `image:${canonicalImageKey(item.url)}`;
  };

  const pushItem = (item: MediaGalleryData['items'][number]) => {
    if (!item.url) return;
    const key = mediaDedupeKey(item);
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    items.push(item);
  };
  const rawMedia = Array.isArray(raw?.media) ? raw.media : [];
  const rawImagesCandidates = [
    raw?.images,
    raw?.image_urls,
    raw?.imageUrls,
    raw?.seed_data?.image_urls,
    raw?.seed_data?.snapshot?.image_urls,
    raw?.seed_data?.snapshot?.images,
    (product as any).images,
  ];
  const rawImages: any[] = [];
  rawImagesCandidates.forEach((candidate) => {
    if (Array.isArray(candidate)) rawImages.push(...candidate);
  });

  rawMedia.forEach((m: any) => {
    const url = normalizeImageUrl(m.url || m.image_url || m.src);
    if (!url) return;
    pushItem({
      type: m.type || m.media_type || 'image',
      url,
      thumbnail_url: normalizeImageUrl(m.thumbnail_url || m.thumbnail),
      alt_text: m.alt_text || product.title,
      source: m.source,
      duration_ms: m.duration_ms,
    });
  });

  rawImages.forEach((img: any) => {
    const rawUrl =
      typeof img === 'string' ? img : img?.url || img?.image_url || img?.src;
    const url =
      typeof rawUrl === 'string' ? normalizeImageUrl(rawUrl) : undefined;
    if (!url) return;
    pushItem({
      type: 'image',
      url,
      alt_text: typeof img === 'object' ? img.alt_text : product.title,
      source: typeof img === 'object' ? img.source : undefined,
      thumbnail_url: normalizeImageUrl(typeof img === 'object' ? img.thumbnail_url : undefined),
    });
  });

  variants.forEach((v) => {
    if (v.image_url) {
      pushItem({
        type: 'image',
        url: v.image_url,
        alt_text: product.title,
      });
    }
  });

  if (!items.length && product.image_url) {
    pushItem({
      type: 'image',
      url: normalizeImageUrl(product.image_url) || product.image_url,
      alt_text: product.title,
    });
  }

  return { items };
}

function buildDetailSections(product: ProductResponse, raw: any): DetailSection[] {
  const desc = formatDescriptionText(product.description || '');
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
      content: formatDescriptionText(String(content)),
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
  type ReviewQuestion = NonNullable<ReviewsPreviewData['questions']>[number];
  const merchantFaqQuestions: ReviewQuestion[] = Array.isArray(raw?.pdp_faq_items)
    ? raw.pdp_faq_items
        .map((item: any) => ({
          question: String(item?.question || ''),
          answer: item?.answer ? String(item.answer) : undefined,
          source: 'merchant_faq',
          source_label: 'Official FAQ',
        }))
        .filter((item: ReviewQuestion) => item.question)
    : [];
  const normalizeStarDistributionPercent = (value: unknown): number | undefined => {
    const rawNum = typeof value === 'string' ? Number(value.replace('%', '').trim()) : Number(value);
    if (!Number.isFinite(rawNum)) return undefined;

    // Upstreams may return percent as 0-1 ratio or 0-100 percentage. Normalize to 0-1.
    const normalized = rawNum > 1 ? rawNum / 100 : rawNum;
    if (!Number.isFinite(normalized)) return undefined;
    return Math.max(0, Math.min(1, normalized));
  };

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
      ...(merchantFaqQuestions.length ? { questions: merchantFaqQuestions } : {}),
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
  const summaryQuestions = Array.isArray(summary.questions)
    ? summary.questions.map((item: any) => ({
        question: String(item.question || item.title || ''),
        answer: item.answer ? String(item.answer) : undefined,
        replies: item.replies ?? item.reply_count,
        source: item.source ? String(item.source) : undefined,
        source_label: item.source_label ? String(item.source_label) : item.sourceLabel ? String(item.sourceLabel) : undefined,
        support_count:
          item.support_count != null
            ? Number(item.support_count) || 0
            : item.supportCount != null
              ? Number(item.supportCount) || 0
              : undefined,
      }))
    : [];
  const seenQuestionKeys = new Set<string>();
  const questions = [...merchantFaqQuestions, ...summaryQuestions].filter((item) => {
    const key = String(item.question || '')
      .toLowerCase()
      .replace(/[?？]+$/, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    if (!key || seenQuestionKeys.has(key)) return false;
    seenQuestionKeys.add(key);
    return true;
  });

  return {
    scale,
    rating,
    review_count: reviewCount,
    star_distribution: Array.isArray(summary.star_distribution)
      ? summary.star_distribution.map((item: any) => ({
          stars: Number(item.stars || item.rating || 0) || 0,
          count: Number(item.count ?? item.total ?? 0) || 0,
          percent: normalizeStarDistributionPercent(item.percent ?? item.ratio),
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
    questions: questions.length ? questions : undefined,
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
      title: item.title ? String(item.title) : undefined,
      text_snippet: String(item.text_snippet || item.text || item.body || item.title || ''),
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
  recommendationsLoading?: boolean;
  entryPoint?: string;
  experiment?: string;
}): PDPPayload {
  const {
    product,
    rawDetail,
    relatedProducts = [],
    recommendationsLoading = false,
    entryPoint = 'products_list',
    experiment,
  } = args;
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
        product_id: String(offer?.product_id || offer?.productId || '').trim() || undefined,
        merchant_id: merchantId,
        merchant_name:
          offer?.merchant_name || offer?.merchantName || offer?.seller_name || undefined,
        tier: offer?.tier ? String(offer.tier) : undefined,
        fulfillment_type: offer?.fulfillment_type || offer?.fulfillmentType || undefined,
        commerce_mode: offer?.commerce_mode || offer?.commerceMode || undefined,
        checkout_handoff: offer?.checkout_handoff || offer?.checkoutHandoff || undefined,
        purchase_route: offer?.purchase_route || offer?.purchaseRoute || undefined,
        seller_of_record: offer?.seller_of_record || offer?.sellerOfRecord || undefined,
        merchant_checkout_url: offer?.merchant_checkout_url || offer?.merchantCheckoutUrl || undefined,
        checkout_url: offer?.checkout_url || offer?.checkoutUrl || undefined,
        purchase_url: offer?.purchase_url || offer?.purchaseUrl || undefined,
        external_redirect_url: offer?.external_redirect_url || offer?.externalRedirectUrl || undefined,
        externalRedirectUrl: offer?.externalRedirectUrl || undefined,
        affiliate_url: offer?.affiliate_url || offer?.affiliateUrl || undefined,
        external_url: offer?.external_url || offer?.externalUrl || undefined,
        redirect_url: offer?.redirect_url || offer?.redirectUrl || undefined,
        url: offer?.url || undefined,
        product_url: offer?.product_url || offer?.productUrl || undefined,
        canonical_url: offer?.canonical_url || offer?.canonicalUrl || undefined,
        destination_url: offer?.destination_url || offer?.destinationUrl || undefined,
        source_url: offer?.source_url || offer?.sourceUrl || undefined,
        variant_id: offer?.variant_id || offer?.variantId || undefined,
        sku_id: offer?.sku_id || offer?.skuId || undefined,
        action: offer?.action || undefined,
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

  const variants = buildProductVariants(product, raw);
  const defaultVariant = variants[0];

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
      merchant_name: p.merchant_name,
      title: p.title,
      image_url: p.image_url,
      price: { amount: Number(p.price) || 0, currency: p.currency || currency },
      ...(p.product_type ? { product_type: p.product_type } : {}),
      ...(p.category ? { category: p.category } : {}),
      ...(p.department ? { department: p.department } : {}),
      ...(Array.isArray(p.tags) ? { tags: p.tags } : {}),
      ...(p.card_title ? { card_title: p.card_title } : {}),
      ...(p.card_subtitle ? { card_subtitle: p.card_subtitle } : {}),
      ...(p.card_highlight ? { card_highlight: p.card_highlight } : {}),
      ...(p.card_badge ? { card_badge: p.card_badge } : {}),
      ...(p.search_card ? { search_card: p.search_card } : {}),
      ...(p.shopping_card ? { shopping_card: p.shopping_card } : {}),
      ...(Array.isArray(p.market_signal_badges) ? { market_signal_badges: p.market_signal_badges } : {}),
      ...(p.review_summary ? { review_summary: p.review_summary } : {}),
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
  const descriptionForSizeGuide =
    typeof raw?.description === 'string'
      ? raw.description
      : typeof raw?.description?.text === 'string'
        ? raw.description.text
        : product.description;
  const sizeGuide: SizeGuide | undefined = sizeGuideRaw
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
    : inferSizeGuideFromDescription(descriptionForSizeGuide) || undefined;
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

  const recommendationsState =
    recommendationsLoading || recommendations.items.length
      ? (recommendationsLoading ? 'loading' : 'ready')
      : undefined;

  return {
    schema_version: '1.0.0',
    page_type: 'product_detail',
    tracking: {
      page_request_id: createPageRequestId(),
      entry_point: entryPoint,
      ...(experiment ? { experiment } : {}),
    },
    ...(recommendationsState ? { x_recommendations_state: recommendationsState } : {}),
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
      source: raw.source || product.source || undefined,
      commerce_mode: raw.commerce_mode || raw.commerceMode || product.commerce_mode || undefined,
      checkout_handoff: raw.checkout_handoff || raw.checkoutHandoff || product.checkout_handoff || undefined,
      purchase_route: raw.purchase_route || raw.purchaseRoute || product.purchase_route || undefined,
      external_redirect_url:
        raw.external_redirect_url ||
        raw.externalRedirectUrl ||
        product.external_redirect_url ||
        undefined,
      externalRedirectUrl: raw.externalRedirectUrl || product.externalRedirectUrl || undefined,
      affiliate_url: raw.affiliate_url || raw.affiliateUrl || product.affiliate_url || undefined,
      external_url: raw.external_url || raw.externalUrl || product.external_url || undefined,
      redirect_url: raw.redirect_url || raw.redirectUrl || product.redirect_url || undefined,
      url: raw.url || product.url || undefined,
      canonical_url: raw.canonical_url || raw.canonicalUrl || product.canonical_url || undefined,
      destination_url: raw.destination_url || raw.destinationUrl || product.destination_url || undefined,
      source_url: raw.source_url || raw.sourceUrl || product.source_url || undefined,
      platform: raw.platform || product.platform || undefined,
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
  recommendationsLoading?: boolean;
  entryPoint?: string;
  experiment?: string;
}): PDPPayload {
  return mapToPdpPayload(args);
}
