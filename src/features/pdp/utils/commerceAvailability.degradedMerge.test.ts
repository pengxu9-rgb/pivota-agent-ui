import { describe, expect, it } from 'vitest';
import verifiedReceipt from '@/features/pdp/__fixtures__/canonicalOfferLive20261004/fullcream-verified-current-own-offer.json';
import readOnlyReceipt from '@/features/pdp/__fixtures__/canonicalOfferLive20261004/sig_6bb6c7ae7b7e71e838aefb564c60371a.json';
import { mapPdpV2ToPdpPayload } from '@/features/pdp/adapter/mapPdpV2ToPdpPayload';
import type { PDPPayload } from '@/features/pdp/types';
import { mergeDegradedReadCommerce, stampPdpResponseCommerce } from './commerceAvailability';

// A browser read: the proof window starts now and is stamped on arrival, as getPdpV2 does.
function browserRead(receipt: { body: unknown }, receivedAt = Date.now()) {
  const response = structuredClone(receipt.body) as any;
  const data = response.modules.find((module: any) => module.type === 'canonical')?.data;
  for (const proof of [response.metadata?.commerce, data?.commerce, data?.pdp_payload?.commerce]) {
    if (proof?.state === 'ready') {
      proof.verified_at = new Date(receivedAt).toISOString();
      proof.expires_at = new Date(receivedAt + 60000).toISOString();
    }
  }
  return stampPdpResponseCommerce(response, receivedAt);
}

// The server payload as the cached route hands it to the browser.
const serverPayload = (): PDPPayload => {
  const cached = browserRead(verifiedReceipt);
  cached.metadata.commerce_verification = 'refresh_required';
  const payload = mapPdpV2ToPdpPayload(cached)!;
  return { ...payload, quality_signals: { gating: { from_server: true } } };
};
const freshRead = (receivedAt?: number): PDPPayload => {
  const payload = mapPdpV2ToPdpPayload(browserRead(verifiedReceipt, receivedAt))!;
  return {
    ...payload,
    product: { ...payload.product, title: 'Partial read title', description: 'Partial read description' },
    quality_signals: { gating: { from_degraded_read: true } },
  };
};
const variantId = (payload: PDPPayload) => String(payload.product.variants[0].variant_id);

describe('mergeDegradedReadCommerce', () => {
  it('merges a fresh proof for this exact listing, and only its commerce', () => {
    const server = serverPayload();
    const fresh = freshRead();
    const merged = mergeDegradedReadCommerce(server, fresh)!;
    expect(merged).not.toBeNull();
    expect(merged.commerce).toBe(fresh.commerce);
    expect(merged.commerce_verification).toBeUndefined();
    expect(merged.product.variants).toEqual(fresh.product.variants);
    // Nothing that is not commerce comes from the degraded read.
    expect(merged.product.title).toBe(server.product.title);
    expect(merged.product.description).toEqual(server.product.description);
    expect(merged.quality_signals).toEqual({ gating: { from_server: true } });
  });

  it('drops the degraded read quality_signals even when the page has none', () => {
    const { quality_signals: _unused, ...server } = serverPayload();
    const merged = mergeDegradedReadCommerce(server as PDPPayload, freshRead())!;
    expect(merged).not.toHaveProperty('quality_signals');
  });

  it.each([
    ['no re-read', () => null],
    ['a read-only reply (no proof)', () => mapPdpV2ToPdpPayload(browserRead(readOnlyReceipt))],
    ['a proof received two minutes ago (lapsed)', () => freshRead(Date.now() - 120000)],
    ['a proof received in the future', () => freshRead(Date.now() + 120000)],
    ['a re-read still pending verification', () => ({ ...freshRead(), commerce_verification: 'refresh_required' as const })],
  ])('refuses %s', (_label, fresh) => {
    expect(mergeDegradedReadCommerce(serverPayload(), fresh() as PDPPayload | null)).toBeNull();
  });

  it('refuses a proof that was current when mapped but has lapsed by the time it is merged', () => {
    const fresh = freshRead();
    expect(mergeDegradedReadCommerce(serverPayload(), fresh, Date.now())).not.toBeNull();
    expect(mergeDegradedReadCommerce(serverPayload(), fresh, Date.now() + 61000)).toBeNull();
  });

  it.each<[string, (fresh: PDPPayload, server: PDPPayload) => void]>([
    ['another product id', (fresh) => { fresh.product = { ...fresh.product, product_id: 'sig_other' }; }],
    ['another merchant on the re-read', (fresh) => { fresh.product = { ...fresh.product, merchant_id: 'merch_other' }; }],
    ['a proof naming another seller', (fresh) => {
      fresh.commerce = { ...(fresh.commerce as any), product_ref: { ...(fresh.commerce as any).product_ref, merchant_id: 'merch_other' } };
    }],
    ['a proof naming another source product', (fresh) => {
      fresh.commerce = { ...(fresh.commerce as any), product_ref: { ...(fresh.commerce as any).product_ref, product_id: 'other:product' } };
    }],
    ['an extra variant on the re-read', (fresh) => {
      fresh.product = { ...fresh.product, variants: [...fresh.product.variants, { ...fresh.product.variants[0], variant_id: 'v_extra' }] };
    }],
    ['a variant missing from the re-read', (fresh, server) => {
      server.product = { ...server.product, variants: [...server.product.variants, { ...server.product.variants[0], variant_id: 'v_extra' }] };
    }],
    ['a different variant id on the re-read', (fresh) => {
      fresh.product = { ...fresh.product, variants: [{ ...fresh.product.variants[0], variant_id: 'v_other' }] };
    }],
    ['a selected variant that is not on the page', (fresh) => {
      fresh.commerce = { ...(fresh.commerce as any), selected_variant_id: 'v_other' };
    }],
    ['a verified variant that is not on the page', (fresh) => {
      const proof = fresh.commerce as any;
      fresh.commerce = { ...proof, verified_variants: [...proof.verified_variants, { ...proof.verified_variants[0], variant_id: 'v_other' }] };
    }],
    ['a page with no variants', (_fresh, server) => { server.product = { ...server.product, variants: [] }; }],
    ['a page with a variant that has no id', (fresh, server) => {
      server.product = { ...server.product, variants: [...server.product.variants, { ...server.product.variants[0], variant_id: '' }] };
      fresh.product = { ...fresh.product, variants: [...fresh.product.variants, { ...fresh.product.variants[0], variant_id: '' }] };
    }],
    ['a page with a duplicated variant id', (fresh, server) => {
      server.product = { ...server.product, variants: [server.product.variants[0], server.product.variants[0]] };
      fresh.product = { ...fresh.product, variants: [fresh.product.variants[0], fresh.product.variants[0]] };
    }],
  ])('refuses a proof for %s', (_label, change) => {
    const server = serverPayload();
    const fresh = freshRead();
    expect(variantId(fresh)).toBe(variantId(server));
    change(fresh, server);
    expect(mergeDegradedReadCommerce(server, fresh)).toBeNull();
  });
});
