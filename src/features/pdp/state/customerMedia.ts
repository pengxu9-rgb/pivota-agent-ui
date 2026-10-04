import type { MediaItem, MediaProvenance, PDPPayload, ReviewsPreviewData } from '../types';
import { publicEvidenceUrl, publicEvidenceTimestamp } from '../utils/publicEvidence';
import { buildPdpImageDedupeKey } from '../utils/pdpImageUrls';

export interface ProductMerchantIdentity {
  productId: string;
  merchantId: string;
}

export interface CustomerMediaSubject {
  exactItemRefs: readonly ProductMerchantIdentity[];
  reviewFamilyId?: string;
}

export function customerMediaSubject(payload: PDPPayload): CustomerMediaSubject {
  const refs = [payload.product, payload.canonical_product_ref, payload.content_base_ref,
    payload.canonical_payload_product_ref];
  const seen = new Set<string>();
  const exactItemRefs = refs.flatMap((ref): ProductMerchantIdentity[] => {
    const productId = typeof ref?.product_id === 'string' ? ref.product_id.trim() : '';
    const merchantId = typeof ref?.merchant_id === 'string' ? ref.merchant_id.trim() : '';
    // A partial reference must not borrow the current merchant's identity.
    if (!productId || !merchantId) return [];
    const key = JSON.stringify([merchantId, productId]);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ productId, merchantId }];
  });
  return { exactItemRefs, reviewFamilyId: payload.review_family_id };
}

/** Keep only bounded public asset metadata; never preserve an arbitrary dossier. */
export function publicMediaProvenance(value: unknown): MediaProvenance | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const fields = ['source_type', 'review_id', 'verification_status', 'moderation_status',
    'scope', 'product_id', 'merchant_id', 'review_family_id', 'source_url', 'captured_at', 'source_record_id', 'source_observed_at'];
  const result: Record<string, string> = {};
  for (const key of fields) {
    const text = typeof input[key] === 'string' ? input[key].trim() : '';
    if (!text || text.length > 2048) continue;
    if (key === 'source_url') { const url = publicEvidenceUrl(text); if (url) result[key] = url; continue; }
    if (key === 'source_observed_at' || key === 'captured_at') { const timestamp = publicEvidenceTimestamp(text); if (timestamp) result[key] = timestamp; continue; }
    result[key] = text;
  }
  return Object.keys(result).length ? result : undefined;
}

export function isEligibleCustomerMedia(item: MediaItem, subject?: CustomerMediaSubject, reviewId?: string): boolean {
  if (!item?.url || !['image', 'video'].includes(item.type)) return false;
  const p = item.provenance;
  if (item.role !== 'customer_review' || p?.source_type !== 'customer_review' ||
    p.verification_status !== 'review_linked' || p.moderation_status !== 'active' ||
    typeof p.review_id !== 'string' || !p.review_id.trim() || typeof p.merchant_id !== 'string' || !p.merchant_id.trim()) return false;
  if (reviewId && String(p.review_id) !== String(reviewId)) return false;
  if (p.scope !== 'exact_item' && p.scope !== 'product_line') return false;
  if (p.scope === 'exact_item' && (!p.product_id || !p.merchant_id)) return false;
  if (p.scope === 'product_line' && !p.review_family_id) return false;
  if (!subject) return true;
  if (p.scope === 'exact_item') {
    return subject.exactItemRefs.some((ref) => ref.productId === p.product_id && ref.merchantId === p.merchant_id);
  }
  return Boolean(subject.reviewFamilyId && p.review_family_id === subject.reviewFamilyId);
}

export function dedupeCustomerMedia(items: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!isEligibleCustomerMedia(item)) return false;
    const key = `${item.type}|${buildPdpImageDedupeKey(item.url) || item.url.trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function sanitizeReviewMedia(reviews: ReviewsPreviewData, subject: CustomerMediaSubject): ReviewsPreviewData {
  const sanitize = (items: ReviewsPreviewData['preview_items']) => items?.map((review) => ({
    ...review,
    media: (review.media || []).filter((item) => isEligibleCustomerMedia(item, subject, review.review_id)),
  }));
  return {
    ...reviews,
    preview_items: sanitize(reviews.preview_items),
    ...(reviews.scoped_summaries ? { scoped_summaries: Object.fromEntries(
      Object.entries(reviews.scoped_summaries).map(([key, summary]) => [key, {
        ...summary, preview_items: sanitize(summary.preview_items),
      }]),
    ) } : {}),
  };
}

export function selectCustomerMedia(reviews: ReviewsPreviewData | null, subject: CustomerMediaSubject): MediaItem[] {
  return dedupeCustomerMedia((reviews?.preview_items || []).flatMap((review) =>
    (review.media || []).filter((item) => isEligibleCustomerMedia(item, subject, review.review_id)),
  ));
}

export function customerMediaSourceLabel(item: MediaItem): string {
  return `Customer review ${item.type === 'video' ? 'video' : 'photo'}${item.provenance?.scope === 'product_line' ? ' · product line' : ' · exact item'}`;
}
