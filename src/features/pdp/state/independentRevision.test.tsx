import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PDPPayload, ReviewsPreviewData, Variant } from '../types';
import timy from '../__fixtures__/auditedLive/ssr-pdp-payload.json';
import moogoo from '../__fixtures__/auditedLive/moogoo-fullcream-ssr-pdp.json';
import { mergeContentPdpPayload, sameContentIdentity } from './contentHydration';
import { normalizeReviewAvailability } from './reviewAvailability';
import { customerMediaSubject, selectCustomerMedia } from './customerMedia';
import { mapPdpV2ToPdpPayload } from '../adapter/mapPdpV2ToPdpPayload';
import { BeautyReviewsPreview } from '../components/BeautyReviewsPreview';
import { BeautyCustomerPhotos } from '../components/BeautyCustomerPhotos';
import { confirmedRetailerSelection, retailerReselectionNotice } from '../utils/retailerHandoff';

const fixture = () => structuredClone(timy) as unknown as PDPPayload;
const getReview = (p: PDPPayload) => p.modules.find((m) => m.type === 'reviews_preview')!.data as ReviewsPreviewData & { captured_at?: string };
const setCapture = (p: PDPPayload, date: string, count: number) => Object.assign(getReview(p), {
  captured_at: date, availability_state: count ? 'ready' : 'empty', review_count: count, rating: count ? 4.7 : 0,
});
afterEach(cleanup);

describe('independent reviewer freshness regressions', () => {
  it.each(['empty', 'ready', 'error', 'unavailable', 'withheld', 'not_applicable'] as const)('rejects stale %s before data, state, source evidence or synthesis', (state) => {
    const current = fixture(), incoming = fixture();
    setCapture(current, '2026-10-04T00:00:00Z', 12);
    setCapture(incoming, '2026-01-01T00:00:00Z', 0);
    current.x_content_module_states = { reviews_preview: { state: 'ready', source_url: 'https://new.example/reviews', source_observed_at: '2026-10-04T00:00:00Z' } };
    incoming.x_content_module_states = { reviews_preview: { state, source_url: 'https://old.example/reviews', source_observed_at: '2026-01-01T00:00:00Z' } };
    const next = mergeContentPdpPayload(current, incoming, ['reviews_preview'], { reviews_preview: state });
    expect(next).toBe(current);
    expect(getReview(next).review_count).toBe(12);
    expect(next.x_content_module_states).toEqual(current.x_content_module_states);
    render(<BeautyReviewsPreview rating={getReview(next).rating} reviewCount={getReview(next).review_count} reviews={[]} />);
    expect(screen.getByText(/A review summary is available/)).toBeInTheDocument();
    expect(screen.queryByText(/No reviews available/)).not.toBeInTheDocument();
  });

  it('does not synthesize old/missing-timestamp emptiness while another module succeeds', () => {
    const current = fixture(), incoming = fixture();
    setCapture(current, '2026-10-04T00:00:00Z', 12);
    current.x_content_module_states = { reviews_preview: { state: 'ready', source_url: 'https://new.example/reviews', source_observed_at: '2026-10-04T00:00:00Z' } };
    incoming.modules = incoming.modules.filter((m) => m.type !== 'reviews_preview');
    incoming.modules.push({ module_id: 'materials', type: 'materials', priority: 1, data: { sections: [{ heading: 'Materials', content: 'Cotton' }] } });
    incoming.x_content_module_states = { reviews_preview: { state: 'empty', source_url: 'https://wrong.example/reviews' } };
    const next = mergeContentPdpPayload(current, incoming, ['reviews_preview', 'materials'], { reviews_preview: 'empty', materials: 'ready' });
    expect(getReview(next).review_count).toBe(12);
    expect(next.x_content_module_states?.reviews_preview).toEqual(current.x_content_module_states.reviews_preview);
    expect(next.modules.find((m) => m.type === 'materials')).toBeDefined();
    expect(next.product.variants).toBe(current.product.variants);
    expect(next.offers).toEqual(current.offers);
  });

  it('requires new evidence for synthesis and rejects conflicting body/state freshness', () => {
    const current = fixture(), incoming = fixture();
    setCapture(current, '2026-10-04T00:00:00Z', 12);
    setCapture(incoming, '2026-01-01T00:00:00Z', 0);
    incoming.x_content_module_states = { reviews_preview: { state: 'empty', source_observed_at: '2026-10-05T00:00:00Z' } };
    expect(mergeContentPdpPayload(current, incoming, ['reviews_preview'], { reviews_preview: 'empty' })).toBe(current);
    incoming.modules = incoming.modules.filter((m) => m.type !== 'reviews_preview');
    const next = mergeContentPdpPayload(current, incoming, ['reviews_preview'], { reviews_preview: 'empty' });
    expect(getReview(next).review_count).toBe(0);
    expect(getReview(next).availability_state).toBe('empty');
  });

  it('rejects an explicit selected variant conflicting with the current effective selection', () => {
    const current = fixture(), incoming = fixture();
    incoming.product.selected_variant_id = 'WRONG-VARIANT';
    expect(sameContentIdentity(current, incoming)).toBe(false);
    expect(mergeContentPdpPayload(current, incoming)).toBe(current);
  });
});

describe('independent reviewer merchant evidence regressions', () => {
  const product = structuredClone(moogoo).product as unknown as PDPPayload['product'];
  const selected = product.variants.find((v) => v.variant_id === '45890202272051')!;
  const seller = (row: unknown): any => ({ merchant_id: 'other-seller', price: { amount: 5, currency: 'USD' }, variants: [row] });
  const validRow = { variant_id: 'seller500', title: selected.title, options: selected.options, price: { current: { amount: 26, currency: 'EUR' } } };

  it.each([
    { ...validRow, options: [{ name: 'Size', value: '120 g' }] },
    { ...validRow, variant_id: selected.variant_id, options: [{ name: 'Size', value: '120 g' }] },
    { ...validRow, options: undefined },
    { ...validRow, options: [{ name: 'Size', value: '500 g' }, { name: 'Size', value: '120 g' }] },
    { ...validRow, price: { current: { amount: 26 } } },
    { ...validRow, price: { current: { amount: 26 }, currency: 'EUR' } },
    { ...validRow, price: { current: { amount: null, currency: 'EUR' } } },
    { ...validRow, current_own_offer_status: 'unavailable' },
  ])('does not confirm a contradictory or currency-less merchant row %j', (row) => {
    expect(confirmedRetailerSelection(product, selected, seller(row))).toBeNull();
    const notice = retailerReselectionNotice(product, selected, seller(row))!;
    expect(notice).toContain('retailer variant unconfirmed');
    expect(notice).not.toContain('Expected item price');
    expect(notice).not.toContain('seller500');
  });

  it('requires a unique complete option match and keeps explicit currency in the same tuple', () => {
    expect(confirmedRetailerSelection(product, selected, seller(validRow))).toEqual({ variantId: 'seller500', money: { amount: 26, currency: 'EUR' } });
    const duplicate = seller(validRow); duplicate.variants.push({ ...validRow, variant_id: 'another500' });
    expect(confirmedRetailerSelection(product, selected, duplicate)).toBeNull();
    expect(retailerReselectionNotice(product, selected, seller(validRow))).toContain('EUR 26.00');
    expect(retailerReselectionNotice(product, selected, seller(validRow))).not.toContain('USD');
  });
});

describe('independent reviewer identity and scoped-review regressions', () => {
  const reviewWith = (productId: string, merchantId: string): ReviewsPreviewData => ({ scale: 5, rating: 5, review_count: 1,
    preview_items: [{ review_id: 'r', rating: 5, text_snippet: 'Review', media: [{ type: 'image', url: 'https://example.com/buyer.jpg', role: 'customer_review',
      provenance: { source_type: 'customer_review', review_id: 'r', verification_status: 'review_linked', moderation_status: 'active', scope: 'exact_item', product_id: productId, merchant_id: merchantId } }] }],
  });

  it('keeps product/merchant references paired and never fills partial references', () => {
    const p = fixture(); p.product.merchant_id = 'current';
    p.content_base_ref = { product_id: 'foreignProduct', merchant_id: 'foreignMerchant' };
    p.canonical_product_ref = { product_id: 'orphanProduct' };
    const subject = customerMediaSubject(p);
    expect(selectCustomerMedia(reviewWith('foreignProduct', 'current'), subject)).toEqual([]);
    expect(selectCustomerMedia(reviewWith(p.product.product_id, 'foreignMerchant'), subject)).toEqual([]);
    expect(selectCustomerMedia(reviewWith('orphanProduct', 'current'), subject)).toEqual([]);
    expect(selectCustomerMedia(reviewWith('foreignProduct', 'foreignMerchant'), subject)).toHaveLength(1);
    render(<BeautyCustomerPhotos photos={selectCustomerMedia(reviewWith('foreignProduct', 'current'), subject)} />);
    expect(screen.queryByRole('button', { name: /Customer review photo/ })).not.toBeInTheDocument();
  });

  it('preserves independently ready family evidence when the active exact-item provider fails', () => {
    const normalized = normalizeReviewAvailability({ scale: 5, rating: 0, review_count: 0, availability_state: 'error',
      aggregation_scope: 'exact_item', scoped_summaries: {
        exact_item: { scale: 5, rating: 0, review_count: 0, availability_state: 'error' },
        product_line: { scale: 5, rating: 4.7, review_count: 20, availability_state: 'ready' },
      } });
    expect(normalized.review_count).toBeNull();
    expect(normalized.scoped_summaries?.exact_item.review_count).toBeNull();
    expect(normalized.scoped_summaries?.product_line.review_count).toBe(20);
    const denied = normalizeReviewAvailability({ ...normalized, availability_state: 'withheld' });
    expect(denied.scoped_summaries?.product_line.review_count).toBeNull();
  });

  it('does not restore raw scoped zeros after API normalization', () => {
    const p = fixture();
    const data: ReviewsPreviewData = { scale: 5, rating: 4.7, review_count: 20, availability_state: 'ready', scoped_summaries: {
      exact_item: { scale: 5, rating: 0, review_count: 0, availability_state: 'unavailable', preview_items: [] },
      product_line: { scale: 5, rating: 4.7, review_count: 20, availability_state: 'ready', preview_items: [] },
    } };
    const mapped = mapPdpV2ToPdpPayload({ modules: [{ type: 'canonical', data: { pdp_payload: p } }, { type: 'reviews_preview', data }] } as any)!;
    expect(getReview(mapped).scoped_summaries?.exact_item.review_count).toBeNull();
    expect(getReview(mapped).scoped_summaries?.product_line.review_count).toBe(20);
  });
});
