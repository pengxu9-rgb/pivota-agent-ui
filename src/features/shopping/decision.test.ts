import { describe, it, expect, vi } from 'vitest';
import type { GetPdpV2Response, ProductResponse } from '@/lib/api';
import { deriveBrief, newShoppingTask, queryForBrief, contextualSuggestions } from './model';
import { evaluateProduct, resolveComparison } from './decision';
import { runShoppingTurn } from './runShoppingTurn';
import fullCreamFixture from './__fixtures__/audited-full-cream.json';

const magnesium: ProductResponse = { product_id: 'sig_cf68aabe65b181d292499bb0b944b331', merchant_id: 'merch_obs_0531e02c57f00f5b', title: 'MooGoo Magnesium Moisturizer 120g', brand: 'MooGoo', description: '', price: 11.5, currency: 'USD', in_stock: true };
const fullCream: ProductResponse = { ...magnesium, product_id: 'sig_6bb6c7ae7b7e71e838aefb564c60371a', title: 'MooGoo Full Cream Moisturizer', price: 11.9, source_url: 'https://moogoousa.com/products/full-cream-moisturizer' };
const pair = [magnesium, fullCream];
const initial = 'Find a fragrance-free moisturizer under $30. Compare the two best options using ingredient evidence, size, price, and retailer. If fragrance-free status is unverified, say so.';
const followup = 'Compare only the first two: MooGoo Magnesium Moisturizer 120g versus MooGoo Full Cream Moisturizer. Which has verified fragrance-free ingredient evidence? Give their sizes, retailers, and trade-offs; do not show more products.';
const brief = deriveBrief(initial);
const fixture = fullCreamFixture as GetPdpV2Response;
const pdp = (product: ProductResponse, ingredient: any) => ({ modules: [{ type: 'canonical', data: { pdp_payload: { product, modules: [{ type: 'ingredients_inci', data: ingredient }] } } }] });

describe('decision-oriented shopping brief', () => {
  it('retains compound requirement, numeric currency budget, and requested pair', () => {
    expect(brief).toMatchObject({ fragranceFree: true, category: 'moisturizer', budget: { amount: 30, currency: 'USD', exclusive: true }, requestedCount: 2 });
    expect(queryForBrief(brief)).not.toMatch(/compare|ingredient evidence/i);
    expect(deriveBrief(followup, brief).fragranceFree).toBe(true);
  });
  it('removes constraints from both brief and regenerated search', () => {
    const edited = deriveBrief('Remove the fragrance-free requirement', brief);
    expect(edited.fragranceFree).toBeUndefined();
    expect(queryForBrief(edited)).not.toMatch(/fragrance/i);
    expect(deriveBrief('Remove the budget', brief).budget).toBeUndefined();
  });
  it('does not invent budget currency and resets category-specific requirements', () => {
    expect(deriveBrief('Find shoes under 30').budget).toBeUndefined();
    expect(deriveBrief('Find a laptop under EUR 700', brief)).toMatchObject({ category: 'laptop', budget: { currency: 'EUR', amount: 700 } });
    expect(deriveBrief('Find a laptop under EUR 700', brief).fragranceFree).toBeUndefined();
    expect(queryForBrief(deriveBrief('Actually show pink lipstick', deriveBrief('Find red lipstick under $20')))).toContain('pink');
    expect(queryForBrief(deriveBrief('Actually show pink lipstick', deriveBrief('Find red lipstick under $20')))).not.toContain('red');
  });
  it('offers category-relevant actions instead of fashion defaults', () => {
    expect(contextualSuggestions(brief, true).join(' ')).toMatch(/ingredient/i);
    expect(contextualSuggestions(brief, true).join(' ')).not.toMatch(/sandals|outfit|color|fit/i);
  });
});

describe('displayed product reference binding', () => {
  it('resolves exact audited names and ordinals without reranking', () => {
    expect(resolveComparison(followup, pair).products).toEqual(pair);
    expect(resolveComparison('Compare the second and first', pair).products).toEqual([fullCream, magnesium]);
    expect(resolveComparison('Which of these two?', pair).products).toEqual(pair);
  });
  it('asks on unresolved or contradictory names and positions', () => {
    expect(resolveComparison('Compare the second: MooGoo Magnesium Moisturizer 120g', pair).clarification).toBeTruthy();
    expect(resolveComparison('Compare MooGoo Full Cream Moisturizer versus an absent product', pair).clarification).toBeTruthy();
    expect(resolveComparison('Compare the third', pair).clarification).toBeTruthy();
    expect(resolveComparison('Compare Alien Lotion vs Unknown Balm', pair).clarification).toBeTruthy();
  });
  it('never resolves two different sellers from an ambiguous title', () => {
    expect(resolveComparison('Compare MooGoo Full Cream Moisturizer', [fullCream, { ...fullCream, merchant_id: 'other' }]).clarification).toBeTruthy();
  });
});

describe('source and identity-bound product evidence', () => {
  it('preserves audited exact size, USD amount, seller and variant IDs and flags known conflict', () => {
    const result = evaluateProduct(fullCream, fixture, brief, new Date('2026-10-04T10:00:00Z'));
    expect(result).toMatchObject({ fragrance: 'conflict', size: '120 g', price: 'USD 11.90', retailer: 'moogoousa.com', variantId: '45890202206515' });
    expect(result.ingredientEvidence).toContain('Natural Vanilla Fragrance');
    expect(result.sources[0]).toMatchObject({ url: fullCream.source_url, observedAt: '2026-10-04' });
    expect(result.alternatives).toContain('500 g: USD 28.90 (variant 45890202272051)');
  });
  it('requires exact seller and route identity, never alias/title matching for reviewed evidence', () => {
    expect(evaluateProduct({ ...fullCream, merchant_id: 'wrong' }, undefined, brief).fragrance).toBe('unverified');
    expect(evaluateProduct({ ...fullCream, product_id: 'alias' }, undefined, brief).fragrance).toBe('unverified');
    expect(evaluateProduct({ ...fullCream, source_url: 'https://different.example/product' }, undefined, brief).fragrance).toBe('unverified');
  });
  it('does not infer free-from verification from boolean flags, missing fields, or clean ingredient words', () => {
    for (const attrs of [undefined, { fragrance_free: true }]) expect(evaluateProduct({ ...magnesium, attributes: attrs }, undefined, brief).fragrance).toBe('unverified');
    expect(evaluateProduct(magnesium, pdp(magnesium, { items: ['Water', 'Glycerin'], source_quality_status: 'authoritative' }), brief).fragrance).toBe('unverified');
  });
  it('rejects cross-item canonical hydration and unsafe source links', () => {
    const result = evaluateProduct(magnesium, fixture, brief);
    expect(result.variantId).toBeUndefined();
    expect(result.size).toBe('120g');
    expect(result.missing).toContain('Canonical details unavailable or identity could not be verified');
    expect(evaluateProduct({ ...magnesium, source_url: 'javascript:alert(1)' }, undefined, brief).sources).toEqual([]);
  });
  it('never certifies contaminated ingredients or expired positive claims', () => {
    const source = { raw_text: 'Water, Glycerin', source_url: 'https://retailer.example/a', fragrance_free_claim: 'Fragrance-free', is_complete: true, observed_at: '2026-10-04T00:00:00Z' };
    expect(evaluateProduct(magnesium, pdp(magnesium, source), brief, new Date('2026-10-05')).fragrance).toBe('verified');
    expect(evaluateProduct(magnesium, pdp(magnesium, source), brief, new Date('2026-12-05')).fragrance).toBe('unverified');
    expect(evaluateProduct(magnesium, pdp(magnesium, { ...source, raw_text: 'Water, LINALOOL HOW TO USE apply twice daily' }), brief, new Date('2026-10-05')).fragrance).toBe('unverified');
    expect(evaluateProduct(fullCream, fixture, brief, new Date('2026-12-05')).ingredientEvidence).toContain('needs rechecking');
    expect(evaluateProduct(fullCream, fixture, brief, new Date('2026-12-05')).fragrance).toBe('conflict');
  });
});

describe('end-to-end decision turn routing', () => {
  const dependencies = () => ({ search: vi.fn().mockResolvedValue({ products: [...pair, { ...magnesium, product_id: 'unrelated' }], page_info: { has_more: true } }), readPdp: vi.fn().mockImplementation(({ product_id }) => Promise.resolve(product_id === fullCream.product_id ? fixture : { modules: [] })) });
  it('selects a non-conflicting discovery pair and compares the exact legacy audited pair without catalog search', async () => {
    const deps = dependencies();
    const first = await runShoppingTurn(initial, newShoppingTask(), brief, {}, deps);
    expect(first.message.kind).toBe('comparison');
    expect(first.message.products?.map((product) => product.product_id)).toEqual([magnesium.product_id, 'unrelated']);
    expect(first.message.decision?.items.map((item) => item.fragrance)).toEqual(['unverified', 'unverified']);
    expect(first.message.recommendation_paging).toBeUndefined();
    const next = await runShoppingTurn(followup, { ...newShoppingTask(), brief, displayedProducts: pair }, deriveBrief(followup, brief), {}, deps);
    expect(next.message.products).toEqual(pair);
    expect(deps.search).toHaveBeenCalledTimes(1);
    expect(deps.readPdp.mock.calls.slice(-2).every(([args]) => pair.some((p) => p.product_id === args.product_id && p.merchant_id === args.merchant_id))).toBe(true);
  });
  it('excludes known conflicts from discovery and does not call unknowns verified matches', async () => {
    const result = await runShoppingTurn('Find a fragrance-free moisturizer under $30', newShoppingTask(), brief, {}, dependencies());
    expect(result.message.products?.map((product) => product.product_id)).toEqual([magnesium.product_id, 'unrelated']);
    expect(result.message.products).not.toContainEqual(fullCream);
    expect(result.message.content).toContain('known requirement conflict');
    expect(result.message.decision?.summary).toContain('None');
  });
  it('missing PDP evidence and failures still produce a bounded useful comparison', async () => {
    const deps = dependencies(); deps.readPdp.mockRejectedValue(new Error('timeout'));
    const result = await runShoppingTurn(initial, newShoppingTask(), brief, {}, deps);
    expect(result.message.decision?.items).toHaveLength(2);
    expect(result.message.decision?.items[0].missing).toContain('Canonical details unavailable or identity could not be verified');
  });
  it('an empty refinement retains the prior displayed products for a subsequent comparison', async () => {
    const deps = dependencies(); deps.search.mockResolvedValue({ products: [], strict_empty: true, reply: 'Catalog unavailable' });
    const result = await runShoppingTurn('Find alternatives', { ...newShoppingTask(), displayedProducts: pair }, brief, {}, deps);
    expect(result.message.kind).toBe('error');
    expect(result.taskPatch.displayedProducts).toBeUndefined();
  });
  it('ambiguous follow-ups ask rather than searching or adding cards', async () => {
    const deps = dependencies();
    const result = await runShoppingTurn('Compare Alien Lotion vs Unknown Balm', { ...newShoppingTask(), displayedProducts: pair }, brief, {}, deps);
    expect(result.message.products).toBeUndefined();
    expect(deps.search).not.toHaveBeenCalled();
    expect(deps.readPdp).not.toHaveBeenCalled();
  });
});

describe('recommendation constraints and canonical source contracts', () => {
  it('excludes known budget violations before requested-count selection, but keeps currency unknown explicitly unverified', async () => {
    const products = [
      { ...magnesium, product_id: 'equal-limit', price: 30 },
      { ...magnesium, product_id: 'over-limit', price: 40 },
      { ...magnesium, product_id: 'foreign-currency', currency: 'EUR', price: 10 },
      { ...magnesium, product_id: 'under-limit', price: 12 },
    ];
    const deps = { search: vi.fn().mockResolvedValue({ products }), readPdp: vi.fn().mockResolvedValue({ modules: [] }) };
    const result = await runShoppingTurn('Find two moisturizers under $30', newShoppingTask(), deriveBrief('Find two moisturizers under $30'), {}, deps);
    expect(result.message.products?.map((p) => p.product_id)).toEqual(['under-limit', 'foreign-currency']);
    expect(result.message.decision?.items[1].eligibility).toBe('unverified');
    expect(result.message.decision?.items[1].tradeoffs).toContain('Budget is USD; no currency conversion applied.');
    expect(result.message.content).toContain('2 products were excluded');
  });

  it('uses source_observed_at and module source metadata only for validated identity', () => {
    const response = pdp(magnesium, { items: ['Water', 'Glycerin'], fragrance_free_claim: 'Fragrance-free', is_complete: true });
    (response.modules[0].data.pdp_payload as any).x_content_module_states = { ingredients_inci: { state: 'ready', source_url: 'https://retailer.example/ingredients', source_observed_at: '2026-10-04T00:00:00Z' } };
    const result = evaluateProduct(magnesium, response, brief, new Date('2026-10-05'));
    expect(result.fragrance).toBe('verified');
    expect(result.sources[0]).toMatchObject({ url: 'https://retailer.example/ingredients', observedAt: '2026-10-04T00:00:00Z' });
    expect(evaluateProduct(fullCream, response, brief, new Date('2026-10-05')).sources.some((source) => source.url === 'https://retailer.example/ingredients')).toBe(false);
  });

  it('never falls back from unavailable exact variant to the product or sibling price', async () => {
    const response = JSON.parse(JSON.stringify(fixture));
    const variant = response.modules[0].data.pdp_payload.product.variants[0];
    variant.current_own_offer_status = 'unavailable'; delete variant.price;
    const checked = evaluateProduct(fullCream, response, deriveBrief('Find moisturizer under $30'));
    expect(checked.price).toBe('Price unavailable for this variant');
    expect(checked.eligibility).toBe('rejected');
    expect(checked.tradeoffs.join(' ')).not.toContain('within budget');
    const result = await runShoppingTurn('Find moisturizer under $30', newShoppingTask(), deriveBrief('Find moisturizer under $30'), {}, { search: vi.fn().mockResolvedValue({ products: [fullCream] }), readPdp: vi.fn().mockResolvedValue(response) });
    expect(result.message.products).toEqual([]);
  });

  it('explicit comparison retains budget-rejected existing products without recommending them', async () => {
    const expensive = { ...magnesium, product_id: 'costly', price: 40 };
    const result = await runShoppingTurn('Compare the first two', { ...newShoppingTask(), displayedProducts: [magnesium, expensive] }, deriveBrief('Find moisturizer under $30'), {}, { search: vi.fn(), readPdp: vi.fn().mockResolvedValue({ modules: [] }) });
    expect(result.message.products).toEqual([magnesium, expensive]);
    expect(result.message.decision?.items[1]).toMatchObject({ eligibility: 'rejected' });
    expect(result.message.decision?.items[1].tradeoffs.join(' ')).toContain('does not meet your budget');
  });
});
