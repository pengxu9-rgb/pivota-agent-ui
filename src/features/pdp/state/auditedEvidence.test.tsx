import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { MediaItem, PDPPayload, ReviewsPreviewData } from '../types';
import contractFixture from '../__fixtures__/contracts/agentMediaEvidence.json';
import { publicMediaProvenance } from './customerMedia';
import { publicEvidenceUrl, publicEvidenceTimestamp } from '../utils/publicEvidence';
import timy from '../__fixtures__/auditedLive/ssr-pdp-payload.json';
import directTimy from '../__fixtures__/auditedLive/reused-direct-canonical-payload.json';
import moogoo from '../__fixtures__/auditedLive/moogoo-fullcream-ssr-pdp.json';
import { customerMediaSubject, selectCustomerMedia, isEligibleCustomerMedia } from './customerMedia';
import { normalizeReviewAvailability } from './reviewAvailability';
import { BeautyCustomerPhotos } from '../components/BeautyCustomerPhotos';
import { BeautyReviewsPreview } from '../components/BeautyReviewsPreview';
import { PdpSourceBadge } from '../sections/PdpSourceBadge';
import { mapPdpV2ToPdpPayload } from '../adapter/mapPdpV2ToPdpPayload';
import { projectPublicInsightsPayload } from '../utils/publicProductIntel';
import { retailerReselectionNotice } from '../utils/retailerHandoff';
import { initialContentModuleStates, completedContentModuleStates, mergeContentPdpPayload, sameContentIdentity } from './contentHydration';

const payload = (value: unknown) => structuredClone(value) as PDPPayload;
const response = (p: PDPPayload, modules: any[] = []) => ({ modules: [{ type: 'canonical', data: { pdp_payload: p } }, ...p.modules.filter((module) => ['reviews_preview', 'product_intel'].includes(module.type) && !modules.some((replacement) => replacement.type === module.type)), ...modules] }) as any;
const review = (p: PDPPayload) => p.modules.find((module) => module.type === 'reviews_preview')!.data as ReviewsPreviewData;
const subject = customerMediaSubject(payload(timy));
const buyer: MediaItem = { type: 'image', url: 'https://example.com/buyer.jpg', role: 'customer_review', provenance: {
  source_type: 'customer_review', review_id: 'review-1', verification_status: 'review_linked', moderation_status: 'active',
  scope: 'exact_item', product_id: subject.exactItemRefs[1].productId, merchant_id: subject.exactItemRefs[1].merchantId, source_url: 'https://example.com/review/1',
} };
afterEach(cleanup);

describe('audited PDP evidence regressions', () => {
  it.each([['Then I Met You', timy], ['MooGoo Full Cream', moogoo]])('%s official gallery never becomes customer evidence', (_, fixture) => {
    const p = mapPdpV2ToPdpPayload(response(payload(fixture)))!;
    expect(selectCustomerMedia(review(p), customerMediaSubject(p))).toEqual([]);
    const official = p.modules.find((module) => module.type === 'media_gallery')!.data as { items: MediaItem[] };
    expect(official.items.length).toBeGreaterThan(0);
    render(<BeautyCustomerPhotos photos={official.items} />);
    expect(screen.getByText('No customer photos available yet.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('accepts exactly one buyer asset from the actual Agent builder synthetic contract output', () => {
    const p = mapPdpV2ToPdpPayload(contractFixture as any)!;
    const items = selectCustomerMedia(review(p), customerMediaSubject(p));
    expect(items).toHaveLength(1);
    expect(items[0].role).toBe('customer_review');
    expect(items[0].provenance?.review_id).toBeTruthy();
    expect(items[0].provenance?.source_record_id).toBeTruthy();
    // No source capture date exists in this synthetic input; never invent one from review creation.
    expect(items[0].provenance?.source_observed_at).toBeUndefined();
    expect(items[0].url).not.toContain('official');
  });

  it('bounds per-asset provenance, dates and credential-bearing source URLs', () => {
    expect(publicEvidenceUrl('https://username:secret@example.com/source')).toBeUndefined();
    expect(publicEvidenceUrl('javascript:alert(1)')).toBeUndefined();
    expect(publicEvidenceTimestamp('not-a-date')).toBeUndefined();
    expect(publicMediaProvenance({ ...buyer.provenance, source_record_id: 'source-1', source_observed_at: '2026-10-04T00:00:00Z',
      source_url: 'https://username:secret@example.com/source', raw: 'private', reviewer_notes: 'private' })).toEqual({
      ...buyer.provenance, source_url: undefined, source_record_id: 'source-1', source_observed_at: '2026-10-04T00:00:00.000Z',
    });
  });

  it('retains bounded review origin through API adapter, public projection and media strip', () => {
    const p = payload(timy);
    const data = review(p);
    data.preview_items = [{ review_id: 'review-1', rating: 4, text_snippet: 'Review', media: [{ ...buyer,
      provenance: { ...buyer.provenance, raw: 'PRIVATE', operator_notes: 'PRIVATE' } as any }] }];
    const mapped = mapPdpV2ToPdpPayload(response(p))!;
    const items = selectCustomerMedia(review(mapped), customerMediaSubject(mapped));
    expect(items).toHaveLength(1);
    expect(items[0].provenance).toEqual(buyer.provenance);
    expect(JSON.stringify(projectPublicInsightsPayload(mapped))).not.toContain('PRIVATE');
    render(<BeautyCustomerPhotos photos={items} />);
    expect(screen.getByRole('button', { name: 'Customer review photo · exact item 1' })).toBeInTheDocument();
    expect(screen.getByText('· 1 available')).toBeInTheDocument();
  });

  it.each([
    { role: 'official_product' }, { provenance: undefined },
    { provenance: { ...buyer.provenance, source_type: 'merchant_product' } },
    { provenance: { ...buyer.provenance, moderation_status: 'pending' } },
    { provenance: { ...buyer.provenance, verification_status: 'unknown' } },
    { provenance: { ...buyer.provenance, product_id: 'other-product' } },
    { provenance: { ...buyer.provenance, merchant_id: 'other-merchant' } },
    { provenance: { ...buyer.provenance, scope: 'review_group' } },
    { provenance: { ...buyer.provenance, scope: 'product_line', review_family_id: 'other-family' } },
  ])('rejects ambiguous, withheld and mismatched buyer provenance %j', (patch) => {
    expect(isEligibleCustomerMedia({ ...buyer, ...patch }, subject, 'review-1')).toBe(false);
  });

  it('requires the asset to match its enclosing review; family-scoped content is explicit', () => {
    expect(isEligibleCustomerMedia(buyer, subject, 'another-review')).toBe(false);
    const family = { ...buyer, provenance: { ...buyer.provenance, scope: 'product_line', review_family_id: subject.reviewFamilyId } };
    expect(isEligibleCustomerMedia(family, subject, 'review-1')).toBe(true);
  });

  it('legacy served zeros and missing/error reviews remain unknown, verified empty stays zero', () => {
    for (const fixture of [timy, moogoo]) expect(normalizeReviewAvailability(review(payload(fixture))).review_count).toBeNull();
    expect(normalizeReviewAvailability({ scale: 5, rating: 0, review_count: 0, availability_state: 'empty' }).review_count).toBe(0);
    expect(normalizeReviewAvailability({ scale: 5, rating: 4, review_count: 10, availability_state: 'error' }).review_count).toBeNull();
    const mapped = mapPdpV2ToPdpPayload(response(payload(timy), [{ type: 'reviews_preview', data: null }]))!;
    expect(review(mapped).rating).toBeNull();
    render(<BeautyReviewsPreview reviewCount={null} rating={null} reviews={[]} />);
    expect(screen.getByText(/Review information is unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/No reviews yet/)).not.toBeInTheDocument();
  });

  it('shows safe source provenance and does not link unsafe schemes', () => {
    render(<PdpSourceBadge sourceOrigin="pdp_section" sourceQualityStatus="authoritative" sourceUrl="https://moogoousa.com/products/full-cream-moisturizer" capturedAt="2026-10-04T00:00:00Z" />);
    expect(screen.getByRole('link', { name: 'Merchant product page' })).toHaveAttribute('href', 'https://moogoousa.com/products/full-cream-moisturizer');
    expect(screen.getByText(/observed 2026-10-04/)).toBeInTheDocument();
  });

  it('uses the selected merchant variant currency and never borrows unmatched own money', () => {
    const p = payload(moogoo), selected = p.product.variants[2];
    const offer: any = { offer_id: 'other', merchant_id: 'm_eu', price: { amount: 30, currency: 'EUR' },
      variants: [{ ...selected, variant_id: 'eu_500', sku_id: 'eu_sku', price: { current: { amount: 26, currency: 'EUR' } } }] };
    const notice = retailerReselectionNotice(p.product, selected, offer)!;
    expect(notice).toContain('EUR 26.00');
    expect(notice).toContain('eu_500');
    expect(notice).not.toContain('USD');
    offer.variants = [];
    const unconfirmed = retailerReselectionNotice(p.product, selected, offer)!;
    expect(unconfirmed).toContain('retailer variant unconfirmed');
    expect(unconfirmed).not.toContain('Expected item price');
    selected.current_own_offer_status = 'unavailable';
    expect(retailerReselectionNotice(p.product, selected)).not.toContain('Expected item price');
  });

  it('warns about each exact MooGoo selection without fabricating a variant URL', () => {
    const p = payload(moogoo);
    const options = [['45890202206515', 'USD 11.90'], ['45890202239283', 'USD 14.90'], ['45890202272051', 'USD 28.90']];
    for (const [id, money] of options) {
      const variant = p.product.variants.find((variant) => variant.variant_id === id)!;
      const notice = retailerReselectionNotice(p.product, variant)!;
      expect(notice).toContain(id);
      expect(notice).toContain(money);
      expect(notice).toMatch(/Reselect/);
      expect(notice).not.toContain('?variant=');
    }
    expect(p.product.external_redirect_url).toBe('https://moogoousa.com/products/full-cream-moisturizer');
  });
});

describe('independent, identity-scoped content hydration', () => {
  it('intel presence does not complete missing materials, safety or unknown reviews', () => {
    const states = initialContentModuleStates(payload(timy));
    expect(states.product_intel).toBe('ready');
    expect(states.materials).toBe('not_fetched');
    expect(states.usage_safety).toBe('not_fetched');
    expect(states.reviews_preview).toBe('unavailable');
  });

  it('does not confuse pre-projection presence with delivered content', () => {
    const p = payload(directTimy);
    p.x_content_module_states = { product_intel: { state: 'ready' } };
    expect(initialContentModuleStates(p).product_intel).toBe('not_fetched');
    expect(completedContentModuleStates(['product_intel'], p, { modules: [] } as any).product_intel).toBe('unavailable');
  });

  it('preserves the additive graph read contract in mapped recommendation metadata', () => {
    const metadata = { relationship_graph_read_status: 'unavailable', relationship_graph_read_reason: 'schema_unavailable', edge_count_semantics: 'returned_eligible_edges' };
    const p = mapPdpV2ToPdpPayload(response(payload(timy), [{ type: 'similar', data: { items: [], metadata } }]))!;
    expect((p.modules.find((module) => module.type === 'recommendations')!.data as any).metadata).toEqual(metadata);
  });

  it('keeps an explicit empty review result distinct from unavailable', () => {
    const current = payload(timy), incoming = payload(directTimy);
    const next = mergeContentPdpPayload(current, incoming, ['reviews_preview'], { reviews_preview: 'empty' });
    expect(review(next).availability_state).toBe('empty');
    expect(review(next).review_count).toBe(0);
  });

  it('accepts the audited narrow canonical identity without optional refs; never overwrites commerce', () => {
    const current = payload(timy), incoming = payload(directTimy);
    const next = mergeContentPdpPayload(current, incoming);
    expect(sameContentIdentity(current, incoming)).toBe(true);
    expect(next.product.price).toEqual(current.product.price);
    expect(next.product.variants).toBe(current.product.variants);
    expect(next.offers).toEqual(current.offers);
    expect(next.default_offer_id).toEqual(current.default_offer_id);
  });

  it.each(['merchant', 'product', 'variant', 'family', 'group', 'contentRef'])('rejects a stale or wrong %s identity', (kind) => {
    const current = payload(timy), incoming = payload(timy);
    if (kind === 'merchant') incoming.product.merchant_id = 'other';
    if (kind === 'product') incoming.product.product_id = 'other';
    if (kind === 'variant') incoming.product.default_variant_id = 'other';
    if (kind === 'family') incoming.review_family_id = 'other';
    if (kind === 'group') incoming.product_group_id = 'other';
    if (kind === 'contentRef') incoming.content_base_ref = { product_id: 'other' };
    expect(mergeContentPdpPayload(current, incoming)).toBe(current);
  });

  it('distinguishes absent/error/empty and preserves newest content plus unavailable-money protections', () => {
    const current = payload(timy), incoming = payload(timy);
    current.product.variants[0].current_own_offer_status = 'unavailable';
    current.product.variants[0].price = undefined;
    const old = current.modules.find((module) => module.type === 'ingredients_inci')!;
    old.data = { items: ['Newest'], captured_at: '2026-10-04T00:00:00Z' };
    incoming.modules.find((module) => module.type === 'ingredients_inci')!.data = { items: ['Older'], captured_at: '2026-01-01T00:00:00Z' };
    const states = completedContentModuleStates(['ingredients_inci', 'materials', 'usage_safety'], incoming,
      { modules: [{ type: 'materials', data: { sections: [] } }], missing: [{ type: 'usage_safety', reason: 'timeout' }] } as any);
    expect(states).toMatchObject({ ingredients_inci: 'ready', materials: 'empty', usage_safety: 'error' });
    const next = mergeContentPdpPayload(current, incoming, ['ingredients_inci', 'materials', 'usage_safety'], states);
    expect(next.modules.find((module) => module.type === 'ingredients_inci')!.data).toEqual(old.data);
    expect(next.product.variants[0].current_own_offer_status).toBe('unavailable');
    expect(next.product.variants[0].price).toBeUndefined();
  });
});
