import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTENT_KEY, contentKeyAliasReply } from '@/features/pdp/__fixtures__/contentKeyAlias';
import legacyReferralReply from '@/features/pdp/__fixtures__/contentKeyRoute20261027/blind-barber-content-key.json';

vi.mock('next/cache', () => ({ unstable_cache: (fn: (...args: unknown[]) => unknown) => fn, unstable_noStore: () => undefined }));
import { getPdpV2 } from './api';

afterEach(() => vi.restoreAllMocks());

describe('getPdpV2 content-key identity', () => {
  it('preserves the integrated legacy referral route output', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(legacyReferralReply), { status: 200 }));
    await expect(getPdpV2({ product_id: CONTENT_KEY, allow_read_only: true })).resolves.toEqual(legacyReferralReply);
  });

  it('accepts a gateway alias bound to the requested row and displayed seller', async () => {
    const response = contentKeyAliasReply();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    await expect(getPdpV2({ product_id: CONTENT_KEY, allow_read_only: true })).resolves.toEqual(response);
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.payload.product_ref).toEqual({ product_id: CONTENT_KEY });
  });

  it('rejects a gateway response substituting another row', async () => {
    const response = contentKeyAliasReply();
    response.metadata.identity_resolution.content_key_resolution.product_id = 'ext_other';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    await expect(getPdpV2({ product_id: CONTENT_KEY, allow_read_only: true })).rejects.toThrow('PDP response identity did not match');
  });
});
