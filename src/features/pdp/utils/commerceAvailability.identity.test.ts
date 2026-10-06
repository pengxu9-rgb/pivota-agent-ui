import { describe, expect, it } from 'vitest';
import verifiedFullCream from '@/features/pdp/__fixtures__/canonicalOfferLive20261004/fullcream-verified-current-own-offer.json';
import { mapPdpV2ToPdpPayload } from '@/features/pdp/adapter/mapPdpV2ToPdpPayload';
import { matchesPdpRequestIdentity } from './commerceAvailability';

// Live 2026-10-06: a canonical PDP served under its product group carries subject
// {type: product_group, id: <group sig>, canonical_product_ref: {pivota_signature_id: <requested sig>}}.
// Requiring subject.id === requested sig rejected every such reply and the page 500'd.
function groupedReply() {
  const response = structuredClone((verifiedFullCream as any).body);
  const canonical = response.modules.find((module: any) => module.type === 'canonical').data;
  const product = canonical.pdp_payload.product;
  const sig = product.product_id;
  response.subject = { type: 'product_group', id: 'sig_b9406aae76c278684d678543', canonical_product_ref: {
    merchant_id: product.merchant_id, product_id: product.source_product_id || product.product_id, pivota_signature_id: sig } };
  return { response, sig };
}

describe('a canonical PDP served under its product group', () => {
  it('binds to the requested signature through the group subject', () => {
    const { response, sig } = groupedReply();
    expect(matchesPdpRequestIdentity(response, { product_id: sig })).toBe(true);
    expect(mapPdpV2ToPdpPayload(response, { product_id: sig })).not.toBeNull();
  });

  it.each([
    ['another signature', (ref: any) => { ref.pivota_signature_id = 'sig_00000000000000000000000000000000'; }],
    ['another seller', (ref: any) => { ref.merchant_id = 'merch_obs_someone_else'; }],
    ['another source product', (ref: any) => { ref.product_id = 'someone:else'; }],
  ])('refuses a group subject naming %s', (_label, mutate) => {
    const { response, sig } = groupedReply();
    mutate(response.subject.canonical_product_ref);
    expect(matchesPdpRequestIdentity(response, { product_id: sig })).toBe(false);
  });

  it('refuses a group subject without a canonical product reference', () => {
    const { response, sig } = groupedReply();
    delete response.subject.canonical_product_ref;
    expect(matchesPdpRequestIdentity(response, { product_id: sig })).toBe(false);
  });
});
