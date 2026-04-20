import type { GetPdpV2Response } from '@/lib/api';
import type {
  ActiveIngredientsData,
  HowToUseData,
  IngredientsInciData,
  Module,
  PDPPayload,
  ProductIntelData,
  ProductDetailsData,
  RecommendationsData,
  ReviewsPreviewData,
} from '@/features/pdp/types';
import {
  buildPdpImageDedupeKey,
  normalizePdpImageUrl,
} from '@/features/pdp/utils/pdpImageUrls';

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeMediaGalleryModule(module: Module): Module {
  if (module?.type !== 'media_gallery' || !isRecord(module.data)) return module;
  const items = Array.isArray(module.data.items) ? module.data.items : [];
  const previewItems = Array.isArray(module.data.preview_items) ? module.data.preview_items : [];
  if (!items.length && !previewItems.length) return module;

  const normalizeItems = (input: unknown[]) => {
    const seenImageKeys = new Set<string>();
    const normalizedItems: unknown[] = [];
    for (const item of input) {
      if (!isRecord(item)) {
        normalizedItems.push(item);
        continue;
      }
      if (String(item.type || '').trim().toLowerCase() === 'video') {
        normalizedItems.push(item);
        continue;
      }
      const dedupeKey = buildPdpImageDedupeKey(item.url);
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
    return normalizedItems;
  };

  return {
    ...module,
    data: {
      ...module.data,
      items: normalizeItems(items),
      ...(previewItems.length ? { preview_items: normalizeItems(previewItems) } : {}),
    },
  };
}

function normalizeRecommendationsModule(module: Module): Module {
  if (module?.type !== 'recommendations' || !isRecord(module.data)) return module;
  const items = Array.isArray(module.data.items) ? module.data.items : [];
  if (!items.length) return module;

  const normalizedItems = items.map((item) => {
    if (!isRecord(item)) {
      return item;
    }
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
  const normalizePreviewItems = (previewItems: unknown[]) =>
    previewItems.map((review) => {
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
  const previewItems = Array.isArray(module.data.preview_items) ? module.data.preview_items : [];
  const scopedSummaries =
    isRecord(module.data.scoped_summaries) ? module.data.scoped_summaries : null;
  if (!previewItems.length && !scopedSummaries) return module;

  const normalizedScopedSummaries = scopedSummaries
    ? Object.entries(scopedSummaries).reduce<Record<string, unknown>>((acc, [key, value]) => {
        if (!isRecord(value)) {
          acc[key] = value;
          return acc;
        }
        const scopedPreviewItems = Array.isArray(value.preview_items) ? value.preview_items : [];
        acc[key] = {
          ...value,
          ...(scopedPreviewItems.length
            ? { preview_items: normalizePreviewItems(scopedPreviewItems) }
            : {}),
        };
        return acc;
      }, {})
    : null;

  return {
    ...module,
    data: {
      ...module.data,
      ...(previewItems.length ? { preview_items: normalizePreviewItems(previewItems) } : {}),
      ...(normalizedScopedSummaries ? { scoped_summaries: normalizedScopedSummaries } : {}),
    },
  };
}

function normalizeImageBearingModule(module: Module): Module {
  return normalizeReviewsModule(normalizeRecommendationsModule(normalizeMediaGalleryModule(module)));
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
    ? payload.modules.map((module) => normalizeImageBearingModule(module))
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

const CANONICAL_PASSTHROUGH_MODULE_TYPES: ReadonlyArray<Module['type']> = [
  'media_gallery',
  'price_promo',
  'variant_selector',
  'product_overview',
  'supplemental_details',
  'product_facts',
  'materials',
  'product_specs',
  'care_instructions',
  'size_fit',
  'usage_safety',
  'ingredients_inci',
  'active_ingredients',
  'how_to_use',
];

const RESPONSE_OWNED_MODULE_TYPES = new Set<string>([
  'product_intel',
  'recommendations',
  'reviews_preview',
  'similar',
]);

function sanitizeCanonicalModules(modules: unknown): Module[] {
  if (!Array.isArray(modules)) return [];
  return modules.filter((module) => {
    if (!isRecord(module)) return true;
    return !RESPONSE_OWNED_MODULE_TYPES.has(String(module.type || '').trim());
  }) as Module[];
}

function normalizeOfferDisplayName(offer: unknown): any {
  if (!isRecord(offer)) return offer;
  const merchantId = String(offer.merchant_id || offer.merchantId || '').trim().toLowerCase();
  const rawCandidates = [
    offer.store_name,
    offer.storeName,
    offer.merchant_name,
    offer.merchantName,
    offer.seller_name,
    offer.sellerName,
  ];
  let displayName = rawCandidates
    .map((value) => String(value || '').trim())
    .find((value) => {
      if (!value) return false;
      const normalized = value.toLowerCase();
      if (merchantId && normalized === merchantId) return false;
      if (['external_seed', 'external seed', 'merchant', 'seller', 'store'].includes(normalized)) {
        return false;
      }
      if (/^merch_[a-z0-9_]+$/.test(normalized)) return false;
      return true;
    });
  if (!displayName || displayName === offer.merchant_name) return offer;
  return {
    ...offer,
    merchant_name: displayName,
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
    modules: sanitizeCanonicalModules(base.modules),
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
  if (typeof canonicalData?.sellable_item_group_id === 'string' && canonicalData.sellable_item_group_id.trim()) {
    next.sellable_item_group_id = canonicalData.sellable_item_group_id.trim();
  }
  if (typeof canonicalData?.product_line_id === 'string' && canonicalData.product_line_id.trim()) {
    next.product_line_id = canonicalData.product_line_id.trim();
  }
  if (typeof canonicalData?.review_family_id === 'string' && canonicalData.review_family_id.trim()) {
    next.review_family_id = canonicalData.review_family_id.trim();
  }
  if (Number.isFinite(Number(canonicalData?.identity_confidence))) {
    next.identity_confidence = Number(canonicalData.identity_confidence);
  }
  if (Array.isArray(canonicalData?.match_basis)) {
    next.match_basis = canonicalData.match_basis
      .map((item: unknown) => String(item || '').trim())
      .filter(Boolean);
  }
  if (typeof canonicalData?.canonical_scope === 'string' && canonicalData.canonical_scope.trim()) {
    next.canonical_scope = canonicalData.canonical_scope.trim();
  }
  for (const [sourceKey, targetKey] of [
    ['pdp_content_source', 'pdp_content_source'],
    ['offer_source', 'offer_source'],
    ['commerce_source', 'commerce_source'],
    ['content_review_state', 'content_review_state'],
  ] as const) {
    const value = canonicalData?.[sourceKey];
    if (typeof value === 'string' && value.trim()) {
      (next as any)[targetKey] = value.trim();
    }
  }
  for (const [sourceKey, targetKey] of [
    ['canonical_product_ref', 'canonical_product_ref'],
    ['selected_commerce_ref', 'selected_commerce_ref'],
    ['content_base_ref', 'content_base_ref'],
    ['canonical_payload_product_ref', 'canonical_payload_product_ref'],
  ] as const) {
    const value = canonicalData?.[sourceKey];
    if (isRecord(value)) {
      (next as any)[targetKey] = value;
    }
  }
  if (typeof canonicalData?.pdp_schema_profile === 'string' && canonicalData.pdp_schema_profile.trim()) {
    const pdpSchemaProfile = canonicalData.pdp_schema_profile.trim();
    next.pdp_schema_profile = pdpSchemaProfile;
    next.product = {
      ...next.product,
      pdp_schema_profile: pdpSchemaProfile,
    };
  } else if (typeof (base as any).pdp_schema_profile === 'string' && (base as any).pdp_schema_profile.trim()) {
    const pdpSchemaProfile = String((base as any).pdp_schema_profile).trim();
    next.pdp_schema_profile = pdpSchemaProfile;
    next.product = {
      ...next.product,
      pdp_schema_profile: next.product.pdp_schema_profile || pdpSchemaProfile,
    };
  }

  for (const moduleType of CANONICAL_PASSTHROUGH_MODULE_TYPES) {
    const moduleEntry = getModule(response, moduleType);
    if (!isRecord(moduleEntry?.data)) continue;
    next = upsertPayloadModule(next, normalizeImageBearingModule({
      module_id:
        typeof moduleEntry.module_id === 'string' && moduleEntry.module_id.trim()
          ? moduleEntry.module_id
          : moduleType,
      type: moduleType,
      priority: Number(moduleEntry.priority) || 0,
      ...(typeof moduleEntry.title === 'string' && moduleEntry.title.trim()
        ? { title: moduleEntry.title }
        : {}),
      data: moduleEntry.data,
    }));
  }

  const offersModule = getModule(response, 'offers');
  const offersData = isRecord(offersModule?.data) ? offersModule.data : null;
  if (offersData) {
    const offers = Array.isArray(offersData.offers)
      ? offersData.offers.map((offer: unknown) => normalizeOfferDisplayName(offer))
      : null;
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

  const productIntelModule = getModule(response, 'product_intel');
  const productIntelData = isRecord(productIntelModule?.data)
    ? (productIntelModule.data as ProductIntelData)
    : null;
  if (productIntelData) {
    const displayName =
      typeof productIntelData.display_name === 'string' && productIntelData.display_name.trim()
        ? productIntelData.display_name.trim()
        : 'Pivota Insights';
    next = upsertPayloadModule(next, {
      module_id: 'product_intel',
      type: 'product_intel',
      priority: 65,
      title: displayName,
      data: productIntelData,
    });
  }

  const structuredModules = [
    {
      responseType: 'variant_selector',
      module_id: 'variant_selector',
      type: 'variant_selector' as const,
      priority: 35,
      title: 'Variants',
    },
    {
      responseType: 'active_ingredients',
      module_id: 'active_ingredients',
      type: 'active_ingredients' as const,
      priority: 40,
      title: 'Active Ingredients',
    },
    {
      responseType: 'ingredients_inci',
      module_id: 'ingredients_inci',
      type: 'ingredients_inci' as const,
      priority: 41,
      title: 'Ingredients (INCI)',
    },
    {
      responseType: 'how_to_use',
      module_id: 'how_to_use',
      type: 'how_to_use' as const,
      priority: 42,
      title: 'How to Use',
    },
    {
      responseType: 'materials',
      module_id: 'materials',
      type: 'materials' as const,
      priority: 44,
      title: 'Materials',
    },
    {
      responseType: 'product_specs',
      module_id: 'product_specs',
      type: 'product_specs' as const,
      priority: 45,
      title: 'Specifications',
    },
    {
      responseType: 'size_fit',
      module_id: 'size_fit',
      type: 'size_fit' as const,
      priority: 46,
      title: 'Size & Fit',
    },
    {
      responseType: 'care_instructions',
      module_id: 'care_instructions',
      type: 'care_instructions' as const,
      priority: 47,
      title: 'Care',
    },
    {
      responseType: 'usage_safety',
      module_id: 'usage_safety',
      type: 'usage_safety' as const,
      priority: 48,
      title: 'Usage & Safety',
    },
    {
      responseType: 'product_overview',
      module_id: 'product_overview',
      type: 'product_overview' as const,
      priority: 45,
      title: 'Product Overview',
    },
    {
      responseType: 'supplemental_details',
      module_id: 'supplemental_details',
      type: 'supplemental_details' as const,
      priority: 49,
      title: 'More Details',
    },
  ] as const;

  for (const moduleSpec of structuredModules) {
    const responseModule = getModule(response, moduleSpec.responseType);
    const responseData = isRecord(responseModule?.data) ? responseModule.data : null;
    if (!responseData) continue;
    next = upsertPayloadModule(next, normalizeImageBearingModule({
      module_id: moduleSpec.module_id,
      type: moduleSpec.type,
      priority: moduleSpec.priority,
      title: moduleSpec.title,
      data: responseData as
        | ActiveIngredientsData
        | IngredientsInciData
        | HowToUseData
        | ProductDetailsData
        | Record<string, unknown>,
    }));
  }

  const reviewsModule = getModule(response, 'reviews_preview');
  const reviewsData = isRecord(reviewsModule?.data) ? (reviewsModule.data as ReviewsPreviewData) : null;
  if (reviewsData) {
    next = upsertPayloadModule(next, normalizeImageBearingModule({
      module_id: 'reviews_preview',
      type: 'reviews_preview',
      priority: 50,
      title: 'Reviews',
      data: reviewsData,
    }));
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
    next = upsertPayloadModule(next, normalizeImageBearingModule({
      module_id: 'recommendations',
      type: 'recommendations',
      priority: 90,
      title: 'Similar',
      data: similarData,
    }));
    next.x_recommendations_state = 'ready';
  } else if (similarModule) {
    // The caller explicitly requested Similar; render an empty section instead of hiding it.
    next.x_recommendations_state = 'ready';
  }

  return next;
}
