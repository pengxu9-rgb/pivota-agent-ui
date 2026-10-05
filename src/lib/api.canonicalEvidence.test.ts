import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import live from '@/features/shopping/__fixtures__/live-release-20261004.json';
import { canonicalEvidenceRef } from './canonicalEvidenceRef';
const cacheCalls = vi.hoisted(() => [] as string[][]);
vi.mock('next/cache', () => ({ unstable_cache: (fn: any, key: string[]) => { cacheCalls.push(key); return fn; } }));
import { getPdpV2, getPdpV2Cached, normalizeProduct, sendMessage } from './api';
import { deriveBrief, newShoppingTask } from '@/features/shopping/model';
import { runShoppingTurn } from '@/features/shopping/runShoppingTurn';
import { evaluateProduct } from '@/features/shopping/decision';
import { stampPdpResponseCommerce } from '@/features/pdp/utils/commerceAvailability';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const cards = live.catalog.body.products;
const first = cards[0];
const pdps = live.pdp as Record<string, any>;
const clone = (value: any) => JSON.parse(JSON.stringify(value));
beforeEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); cacheCalls.length = 0; });
afterEach(() => vi.restoreAllMocks());

function transport() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const body = JSON.parse(String(init?.body || '{}'));
    if (body.operation === 'find_products_multi') return json(live.catalog.body);
    if (body.operation === 'get_pdp_v2') {
      const ref = body.payload.product_ref;
      if (ref.merchant_id) return json({ error: 'PRODUCT_NOT_FOUND' }, 404);
      if (body.payload.options?.allow_read_only !== true) return json({ error: 'CURRENT_OWN_OFFER_UNAVAILABLE' }, 409);
      return pdps[ref.product_id] ? json(pdps[ref.product_id]) : json({ error: 'CURRENT_OWN_OFFER_READ_FAILED' }, 503);
    }
    throw new Error(`Unexpected operation ${body.operation}`);
  });
}

describe('live canonical card to evidence wire contract', () => {
  it('retains advertised canonical content separately from the original card seller', () => {
    const product = normalizeProduct(first as any);
    expect(product.merchant_id).toBe(first.merchant_id);
    expect(product.canonical_evidence_ref).toEqual({ scope: 'canonical_product', product_id: first.product_id });
    expect(canonicalEvidenceRef(product)).toEqual(product.canonical_evidence_ref);
  });
  it.each([
    { pivota_signature_id: 'sig_ffffffffffffffffffffffffffffffff' },
    { canonical_url: 'https://foreign.example/products/' + first.product_id },
    { canonical_url: 'https://agent.pivota.cc/products/sig_ffffffffffffffffffffffffffffffff' },
    { canonical_url: 'https://agent.pivota.cc/products/' + first.product_id + '?merchant_id=other' },
  ])('does not unpin a seller from contradictory canonical advertising %j', (override) => {
    expect(canonicalEvidenceRef({ ...first, ...override })).toBeUndefined();
  });
  it('ordinary seller-pinned reads retain the exact tuple and do not opt in', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ modules: [] }));
    await getPdpV2({ product_id: first.product_id, merchant_id: first.merchant_id });
    const request = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(request.payload.product_ref).toEqual({ product_id: first.product_id, merchant_id: first.merchant_id });
    expect(request.payload.options.allow_read_only).toBeUndefined();
  });
  it('requires both explicit evidence scope and opt-in before removing only the content request seller', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ modules: [] }));
    const args = { product_id: first.product_id, merchant_id: first.merchant_id, canonical_evidence_ref: canonicalEvidenceRef(first) };
    await getPdpV2(args);
    await getPdpV2({ ...args, allow_read_only: true });
    await getPdpV2({ ...args, allow_read_only: true, canonical_evidence_ref: { scope: 'canonical_product', product_id: 'sig_ffffffffffffffffffffffffffffffff' } });
    const requests = fetch.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(requests[0].payload.product_ref.merchant_id).toBe(first.merchant_id);
    expect(requests[1].payload.product_ref).toEqual({ product_id: first.product_id });
    expect(requests[1].payload.options.allow_read_only).toBe(true);
    expect(requests[2].payload.product_ref.merchant_id).toBe(first.merchant_id);
  });
  it('runs actual search normalization, request construction, hydration and comparison from captured contracts', async () => {
    const fetch = transport();
    const query = 'Find two moisturizers under $30';
    const brief = deriveBrief(query);
    const firstTurn = await runShoppingTurn(query, newShoppingTask(), brief, {}, { search: sendMessage, readPdp: getPdpV2 });
    expect(firstTurn.message.products?.map((p) => p.product_id)).toEqual(cards.slice(0, 2).map((p) => p.product_id));
    expect(firstTurn.message.products?.map((p) => p.merchant_id)).toEqual(cards.slice(0, 2).map((p) => p.merchant_id));
    const requests = fetch.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(requests[0].payload.search).toMatchObject({ query: 'moisturizers. under USD 30', catalog_entity_mode: 'canonical_sig', catalog_surface: 'agent_api', commerce_surface: 'agent_api' });
    for (const request of requests.slice(1)) {
      expect(request.payload.product_ref.merchant_id).toBeUndefined();
      expect(request.payload.options.allow_read_only).toBe(true);
    }
    for (const item of firstTurn.message.decision!.items) {
      expect(item.eligibility).toBe('unverified');
      expect(item.price).toMatch(/^Catalog listed USD .*current seller price unverified$/);
      expect(item.missing).not.toContain('Canonical details unavailable or identity could not be verified');
      expect(item.tradeoffs).toContain('Product evidence is available for comparison; current purchase availability for this seller is unverified.');
    }
    const compared = await runShoppingTurn('Compare the first two by ingredients', { ...newShoppingTask(), brief, displayedProducts: firstTurn.message.products! }, brief, {}, { search: sendMessage, readPdp: getPdpV2 });
    expect(compared.message.products).toEqual(firstTurn.message.products);
    expect(fetch.mock.calls.map(([, init]) => JSON.parse(String(init?.body))).filter((r) => r.operation === 'find_products_multi')).toHaveLength(1);
  });
  it('separates cached evidence mode and requires current verification even when returned data includes a commerce marker', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json(pdps[first.product_id]));
    const ordinary = await getPdpV2Cached({ product_id: first.product_id });
    const evidence = await getPdpV2Cached({ product_id: first.product_id, allow_read_only: true });
    expect(ordinary.metadata?.commerce_verification).toBeUndefined();
    expect(evidence.metadata?.commerce_verification).toBe('refresh_required');
    expect(cacheCalls[0]).toContain('strict_commerce');
    expect(cacheCalls[1]).toContain('evidence_only_until_refresh');
    expect(cacheCalls[0]).not.toEqual(cacheCalls[1]);
  });
});

describe('canonical content cannot authorize another seller offer', () => {
  it.each(['resolution-merchant', 'payload-tuple', 'source-tuple', 'requested-signature'])('rejects %s mismatch in the exact resolution receipt', (failure) => {
    const response = clone(pdps[first.product_id]);
    const c = response.modules.find((m: any) => m.type === 'canonical').data;
    if (failure === 'resolution-merchant') response.metadata.identity_resolution.resolved_merchant_id = 'other';
    if (failure === 'payload-tuple') c.canonical_payload_product_ref.merchant_id = 'other';
    if (failure === 'source-tuple') c.canonical_product_ref.product_id = 'other';
    if (failure === 'requested-signature') response.metadata.identity_resolution.requested_product_id = cards[1].product_id;
    const item = evaluateProduct(normalizeProduct(first as any), response, deriveBrief('Find moisturizer under $30'));
    expect(item.missing).toContain('Canonical details unavailable or identity could not be verified');
    expect(item.eligibility).toBe('unverified');
  });
  it('cannot resurrect stale injected price/stock or borrow a canonical variant into a card offer', () => {
    const response = clone(pdps[first.product_id]);
    const p = response.modules.find((m: any) => m.type === 'canonical').data.pdp_payload.product;
    p.price = { current: { amount: 1, currency: 'EUR' } }; p.in_stock = true;
    p.variants[0].price = { current: { amount: 1, currency: 'EUR' } };
    const item = evaluateProduct(normalizeProduct(first as any), response, deriveBrief('Find moisturizer under $30'));
    expect(item.price).toBe('Catalog listed USD 12.00; current seller price unverified');
    expect(item.variantId).toBeUndefined();
    expect(item.alternatives).toEqual([]);
    expect(item.eligibility).toBe('unverified');
  });
  it('does not reuse a generic catalog amount for an explicitly selected unresolved variant', () => {
    const product = { ...normalizeProduct(first as any), variant_id: 'different-size' };
    const item = evaluateProduct(product, pdps[first.product_id], deriveBrief('Find moisturizer under $30'));
    expect(item.price).toBe('Current seller price unavailable');
    expect(item.tradeoffs.join(' ')).not.toContain('within budget');
    expect(item.eligibility).toBe('unverified');
  });
});

it('a fresh exact-seller proof remains usable, while cached or other-seller copies do not certify money', () => {
  const response = clone(live.positive_control);
  const positiveData = response.modules.find((m: any) => m.type === 'canonical').data;
  const instant = Date.now();
  for (const proof of [response.metadata.commerce, positiveData.commerce, positiveData.pdp_payload.commerce]) {
    proof.verified_at = new Date(instant).toISOString();
    proof.expires_at = new Date(instant + 60000).toISOString();
  }
  const canonical = response.modules.find((m: any) => m.type === 'canonical').data;
  const ownProduct = normalizeProduct(canonical.pdp_payload.product);
  // The browser getPdpV2 read stamps arrival; an unstamped copy certifies nothing.
  expect(evaluateProduct(ownProduct, response, deriveBrief('Find moisturizer under $30')).eligibility).toBe('unverified');
  const received = stampPdpResponseCommerce(response, Date.now());
  const current = evaluateProduct(ownProduct, received, deriveBrief('Find moisturizer under $30'));
  expect(current.price).toBe('USD 19.95'); // Explicit mocked positive control, not live money.
  expect(current.eligibility).toBe('candidate');
  const cached = clone(received); cached.metadata.commerce_verification = 'refresh_required';
  expect(evaluateProduct(ownProduct, cached, deriveBrief('Find moisturizer under $30')).eligibility).toBe('unverified');
  const advertisedSeller = normalizeProduct(live.additional_catalog_card as any);
  const other = evaluateProduct(advertisedSeller, received, deriveBrief('Find moisturizer under $30'));
  expect(other.eligibility).toBe('unverified');
  expect(other.price).not.toBe('USD 19.95');
});

it('canonical read-only content retains the known Full Cream fragrance conflict across the distinct offer-seller namespace', () => {
  const card = normalizeProduct(live.additional_catalog_card as any);
  const response = clone(pdps[card.product_id]);
  // Removing an optional source module cannot erase earlier dated, exact-canonical evidence.
  response.modules = response.modules.filter((m: any) => m.type !== 'ingredients_inci');
  const payload = response.modules.find((m: any) => m.type === 'canonical').data.pdp_payload;
  payload.modules = payload.modules.filter((m: any) => m.type !== 'ingredients_inci');
  const checked = evaluateProduct(card, response, deriveBrief('Find a fragrance-free moisturizer under $30'));
  expect(checked.fragrance).toBe('conflict');
  expect(checked.eligibility).toBe('rejected');
  expect(checked.ingredientEvidence).toContain('Natural Vanilla Fragrance');
});

it('preserves explicit nested stock observations without letting a conflicting positive override a negative', () => {
  expect(normalizeProduct({ ...first, in_stock: undefined, availability: { in_stock: true } } as any).in_stock).toBe(true);
  expect(normalizeProduct({ ...first, in_stock: true, availability: { in_stock: false } } as any).in_stock).toBe(false);
  expect(normalizeProduct({ ...first, in_stock: false, availability: { in_stock: true } } as any).in_stock).toBe(false);
});

it('does not impose the new own-money proof on an unchanged legacy response without that contract', async () => {
  const legacy = clone(live.positive_control);
  delete legacy.metadata.commerce;
  const canonical = legacy.modules.find((m: any) => m.type === 'canonical').data;
  delete canonical.commerce; delete canonical.pdp_payload.commerce;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json(legacy));
  const response = await getPdpV2Cached({ product_id: first.product_id, allow_read_only: true });
  expect(response.metadata?.commerce_verification).toBeUndefined();
});


it('keeps unverified search attributes visible through actual API normalization and later comparison', async () => {
  const fetch = transport();
  fetch.mockImplementation(async (_url, init) => {
    const request = JSON.parse(String(init?.body || '{}'));
    if (request.operation === 'find_products_multi') return json({ ...live.catalog.body,
      metadata: { ...live.catalog.body.metadata, unverified_constraints: ['vegan moisturizer'] } });
    return json(pdps[request.payload.product_ref.product_id]);
  });
  const query = 'Find two vegan moisturizers';
  const brief = deriveBrief(query);
  const found = await runShoppingTurn(query, newShoppingTask(), brief, {}, { search: sendMessage, readPdp: getPdpV2 });
  expect(found.message.decision!.items[0].missing).toContain('Source verification of search requirements: vegan moisturizer');
  expect(found.message.decision!.items[0].eligibility).toBe('unverified');
  const compared = await runShoppingTurn('Compare the first two', { ...newShoppingTask(), brief,
    displayedProducts: found.message.products! }, brief, {}, { search: sendMessage, readPdp: getPdpV2 });
  expect(compared.message.decision!.items[0].missing).toContain('Source verification of search requirements: vegan moisturizer');
});
