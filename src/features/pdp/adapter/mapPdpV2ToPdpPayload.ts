import type { GetPdpV2Response } from '@/lib/api';
import type { Module, PDPPayload, RecommendationsData, ReviewsPreviewData } from '@/features/pdp/types';

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
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
  let next: PDPPayload = {
    ...base,
    product: { ...(base.product as any) },
    modules: Array.isArray(base.modules) ? [...base.modules] : [],
    actions: Array.isArray(base.actions) ? [...base.actions] : [],
  };

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
  }

  return next;
}
