import { describe, expect, it } from 'vitest';
import { buildCreateCheckoutArgs, readOfferCode, validateReapCreateBody } from './createRequest';

const buyer = {
  email: 'ada@example.test',
  first_name: 'Ada',
  last_name: 'Lovelace',
  phone: '+15550100',
  address_line1: '900 Brannan St',
  address_line2: 'Suite 400',
  city: 'San Francisco',
  region: 'CA',
  postal_code: '94103',
  country: 'us',
};
const body = (extra: Record<string, unknown> = {}) => ({
  product_id: 'sig_6433c8107859a484fb72d14861e84690',
  quantity: 1,
  idempotency_key: '8d2f4c1e-8a7b-4f0e-9c1d-2b3a4c5d6e7f',
  consent: true,
  buyer,
  ...extra,
});

describe('offer code passthrough — exactly as typed', () => {
  it('forwards the code verbatim: no trim, no case-fold, unicode intact', () => {
    for (const code of ['PEACHIE20', 'peachie20', ' PEACHIE20 ', 'ÉTÉ-20', '🍑20', 'x'.repeat(128), '😀'.repeat(128)]) {
      const r = validateReapCreateBody(body({ offer_code: code }));
      expect(r.ok, code).toBe(true);
      if (!r.ok) continue;
      const args = buildCreateCheckoutArgs(r.input, { consentVersion: 'reap-agentic-v1', expectedMerchantDomain: 'judydoll.com' }) as any;
      expect(args.checkout.discounts).toEqual({ codes: [code] });
    }
  });

  it('an empty or absent code sends no discounts member at all', () => {
    for (const extra of [{}, { offer_code: '' }, { offer_code: null }]) {
      const r = validateReapCreateBody(body(extra));
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const args = buildCreateCheckoutArgs(r.input, { consentVersion: 'reap-agentic-v1', expectedMerchantDomain: 'judydoll.com' }) as any;
      expect('discounts' in args.checkout).toBe(false);
    }
  });

  it('refuses only the shape: > 128 code points, or not a string', () => {
    expect(readOfferCode('x'.repeat(129))).toBeNull();
    expect(readOfferCode('😀'.repeat(129))).toBeNull();
    expect(readOfferCode(20)).toBeNull();
    expect(readOfferCode(['A'])).toBeNull();
    expect(validateReapCreateBody(body({ offer_code: 'x'.repeat(129) }))).toMatchObject({ ok: false, field: 'offer_code' });
  });
});

describe('validateReapCreateBody', () => {
  it('requires consent, the buyer block and a priceable market', () => {
    expect(validateReapCreateBody(body({ consent: false }))).toMatchObject({ ok: false, field: 'consent' });
    expect(validateReapCreateBody(body({ buyer: { ...buyer, last_name: '' } }))).toMatchObject({ ok: false, field: 'buyer.last_name' });
    expect(validateReapCreateBody(body({ buyer: { ...buyer, phone: '  ' } }))).toMatchObject({ ok: false, field: 'buyer.phone' });
    // The gateway's UCP adapter refuses a destination without a postcode, so the form requires it too.
    expect(validateReapCreateBody(body({ buyer: { ...buyer, postal_code: '' } }))).toMatchObject({ ok: false, field: 'buyer.postal_code' });
    expect(validateReapCreateBody(body({ buyer: { ...buyer, country: 'ZZ' } }))).toMatchObject({ ok: false, field: 'buyer.country' });
    expect(validateReapCreateBody(body({ buyer: { ...buyer, email: 'nope' } }))).toMatchObject({ ok: false, field: 'buyer.email' });
    expect(validateReapCreateBody(body({ quantity: 11 }))).toMatchObject({ ok: false, field: 'quantity' });
    expect(validateReapCreateBody(body({ idempotency_key: 'short' }))).toMatchObject({ ok: false, field: 'idempotency_key' });
  });

  it('builds the UCP create_checkout arguments the Reap lane reads', () => {
    const r = validateReapCreateBody(body());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.market).toBe('US');
    const args = buildCreateCheckoutArgs(r.input, {
      consentVersion: 'reap-agentic-v1',
      profileUrl: 'https://agent.pivota.cc/.well-known/ucp-agent',
      expectedMerchantDomain: 'judydoll.com',
    });
    expect(args).toEqual({
      meta: {
        'ucp-agent': { profile: 'https://agent.pivota.cc/.well-known/ucp-agent' },
        'idempotency-key': 'pivota-ui-reap:8d2f4c1e-8a7b-4f0e-9c1d-2b3a4c5d6e7f',
      },
      checkout: {
        line_items: [{ item: { id: 'sig_6433c8107859a484fb72d14861e84690' }, quantity: 1 }],
        buyer: { email: 'ada@example.test', consent_version: 'reap-agentic-v1' },
        context: { address_country: 'US' },
        fulfillment: {
          methods: [
            {
              type: 'shipping',
              destinations: [
                {
                  first_name: 'Ada',
                  last_name: 'Lovelace',
                  phone_number: '+15550100',
                  street_address: '900 Brannan St',
                  extended_address: 'Suite 400',
                  address_locality: 'San Francisco',
                  address_region: 'CA',
                  postal_code: '94103',
                  address_country: 'US',
                },
              ],
            },
          ],
        },
        reap: { expected_merchant_domain: 'judydoll.com' },
      },
    });
  });

  it('never sends a price', () => {
    const r = validateReapCreateBody(body({ unit_price: 1, price: 1, total: 1 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify(buildCreateCheckoutArgs(r.input, { consentVersion: 'v', expectedMerchantDomain: 'judydoll.com' }))).not.toMatch(/price|amount|total/);
  });
});

describe('contact and market-specific destination validation', () => {
  it.each(['123', '14155550100', '+0123456789', '+1415abc0100', '+1234567890123456'])('rejects malformed phone %s', (phone) => {
    expect(validateReapCreateBody(body({ buyer: { ...buyer, phone } }))).toMatchObject({ ok: false, field: 'buyer.phone' });
  });
  it.each(['US', 'CA', 'AU'])('requires a region in %s', (country) => {
    expect(validateReapCreateBody(body({ buyer: { ...buyer, country, region: '' } }))).toMatchObject({ ok: false, field: 'buyer.region' });
  });
  it('validates state/province codes and each supported postcode shape', () => {
    for (const country of ['US', 'CA', 'AU']) expect(validateReapCreateBody(body({ buyer: { ...buyer, country, region: '123' } }))).toMatchObject({ ok: false, field: 'buyer.region' });
    expect(validateReapCreateBody(body({ buyer: { ...buyer, country: 'SG', region: '', postal_code: '018956' } })).ok).toBe(true);
    expect(validateReapCreateBody(body({ buyer: { ...buyer, country: 'SG', region: '', postal_code: '01895' } }))).toMatchObject({ ok: false, field: 'buyer.postal_code' });
    expect(validateReapCreateBody(body({ buyer: { ...buyer, country: 'CA', region: 'ON', postal_code: 'M5V 3A8' } })).ok).toBe(true);
    expect(validateReapCreateBody(body({ buyer: { ...buyer, country: 'AU', region: 'NSW', postal_code: '2000' } })).ok).toBe(true);
  });
});
