import { describe, it, expect, vi } from 'vitest';
import { evaluateProduct } from './decision';
import { deriveBrief, newShoppingTask, type DecisionReport } from './model';
import { runShoppingTurn } from './runShoppingTurn';
import { refreshDecisionReport, MAX_EVIDENCE_AGE_MS } from './evidenceFreshness';
import { migrateChatState } from '@/store/chatStore';

const product = { product_id: 'a', merchant_id: 'seller-a', title: 'Alpha Moisturizer', description: '', in_stock: true, price: 11, currency: 'USD' };
const brief = deriveBrief('Find fragrance-free moisturizer under $30');
const observed = '2026-10-04T00:00:00Z';
const now = new Date('2026-10-04T05:00:00Z');
const ingredient = { raw_text: 'Water, Glycerin', items: ['Water', 'Glycerin'], is_complete: true, fragrance_free_claim: 'Fragrance-free', source_url: 'https://retailer.example/a', source_observed_at: observed };
const response = (data: any = ingredient, overrides: any = {}) => ({ status: 'success', modules: [{ type: 'canonical', data: { pdp_payload: { product, modules: [{ type: 'ingredients_inci', data }], ...overrides } } }] });
const checked = () => evaluateProduct(product, response(), brief, now);
const report = (): DecisionReport => ({ summary: '1 product has sourced fragrance-free evidence.', items: [checked()], compared: true, fragranceRequired: true });

describe('affirmative, complete, available ingredient evidence', () => {
  it.each(['Not fragrance-free', 'This product is not fragrance-free', 'Fragrance-free is not verified', 'May be fragrance-free', 'Fragrance-free?', 'Not certified fragrance-free', 'I cannot confirm fragrance-free', 'Fragrance-free or scented', 'Not always fragrance-free'])('does not verify non-affirmative claim %s', (claim) => {
    expect(evaluateProduct(product, response({ ...ingredient, fragrance_free_claim: claim }), brief, now).fragrance).not.toBe('verified');
  });
  it.each(['unavailable', 'error', 'not_captured', 'not_requested', 'partial', 'loading', 'unknown'])('does not verify explicit %s module state', (state) => {
    expect(evaluateProduct(product, response(ingredient, { x_content_module_states: { ingredients_inci: state } }), brief, now).fragrance).not.toBe('verified');
  });
  it.each([{ authority_scope: 'reviewed_key_ingredients_not_full_inci' }, { title: 'Key ingredients (partial)' }, { source_scope: 'partial' }, { is_complete: false }, { partial: true }, { truncated: true }, { completeness: 'partial' }, { source_quality_status: 'quarantined' }, { source_quality_status: 'partial' }, { available: false }, { observed_at: undefined, source_observed_at: '2027-01-01' }])('does not certify contradictory or partial evidence %o', (patch) => {
    expect(evaluateProduct(product, response({ ...ingredient, ...patch }), brief, now).fragrance).not.toBe('verified');
  });
  it('conflict in either representation or duplicate module wins over a positive flag', () => {
    const mismatch = evaluateProduct(product, response({ ...ingredient, items: ['Water', 'Parfum'] }), brief, now);
    expect(mismatch.fragrance).toBe('conflict'); expect(mismatch.ingredientEvidence).toContain('Parfum');
    expect(evaluateProduct(product, response({ ...ingredient, raw_text: 'Water, Natural Vanilla Fragrance' }), brief, now).fragrance).toBe('conflict');
    const duplicate = response(); duplicate.modules.push({ type: 'ingredients_inci', data: { ...ingredient, items: ['Parfum'] } } as any);
    expect(evaluateProduct(product, duplicate, brief, now).fragrance).toBe('conflict');
  });
  it('a non-conflicting but inconsistent list does not certify completeness', () => {
    expect(evaluateProduct(product, response({ ...ingredient, items: ['Water', 'Glycerin', 'Niacinamide'] }), brief, now).fragrance).toBe('unverified');
  });
  it('does not take ingredients, money, or variant from a foreign identity tuple', () => {
    const wrong = response(); const canonical = wrong.modules[0].data;
    (canonical.pdp_payload as any).product = { ...product, product_id: 'b', default_variant_id: 'foreign', variants: [{ variant_id: 'foreign', title: '999g', price: { current: { amount: 25, currency: 'EUR' } } }] };
    (canonical as any).entry_product_ref = { product_id: 'a', merchant_id: 'other-seller' };
    const result = evaluateProduct(product, wrong, brief, now);
    expect(result.fragrance).toBe('unverified'); expect(result.variantId).toBeUndefined(); expect(result.price).toBe('USD 11.00'); expect(result.size).not.toBe('999g');
  });
  it('rejects retained canonical data on a failed response', () => {
    expect(evaluateProduct(product, { ...response(), status: 'error' }, brief, now).fragrance).toBe('unverified');
  });
});

describe('time-bound persisted and rendered verification', () => {
  it('current bound verification survives restoration without extending expiry', () => {
    const original = report(); expect(original.items[0].fragrance).toBe('verified');
    expect(refreshDecisionReport(original, now)).toEqual(original);
    expect(Date.parse(original.items[0].verification!.expiresAt) - Date.parse(observed)).toBe(MAX_EVIDENCE_AGE_MS);
  });
  it.each(['2026-11-03T00:00:00Z', '2026-12-01T00:00:00Z', '2026-10-03T00:00:00Z'])('downgrades expired or future observation when time is %s', (time) => {
    const updated = refreshDecisionReport(report(), new Date(time));
    expect(updated.items[0].fragrance).toBe('unverified');
    expect(updated.items[0].sources[0].stale).toBe(true);
    expect(updated.summary).not.toContain('1 product has sourced');
    expect(updated.items[0].tradeoffs.join(' ')).not.toContain('Source explicitly supports');
  });
  it.each([{ productId: 'different' }, { merchantId: 'different' }, { sourceUrl: 'https://another.example/a' }, { expiresAt: '2030-01-01' }, { complete: false }, { available: false }, { claim: 'Not fragrance-free' }])('cannot revive cached verification with mismatched metadata %o', (patch) => {
    const original = report(); Object.assign(original.items[0].verification!, patch);
    expect(refreshDecisionReport(original, now).items[0].fragrance).toBe('unverified');
  });
  it('legacy cached positives without verification provenance are downgraded at hydration', () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    try {
      const original = report(); delete original.items[0].verification;
      const restored = migrateChatState({ currentConversationId: 'c', conversations: [{ id: 'c', messages: [{ id: 'a', role: 'assistant', content: 'Candidates', decision: original }] }] });
      expect(restored.messages[0].decision?.items[0].fragrance).toBe('unverified');
      expect(restored.messages[0].decision?.summary).not.toContain('1 product has sourced');
    } finally { vi.useRealTimers(); }
  });
});

describe('discovery and exact offer boundaries', () => {
  it('an evidence lookup referring to existing positions is not new discovery', async () => {
    const search = vi.fn();
    await runShoppingTurn('Find ingredient evidence for the first two', { ...newShoppingTask(), brief, displayedProducts: [product, { ...product, product_id: 'b' }] }, brief, {}, { search, readPdp: vi.fn().mockResolvedValue({ modules: [] }) });
    expect(search).not.toHaveBeenCalled();
  });
  it('same-category new search plus compare discovers and does not reuse old references', async () => {
    const query = 'Find two other moisturizers under $20. Compare them';
    const search = vi.fn().mockResolvedValue({ products: [{ ...product, product_id: 'new' }] });
    const result = await runShoppingTurn(query, { ...newShoppingTask(), brief, displayedProducts: [product] }, deriveBrief(query, brief), {}, { search, readPdp: vi.fn().mockResolvedValue({ modules: [] }) });
    expect(search).toHaveBeenCalledTimes(1); expect(result.message.products?.[0].product_id).toBe('new');
  });
  it('canonical zero inventory overrides stale in-stock flags', () => {
    const selected = { ...product, variant_id: 'v' };
    const payload = response({}, { product: { ...product, variants: [{ variant_id: 'v', title: '120g', availability: { in_stock: true, available_quantity: 0 }, price: { current: { amount: 11, currency: 'USD' } } }] } });
    expect(evaluateProduct(selected, payload, brief, now).eligibility).toBe('rejected');
  });
});
