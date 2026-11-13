import { describe, expect, it } from 'vitest';
import liveBody from '@/features/pdp/__fixtures__/liveRefresh/native226-live-body.json';
import readOnlyReceipt from '@/features/pdp/__fixtures__/canonicalOfferLive20261004/sig_6bb6c7ae7b7e71e838aefb564c60371a.json';
import verifiedReceipt from '@/features/pdp/__fixtures__/canonicalOfferLive20261004/fullcream-verified-current-own-offer.json';
import { enforceReadOnlyPdp } from '@/features/pdp/utils/commerceAvailability';
import { mapPdpV2ToPdpPayload } from './mapPdpV2ToPdpPayload';

const body = () => structuredClone(liveBody) as any;
const DESCRIPTOR = (liveBody as any).live_refresh;

describe('mapPdpV2ToPdpPayload carries the live-refresh descriptor', () => {
  it('carries a valid top-level descriptor onto the payload', () => {
    expect(mapPdpV2ToPdpPayload(body())!.live_refresh).toEqual({ v: 1, token: DESCRIPTOR.token, market: 'US' });
  });

  it('a response without one maps exactly as before', () => {
    const without = body();
    delete without.live_refresh;
    const mapped = mapPdpV2ToPdpPayload(without)!;
    expect(mapped).not.toHaveProperty('live_refresh');
    const { live_refresh: _drop, ...withDescriptor } = mapPdpV2ToPdpPayload(body())!;
    expect(mapped).toEqual(withDescriptor);
  });

  it.each([
    ['a token that is not v1.<b64url>.<b64url>', { ...DESCRIPTOR, token: 'v1.not base64.mac' }],
    ['a token over 4 KB', { ...DESCRIPTOR, token: `v1.${'a'.repeat(4100)}.mac` }],
    ['another version', { ...DESCRIPTOR, v: 2 }],
    ['no market', { v: 1, token: DESCRIPTOR.token }],
    ['a locale market', { ...DESCRIPTOR, market: 'en-US' }],
    ['a string', DESCRIPTOR.token],
  ])('drops %s', (_label, descriptor) => {
    const response = body();
    response.live_refresh = descriptor;
    expect(mapPdpV2ToPdpPayload(response)!).not.toHaveProperty('live_refresh');
  });

  it('never takes a descriptor from inside the canonical pdp_payload', () => {
    const response = body();
    response.modules.find((m: any) => m.type === 'canonical').data.pdp_payload.live_refresh = DESCRIPTOR;
    delete response.live_refresh;
    expect(mapPdpV2ToPdpPayload(response)!).not.toHaveProperty('live_refresh');
  });

  it('a read-only page drops it (enforceReadOnlyPdp)', () => {
    const response = structuredClone(readOnlyReceipt.body) as any;
    response.live_refresh = DESCRIPTOR;
    const mapped = mapPdpV2ToPdpPayload(response)!;
    expect(mapped.commerce).toMatchObject({ read_only: true });
    expect(mapped).not.toHaveProperty('live_refresh');
  });

  it('a verified page served from cache (pending a browser re-read) drops it', () => {
    const response = structuredClone(verifiedReceipt.body) as any;
    response.metadata.commerce_verification = 'refresh_required';
    response.live_refresh = DESCRIPTOR;
    const mapped = mapPdpV2ToPdpPayload(response)!;
    expect(mapped.commerce_verification).toBe('refresh_required');
    expect(mapped).not.toHaveProperty('live_refresh');
  });
});

describe('enforceReadOnlyPdp and the descriptor', () => {
  it('drops it from a page it rewrites', () => {
    const mapped = mapPdpV2ToPdpPayload(body())!;
    for (const page of [
      { ...mapped, commerce_verification: 'refresh_required' as const },
      { ...mapped, commerce: { state: 'unavailable', read_only: true, purchase_eligible: false, reason_code: 'CURRENT_OWN_OFFER_UNAVAILABLE' } as any },
    ]) {
      expect(enforceReadOnlyPdp(page)).not.toHaveProperty('live_refresh');
    }
  });

  it('leaves a served legacy page, descriptor included, as it is', () => {
    const mapped = mapPdpV2ToPdpPayload(body())!;
    expect(enforceReadOnlyPdp(mapped)).toBe(mapped);
    expect(enforceReadOnlyPdp(mapped).live_refresh?.token).toBe(DESCRIPTOR.token);
  });
});
