import type { GetPdpV2Response } from '@/lib/api';
import type { Module, PDPPayload, RecommendationsData, ReviewsPreviewData } from '@/features/pdp/types';

const IMAGE_PROXY_PATH = '/api/image-proxy';
const ABSOLUTE_HTTP_URL_RE = /^https?:\/\//i;
const KNOWN_SKU_DUPLICATE_HOSTS = new Set(['sdcdn.io']);
const IMAGE_DEDUPE_IGNORED_QUERY_KEYS = new Set([
  'w',
  'width',
  'h',
  'height',
  'q',
  'quality',
  'dpr',
  'auto',
  'format',
  'fm',
  'fit',
]);
const SKU_FILENAME_NORMALIZE_RE =
  /^(.+?sku_)[a-z0-9]+_(\d{3,4}x\d{3,4}_[0-9]+(?:\.[a-z0-9]+))$/i;

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizePdpImageUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (!ABSOLUTE_HTTP_URL_RE.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname === IMAGE_PROXY_PATH) return trimmed;
  } catch {
    return trimmed;
  }

  return `${IMAGE_PROXY_PATH}?url=${encodeURIComponent(trimmed)}`;
}

function extractProxyTarget(url: string): string {
  if (!url) return url;
  try {
    const parsed = new URL(url, 'http://localhost');
    if (parsed.pathname !== IMAGE_PROXY_PATH) return url;
    const target = parsed.searchParams.get('url');
    return target ? target : url;
  } catch {
    return url;
  }
}

function normalizeSearchParamsForDedupe(url: URL): string {
  const next = new URLSearchParams();
  const sortedEntries = Array.from(url.searchParams.entries()).sort(([aKey, aValue], [bKey, bValue]) => {
    if (aKey === bKey) return aValue.localeCompare(bValue);
    return aKey.localeCompare(bKey);
  });
  for (const [key, value] of sortedEntries) {
    if (IMAGE_DEDUPE_IGNORED_QUERY_KEYS.has(String(key || '').toLowerCase())) continue;
    next.append(key, value);
  }
  return next.toString();
}

function buildImageDedupeKey(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const unwrapped = extractProxyTarget(trimmed);
  const absoluteHttp = ABSOLUTE_HTTP_URL_RE.test(unwrapped);

  try {
    const parsed = absoluteHttp ? new URL(unwrapped) : new URL(unwrapped, 'http://localhost');
    const normalizedSearch = normalizeSearchParamsForDedupe(parsed);
    const normalizedPath = normalizeImagePathForDedupe({
      pathname: parsed.pathname,
      hostname: absoluteHttp ? parsed.hostname : '',
      isAbsoluteHttp: absoluteHttp,
    });
    if (absoluteHttp) {
      return `${parsed.protocol}//${parsed.host}${normalizedPath}${normalizedSearch ? `?${normalizedSearch}` : ''}`;
    }
    return `${normalizedPath}${normalizedSearch ? `?${normalizedSearch}` : ''}`;
  } catch {
    return unwrapped;
  }
}

function isKnownSkuDuplicateHost(hostname: string): boolean {
  const normalizedHost = String(hostname || '').trim().toLowerCase();
  if (!normalizedHost) return false;
  if (KNOWN_SKU_DUPLICATE_HOSTS.has(normalizedHost)) return true;
  for (const host of KNOWN_SKU_DUPLICATE_HOSTS) {
    if (normalizedHost.endsWith(`.${host}`)) return true;
  }
  return false;
}

function normalizeKnownSkuFilename(filename: string): string {
  if (!filename) return filename;
  const matched = filename.match(SKU_FILENAME_NORMALIZE_RE);
  if (!matched) return filename;
  return `${matched[1]}${matched[2]}`;
}

function normalizeImagePathForDedupe(args: {
  pathname: string;
  hostname: string;
  isAbsoluteHttp: boolean;
}): string {
  const pathname = String(args.pathname || '');
  if (!pathname) return pathname;
  if (!args.isAbsoluteHttp || !isKnownSkuDuplicateHost(args.hostname)) return pathname;

  const segments = pathname.split('/');
  if (!segments.length) return pathname;
  const lastIndex = segments.length - 1;
  const normalizedFilename = normalizeKnownSkuFilename(segments[lastIndex] || '');
  if (!normalizedFilename || normalizedFilename === segments[lastIndex]) return pathname;
  segments[lastIndex] = normalizedFilename;
  return segments.join('/');
}

function normalizeMediaGalleryModule(module: Module): Module {
  if (module?.type !== 'media_gallery' || !isRecord(module.data)) return module;
  const items = Array.isArray(module.data.items) ? module.data.items : [];
  if (!items.length) return module;

  const seenImageKeys = new Set<string>();
  const normalizedItems: unknown[] = [];
  for (const item of items) {
    if (!isRecord(item)) {
      normalizedItems.push(item);
      continue;
    }
    if (String(item.type || '').trim().toLowerCase() === 'video') {
      normalizedItems.push(item);
      continue;
    }
    const dedupeKey = buildImageDedupeKey(item.url);
    if (dedupeKey && seenImageKeys.has(dedupeKey)) {
      continue;
    }
    if (dedupeKey) {
      seenImageKeys.add(dedupeKey);
    }
    const normalizedUrl = normalizePdpImageUrl(item.url);
    if (!normalizedUrl || normalizedUrl === item.url) {
      normalizedItems.push(item);
      continue;
    }
    normalizedItems.push({
      ...item,
      url: normalizedUrl,
    });
  }

  return {
    ...module,
    data: {
      ...module.data,
      items: normalizedItems,
    },
  };
}

function normalizeRecommendationsModule(module: Module): Module {
  if (module?.type !== 'recommendations' || !isRecord(module.data)) return module;
  const items = Array.isArray(module.data.items) ? module.data.items : [];
  if (!items.length) return module;

  const normalizedItems = items.map((item) => {
    if (!isRecord(item)) return item;
    const normalizedImage = normalizePdpImageUrl(item.image_url);
    if (!normalizedImage || normalizedImage === item.image_url) return item;
    return {
      ...item,
      image_url: normalizedImage,
    };
  });

  return {
    ...module,
    data: {
      ...module.data,
      items: normalizedItems,
    },
  };
}

function normalizeReviewsModule(module: Module): Module {
  if (module?.type !== 'reviews_preview' || !isRecord(module.data)) return module;
  const previewItems = Array.isArray(module.data.preview_items) ? module.data.preview_items : [];
  if (!previewItems.length) return module;

  const normalizedPreviewItems = previewItems.map((review) => {
    if (!isRecord(review)) return review;
    const mediaItems = Array.isArray(review.media) ? review.media : [];
    if (!mediaItems.length) return review;
    const normalizedMediaItems = mediaItems.map((media) => {
      if (!isRecord(media)) return media;
      const normalizedUrl = normalizePdpImageUrl(media.url);
      if (!normalizedUrl || normalizedUrl === media.url) return media;
      return {
        ...media,
        url: normalizedUrl,
      };
    });
    return {
      ...review,
      media: normalizedMediaItems,
    };
  });

  return {
    ...module,
    data: {
      ...module.data,
      preview_items: normalizedPreviewItems,
    },
  };
}

function normalizePdpPayloadImages(payload: PDPPayload): PDPPayload {
  const product = isRecord(payload.product) ? (payload.product as Record<string, any>) : null;
  const normalizedProduct = product
    ? {
        ...product,
        ...(normalizePdpImageUrl(product.image_url)
          ? { image_url: normalizePdpImageUrl(product.image_url) }
          : {}),
        ...(Array.isArray(product.images)
          ? {
              images: product.images.map((image) => {
                const normalizedImage = normalizePdpImageUrl(image);
                return normalizedImage || image;
              }),
            }
          : {}),
        ...(Array.isArray(product.variants)
          ? {
              variants: product.variants.map((variant) => {
                if (!isRecord(variant)) return variant;
                const normalizedVariantImage = normalizePdpImageUrl(variant.image_url);
                const normalizedVariantLabel = normalizePdpImageUrl(variant.label_image_url);
                return {
                  ...variant,
                  ...(normalizedVariantImage ? { image_url: normalizedVariantImage } : {}),
                  ...(normalizedVariantLabel ? { label_image_url: normalizedVariantLabel } : {}),
                };
              }),
            }
          : {}),
      }
    : payload.product;

  const modules = Array.isArray(payload.modules)
    ? payload.modules.map((module) =>
        normalizeReviewsModule(normalizeRecommendationsModule(normalizeMediaGalleryModule(module))),
      )
    : payload.modules;

  return {
    ...payload,
    product: normalizedProduct as PDPPayload['product'],
    modules: modules as PDPPayload['modules'],
  };
}

function getModule(response: GetPdpV2Response, type: string): any | null {
  const modules = Array.isArray(response?.modules) ? response.modules : [];
  return modules.find((m) => m && typeof m === 'object' && m.type === type) || null;
}

function upsertPayloadModule(payload: PDPPayload, nextModule: Module): PDPPayload {
  const modules = Array.isArray(payload.modules) ? payload.modules : [];
  const filtered = modules.filter((m) => m?.type !== nextModule.type);
  return {
    ...payload,
    modules: [...filtered, nextModule],
  };
}

export function mapPdpV2ToPdpPayload(response: GetPdpV2Response): PDPPayload | null {
  if (!response || typeof response !== 'object') return null;

  const canonical = getModule(response, 'canonical');
  const canonicalData = isRecord(canonical?.data) ? canonical.data : null;
  const pdpPayloadRaw = canonicalData?.pdp_payload;
  if (!isRecord(pdpPayloadRaw)) return null;

  const base = pdpPayloadRaw as unknown as PDPPayload;
  let next: PDPPayload = normalizePdpPayloadImages({
    ...base,
    product: { ...(base.product as any) },
    modules: Array.isArray(base.modules) ? [...base.modules] : [],
    actions: Array.isArray(base.actions) ? [...base.actions] : [],
  });

  const subject = isRecord(response.subject) ? response.subject : null;
  const subjectGroupId =
    subject && String(subject.type || '').trim().toLowerCase() === 'product_group'
      ? String(subject.id || '').trim()
      : '';

  const canonicalGroupId =
    canonicalData && typeof canonicalData.product_group_id === 'string'
      ? canonicalData.product_group_id.trim()
      : '';

  const productGroupId = canonicalGroupId || subjectGroupId;
  if (productGroupId) {
    next.product_group_id = productGroupId;
  }

  const offersModule = getModule(response, 'offers');
  const offersData = isRecord(offersModule?.data) ? offersModule.data : null;
  if (offersData) {
    const offers = Array.isArray(offersData.offers) ? offersData.offers : null;
    next = {
      ...next,
      ...(offers ? { offers } : {}),
      ...(offersData.offers_count != null ? { offers_count: Number(offersData.offers_count) || 0 } : {}),
      ...(typeof offersData.default_offer_id === 'string' ? { default_offer_id: offersData.default_offer_id } : {}),
      ...(typeof offersData.best_price_offer_id === 'string' ? { best_price_offer_id: offersData.best_price_offer_id } : {}),
    };

    if (!next.offers_count && Array.isArray(next.offers)) {
      next.offers_count = next.offers.length;
    }

    const offersGroupId =
      typeof offersData.product_group_id === 'string' ? offersData.product_group_id.trim() : '';
    if (offersGroupId && !next.product_group_id) {
      next.product_group_id = offersGroupId;
    }
  }

  const reviewsModule = getModule(response, 'reviews_preview');
  const reviewsData = isRecord(reviewsModule?.data) ? (reviewsModule.data as ReviewsPreviewData) : null;
  if (reviewsData) {
    next = upsertPayloadModule(next, {
      module_id: 'reviews_preview',
      type: 'reviews_preview',
      priority: 50,
      title: 'Reviews',
      data: reviewsData,
    });
  } else if (reviewsModule) {
    // If the server returned the module but data is unavailable, keep a stable UI section.
    next = upsertPayloadModule(next, {
      module_id: 'reviews_preview',
      type: 'reviews_preview',
      priority: 50,
      title: 'Reviews',
      data: {
        scale: 5,
        rating: 0,
        review_count: 0,
      },
    });
  }

  const similarModule = getModule(response, 'similar');
  const similarData = isRecord(similarModule?.data) ? (similarModule.data as RecommendationsData) : null;
  if (similarData) {
    next = upsertPayloadModule(next, {
      module_id: 'recommendations',
      type: 'recommendations',
      priority: 90,
      title: 'Similar',
      data: similarData,
    });
    next.x_recommendations_state = 'ready';
  } else if (similarModule) {
    // The caller explicitly requested Similar; render an empty section instead of hiding it.
    next.x_recommendations_state = 'ready';
  }

  return next;
}
