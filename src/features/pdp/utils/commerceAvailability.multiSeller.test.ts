import { describe, expect, it } from 'vitest';
import verifiedFullCream from '@/features/pdp/__fixtures__/canonicalOfferLive20261004/fullcream-verified-current-own-offer.json';
import { mapPdpV2ToPdpPayload } from '@/features/pdp/adapter/mapPdpV2ToPdpPayload';
import { hasVerifiedSelectedCommerce, isVerifiedCommerce, stampPdpResponseCommerce } from './commerceAvailability';
import { resolveOfferPricing } from './offerVariantMatching';

// Peng 2026-10-05: on a page with a verified price, other sellers stay buyable when the gateway
// verified their own current price (metadata.commerce.verified_offers), and only then.

type Entry = { offer_id: string; merchant_id: string; product_id: string; variant_id: string; amount: number; currency: string };

function verifiedPage(verifiedOffers: Entry[], receivedAt = Date.now()) {
  const response = structuredClone((verifiedFullCream as any).body);
  const data = response.modules.find((module: any) => module.type === 'canonical').data;
  for (const proof of [response.metadata.commerce, data.commerce, data.pdp_payload.commerce]) {
    proof.verified_at = new Date(receivedAt).toISOString();
    proof.expires_at = new Date(receivedAt + 60000).toISOString();
    proof.verified_offers = verifiedOffers;
  }
  const payload = mapPdpV2ToPdpPayload(stampPdpResponseCommerce(response, receivedAt))!;
  expect(payload).not.toBeNull();
  return payload;
}

const ENTRY: Entry = { offer_id: 'seller_c', merchant_id: 'merch_obs_other', product_id: 'other:listing', variant_id: 'other:listing', amount: 8, currency: 'USD' };
const OFFER = { offer_id: 'seller_c', merchant_id: 'merch_obs_other', product_id: 'other:listing', price_verification: 'verified',
  price: { amount: 8, currency: 'USD' }, inventory: { in_stock: true } };

describe('another seller on a verified page', () => {
  it('is buyable when its exact offer and shown money are certified', () => {
    const page = verifiedPage([ENTRY]);
    expect(hasVerifiedSelectedCommerce(page, page.product.variants[0], { offer: OFFER })).toBe(true);
  });

  it.each([
    ['the shown money differs from the verified money', { ...OFFER, price: { amount: 7.99, currency: 'USD' } }],
    ['the gateway could not verify it', { ...OFFER, price_verification: 'unverified' }],
    ['it is out of stock', { ...OFFER, inventory: { in_stock: false } }],
    ['it is a different listing of that seller', { ...OFFER, product_id: 'other:twin' }],
  ])('is not buyable when %s', (_label, offer) => {
    const page = verifiedPage([ENTRY]);
    expect(hasVerifiedSelectedCommerce(page, page.product.variants[0], { offer })).toBe(false);
  });

  it('is not buyable when the proof does not list it', () => {
    const page = verifiedPage([]);
    expect(hasVerifiedSelectedCommerce(page, page.product.variants[0], { offer: OFFER })).toBe(false);
  });

  it('is not buyable on a proof older than its window', () => {
    const page = verifiedPage([ENTRY], Date.now() - 60001);
    expect(hasVerifiedSelectedCommerce(page, page.product.variants[0], { offer: OFFER })).toBe(false);
  });

  it('uses the offer variant that exactly matches the selected options', () => {
    const page = verifiedPage([
      { ...ENTRY, variant_id: 'c-500' }, { ...ENTRY, variant_id: 'c-120', amount: 5 },
    ]);
    const selected = { ...page.product.variants[0], options: [{ name: 'Size', value: '500g' }] };
    const offer = { ...OFFER, variants: [
      { variant_id: 'c-120', options: [{ name: 'Size', value: '120g' }], price: { current: { amount: 5, currency: 'USD' } } },
      { variant_id: 'c-500', options: [{ name: 'Size', value: '500g' }], price: { current: { amount: 8, currency: 'USD' } } },
    ] };
    expect(hasVerifiedSelectedCommerce(page, selected, { offer })).toBe(true);
    const otherSize = { ...selected, options: [{ name: 'Size', value: '1kg' }] };
    expect(hasVerifiedSelectedCommerce(page, otherSize, { offer })).toBe(false);
  });

  it('a caller naming a different seller than the offer is refused', () => {
    const page = verifiedPage([ENTRY]);
    expect(hasVerifiedSelectedCommerce(page, page.product.variants[0], { offer: OFFER, merchantId: 'someone_else' })).toBe(false);
  });
});

describe('verified_offers shape', () => {
  const base = verifiedPage([]).commerce as any;
  it.each([
    ['a duplicate entry', [ENTRY, ENTRY]],
    ['a non-positive amount', [{ ...ENTRY, amount: 0 }]],
    ['a lowercase currency', [{ ...ENTRY, currency: 'usd' }]],
    ['a missing variant', [{ ...ENTRY, variant_id: '' }]],
  ])('rejects a proof with %s', (_label, verifiedOffers) => {
    expect(isVerifiedCommerce({ ...base, verified_offers: verifiedOffers })).toBe(false);
  });
  it('accepts a proof without the field (older gateways)', () => {
    const { verified_offers: _omit, ...older } = base;
    expect(isVerifiedCommerce(older)).toBe(true);
  });
});

describe('unverified seller pricing', () => {
  it('cannot be selected and says why', () => {
    const pricing = resolveOfferPricing({ ...OFFER, price_verification: 'unverified', price: undefined } as any, null);
    expect(pricing.priceUnverified).toBe(true);
    expect(pricing.currentMoneyUnavailable).toBe(true);
    expect(pricing.itemAmount).toBeNull();
  });
});
