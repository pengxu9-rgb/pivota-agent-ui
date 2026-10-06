import { describe, expect, it } from 'vitest';
import live from '@/features/pdp/__fixtures__/canonicalOfferLive20261004/pg-catalog-group-member-content-20261006.json';
import { mapPdpV2ToPdpPayload } from '@/features/pdp/adapter/mapPdpV2ToPdpPayload';
import { matchesPdpRequestIdentity } from './commerceAvailability';

// Actual production reply 2026-10-06 for /products/pg_catalog_0c20e6cda1a4b440 (read-only): the group
// resolved one member listing and served its content from another member. The page 500'd.
const GROUP = 'pg_catalog_0c20e6cda1a4b440';
const groupRequest = { product_id: GROUP, subject: { type: 'product_group', id: GROUP } };

describe('a product-group route served from another member', () => {
  it('maps the actual production reply', () => {
    expect(matchesPdpRequestIdentity(structuredClone(live), groupRequest)).toBe(true);
    expect(mapPdpV2ToPdpPayload(structuredClone(live) as any, groupRequest)).not.toBeNull();
  });

  it('still refuses a reply for a different group', () => {
    const other = { product_id: 'pg_catalog_ffffffffffffffff', subject: { type: 'product_group', id: 'pg_catalog_ffffffffffffffff' } };
    expect(matchesPdpRequestIdentity(structuredClone(live), other)).toBe(false);
  });

  it('a product (non-group) request still requires the displayed listing to be the resolved one', () => {
    const reply: any = structuredClone(live);
    const sig = reply.modules.find((m: any) => m.type === 'canonical').data.pdp_payload.product.product_id;
    reply.metadata.identity_resolution.requested_product_group_id = null;
    reply.subject = { type: 'product_group', id: 'sig_4245f674d12b1c5ef5559f5d', canonical_product_ref: reply.subject.canonical_product_ref };
    expect(matchesPdpRequestIdentity(reply, { product_id: sig })).toBe(false);
  });
});
