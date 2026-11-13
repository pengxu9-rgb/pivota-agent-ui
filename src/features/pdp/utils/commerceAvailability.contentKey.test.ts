import { describe, expect, it } from 'vitest';
import { CONTENT_KEY, MERCHANT_ID, contentKeyAliasReply } from '../__fixtures__/contentKeyAlias';
import legacyReferralReply from '../__fixtures__/contentKeyRoute20261027/blind-barber-content-key.json';
import { mapPdpV2ToPdpPayload } from '../adapter/mapPdpV2ToPdpPayload';
import { hasBoundContentKeyResolution, isValidVerifiedPdpResponse, matchesPdpRequestIdentity } from './commerceAvailability';

const expected = { product_id: CONTENT_KEY };

describe('an unminted content-key route bound to its catalog listing', () => {
  it('maps the integrated legacy referral route output without changing its offer contract', () => {
    // Real local gateway route output with the incident-shaped DB fixture, not a production capture.
    const response = structuredClone(legacyReferralReply);
    expect(hasBoundContentKeyResolution(response, CONTENT_KEY)).toBe(true);
    const mapped = mapPdpV2ToPdpPayload(response as any, expected);
    expect(mapped?.product.title).toBe('30 Proof Styling Cream');
    expect(mapped?.product.merchant_id).toBe(MERCHANT_ID);
    expect(mapped?.product.availability?.in_stock).toBe(false);
    expect(isValidVerifiedPdpResponse(response)).toBe(false);
  });

  it('accepts the exact row binding without granting purchase authority', () => {
    const response = contentKeyAliasReply();
    expect(hasBoundContentKeyResolution(response, CONTENT_KEY)).toBe(true);
    expect(matchesPdpRequestIdentity(response, expected)).toBe(true);
    const mapped = mapPdpV2ToPdpPayload(response, expected);
    expect(mapped?.product.title).toBe('30 Proof Styling Cream');
    expect(mapped?.product.purchase_eligible).toBe(false);
    expect(mapped?.offers).toEqual([]);
    expect(mapped?.actions).toEqual([]);
    expect(isValidVerifiedPdpResponse(response)).toBe(false);
  });

  it.each([
    ['missing alias', (reply: any) => { delete reply.metadata.identity_resolution.content_key_resolution; }],
    ['another content key', (reply: any) => { reply.metadata.identity_resolution.content_key_resolution.content_key = 'ck_00000000000000000000000000000000'; }],
    ['another source product', (reply: any) => { reply.metadata.identity_resolution.content_key_resolution.product_id = 'ext_other'; }],
    ['another seller', (reply: any) => { reply.metadata.identity_resolution.content_key_resolution.merchant_id = 'merch_obs_other'; }],
    ['missing product key', (reply: any) => { delete reply.metadata.identity_resolution.content_key_resolution.product_key; }],
    ['missing subject reference', (reply: any) => { delete reply.subject.canonical_product_ref; }],
    ['another subject content key', (reply: any) => { reply.subject.canonical_product_ref.content_key = 'ck_00000000000000000000000000000000'; }],
    ['another subject product key', (reply: any) => { reply.subject.canonical_product_ref.product_key = 'prod::other'; }],
    ['another subject seller', (reply: any) => { reply.subject.canonical_product_ref.merchant_id = 'merch_obs_other'; }],
    ['another resolved product', (reply: any) => { reply.metadata.identity_resolution.resolved_product_id = 'ext_other'; }],
    ['another resolved seller', (reply: any) => { reply.metadata.identity_resolution.resolved_merchant_id = 'merch_obs_other'; }],
    ['another requested product', (reply: any) => { reply.metadata.identity_resolution.requested_product_id = 'ck_00000000000000000000000000000000'; }],
  ])('rejects %s', (_label, mutate) => {
    const response = contentKeyAliasReply();
    mutate(response);
    expect(hasBoundContentKeyResolution(response, CONTENT_KEY)).toBe(false);
    expect(matchesPdpRequestIdentity(response, expected)).toBe(false);
    expect(mapPdpV2ToPdpPayload(response, expected)).toBeNull();
  });

  it('keeps an explicit seller constraint', () => {
    const response = contentKeyAliasReply();
    expect(matchesPdpRequestIdentity(response, { ...expected, merchant_id: MERCHANT_ID })).toBe(true);
    expect(matchesPdpRequestIdentity(response, { ...expected, merchant_id: 'merch_obs_other' })).toBe(false);
  });

  it('does not treat alias metadata as authority for a signature or an arbitrary route', () => {
    for (const id of ['sig_00000000000000000000000000000000', 'unknown-route']) {
      const response = contentKeyAliasReply();
      response.metadata.identity_resolution.requested_product_id = id;
      response.metadata.identity_resolution.content_key_resolution.content_key = id;
      response.subject.canonical_product_ref.content_key = id;
      expect(hasBoundContentKeyResolution(response, id)).toBe(false);
      expect(matchesPdpRequestIdentity(response, { product_id: id })).toBe(false);
    }
  });
});
