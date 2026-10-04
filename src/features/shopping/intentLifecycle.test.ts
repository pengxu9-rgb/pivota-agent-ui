import { describe, expect, it, vi } from 'vitest';
import { deriveBrief, newShoppingTask, queryForBrief, shoppingTransition } from './model';
import { resolveComparison } from './decision';
import { runShoppingTurn } from './runShoppingTurn';
import fullCream from './__fixtures__/audited-full-cream.json';

const initial = deriveBrief('Find a fragrance-free moisturizer under $30');
const a: any = { product_id: 'a', merchant_id: 'm', title: 'Alpha Moisturizer 120g', price: 11, currency: 'USD', in_stock: true };
const b: any = { ...a, product_id: 'b', title: 'Beta Moisturizer 200g' };
const c: any = { ...a, product_id: 'c', title: 'Gamma Moisturizer 250g' };
const audited: any = { ...a, product_id: 'sig_6bb6c7ae7b7e71e838aefb564c60371a', merchant_id: 'merch_obs_0531e02c57f00f5b', title: 'MooGoo Full Cream Moisturizer', source_url: 'https://moogoousa.com/products/full-cream-moisturizer' };
const task = { ...newShoppingTask(), brief: initial, displayedProducts: [a, b] };

describe('shopping intent lifecycle table', () => {
  it.each([
    'Show me more moisturizers', 'Find another moisturizer', 'Suggest other moisturizers',
    'Recommend two moisturizers', 'Could you show me a moisturizer again?',
    'Find moisturizers for dry skin', 'Show me more', 'Find more', 'Show me more options',
    'Find alternatives', 'Find alternatives to those', 'Show me more of these',
    'Compare the first two', 'Check ingredient evidence',
  ])('continues %s without implicitly removing hard constraints', (query) => {
    const next = deriveBrief(query, initial);
    expect(shoppingTransition(query, initial).kind).toBe('continue');
    expect(next.fragranceFree).toBe(true);
    expect(next.budget).toEqual(initial.budget);
    expect(queryForBrief(next)).toContain('fragrance-free required');
    expect(queryForBrief(next)).toContain('under USD 30');
  });
  it.each(['televisions', 'coffee grinders', 'mechanical keyboards', 'camping lanterns', 'hiking poles'])('arbitrary new %s replaces goal and unretained constraints', (goal) => {
    const next = deriveBrief(`Find two ${goal} under $500. Compare their sizes`, initial);
    expect(next.intent).toBe(goal);
    expect(next.fragranceFree).toBeUndefined();
    expect(next.budget?.amount).toBe(500);
    expect(next.category).toBeUndefined();
    expect(queryForBrief(next)).not.toContain('moisturizer');
  });
  it.each(['coffee grinders', 'mechanical keyboards', 'camping lanterns', 'hiking poles'])('same arbitrary %s retains a budget without a category allowlist', (goal) => {
    const previous = deriveBrief(`Find ${goal} under EUR 80`);
    const next = deriveBrief(`Show me more ${goal}`, previous);
    expect(shoppingTransition(`Show me more ${goal}`, previous).kind).toBe('continue');
    expect(next.intent).toBe(goal);
    expect(next.budget).toEqual(previous.budget);
  });
  it.each([
    ['coffee grinders', 'Show me more lightweight coffee grinders'],
    ['coffee grinders for espresso', 'Find coffee grinders for travel'],
    ['mechanical keyboards', 'Show me other wireless keyboards'],
    ['glass water bottles', 'Recommend more steel water bottles'],
  ])('refines arbitrary goal %s with %s without losing its budget', (goal, query) => {
    const previous = deriveBrief(`Find ${goal} under EUR 80`);
    const next = deriveBrief(query, previous);
    expect(next.budget).toEqual(previous.budget);
    expect(shoppingTransition(query, previous).kind).toBe('continue');
  });
  it.each([
    ['Show me more moisturizers under EUR 20', true, 20, 'EUR'],
    ['Show me more moisturizers; remove the budget', true, undefined, undefined],
    ['Show me more moisturizers; drop the fragrance-free requirement', undefined, 30, 'USD'],
    ['Find televisions; keep the same budget', undefined, 30, 'USD'],
    ['Find televisions; keep the same constraints', true, 30, 'USD'],
    ['Find televisions; keep the fragrance-free requirement', true, undefined, undefined],
    ['Find fragrance-free televisions under GBP 70', true, 70, 'GBP'],
    ['Start a new search. Find moisturizer', undefined, undefined, undefined],
    ['Start over. Find moisturizer under $15', undefined, 15, 'USD'],
    ['Under $25 instead', true, 25, 'USD'],
    ['No longer require fragrance-free', undefined, 30, 'USD'],
  ])('%s applies only explicit constraint changes', (query, fragranceFree, amount, currency) => {
    const next = deriveBrief(query as string, initial);
    expect(next.fragranceFree).toBe(fragranceFree);
    expect(next.budget?.amount).toBe(amount);
    expect(next.budget?.currency).toBe(currency);
  });
  it('an explicit reset keeps only constraints the user expressly retains', () => {
    const next = deriveBrief('Start over. Find moisturizer; keep the same budget', initial);
    expect(next.fragranceFree).toBeUndefined();
    expect(next.budget).toEqual(initial.budget);
  });
  it.each(['Show me more moisturizers', 'Suggest other moisturizers', 'Find alternatives', 'Find more'])('%s cannot newly recommend audited fragrance conflict', async (query) => {
    const deps = { search: vi.fn().mockResolvedValue({ products: [audited, { ...a, price: 31 }, b] }), readPdp: vi.fn().mockImplementation(async ({ product_id }) => product_id === audited.product_id ? fullCream : { modules: [] }) };
    const result = await runShoppingTurn(query, task, deriveBrief(query, initial), {}, deps);
    expect(deps.search.mock.calls[0][0]).toContain('fragrance-free required');
    expect(result.message.products).toEqual([b]);
    expect(result.message.content).toContain('2 products were excluded');
  });
  it('empty continuation preserves the actual prior reference set while empty replacement clears it', async () => {
    const deps = { search: vi.fn().mockResolvedValue({ products: [], strict_empty: true }), readPdp: vi.fn() };
    const continued = await runShoppingTurn('Show me more moisturizers', task, deriveBrief('Show me more moisturizers', initial), {}, deps);
    expect(continued.taskPatch.displayedProducts).toBeUndefined();
    const replacement = await runShoppingTurn('Find coffee grinders', task, deriveBrief('Find coffee grinders', initial), {}, deps);
    expect(replacement.taskPatch.displayedProducts).toEqual([]);
  });
});

describe('product references and comparison criteria have different grammars', () => {
  it.each([
    'Compare the first two: ingredients, size, price and retailer',
    'Compare the first two: ingredient evidence and fragrance-free status',
    'Compare the first two: price, size, availability, reviews and ratings',
    'Compare the first two: their prices and sizes',
    'Compare the first two using ingredient evidence, size, price and retailer',
    'Compare the first two by price and size',
    'Compare the first two with ingredient evidence',
    'Compare the first two, Alpha Moisturizer 120g and Beta Moisturizer 200g',
    'Compare the first two Alpha Moisturizer 120g and Beta Moisturizer 200g',
    'Compare the first two on shipping and returns',
    'Compare the first two: Alpha Moisturizer 120g and Beta Moisturizer 200g',
    'Compare the first two: Alpha Moisturizer 120g and Beta Moisturizer 200g by price and size',
    'Compare Alpha Moisturizer 120g and Beta Moisturizer 200g using ingredient evidence',
  ])('%s binds the exact displayed pair', (query) => {
    expect(resolveComparison(query, [a, b, c]).products).toEqual([a, b]);
  });
  it.each([
    'Compare the first two: Alpha Moisturizer 120g and Absent Product',
    'Compare the first two: Missing One and Absent Product',
    'Compare the first two, Missing One and Absent Product',
    'Compare the first two Missing One and Absent Product',
    'Compare the first two: Alpha Moisturizer 120g and Beta Moisturizer 200g and Absent Product',
    'Compare the first two: Absent Product',
    'Compare the first two: ingredients and Absent Product',
    'Compare the first two: Alpha Moisturizer 120g and ingredients',
    'Compare the first two: Alpha Moisturizer 120g and Gamma Moisturizer 250g',
    'Compare the first two: something undecidable',
    'Compare the first and fourth by price',
  ])('%s asks instead of guessing an absent or contradictory target', (query) => {
    const result = resolveComparison(query, [a, b, c]);
    expect(result.products).toEqual([]);
    expect(result.clarification).toBeTruthy();
  });
  it('a criteria-only follow-up never searches and retains exact ordinal order', async () => {
    const query = 'Compare the second and first: ingredients, size, price and retailer';
    const deps = { search: vi.fn(), readPdp: vi.fn().mockResolvedValue({ modules: [] }) };
    const result = await runShoppingTurn(query, task, deriveBrief(query, initial), {}, deps);
    expect(deps.search).not.toHaveBeenCalled();
    expect(result.message.products).toEqual([b, a]);
  });
});
