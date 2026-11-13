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
// The cached server payload carries no price at all, so the page currency is the one
// the server read priced it in (pdpServerPage passes it as initialPayloadCurrency).
const PAGE = { pageCurrency: 'USD' };
const merge = (server: PDPPayload, fresh: PDPPayload | null, options: { now?: number; pageCurrency?: string | null } = PAGE) =>
  mergeDegradedReadCommerce(server, fresh, options);
const merged = (result: ReturnType<typeof merge>) => {
  expect(result.status).toBe('merged');
  return (result as { payload: PDPPayload }).payload;
};
// The same verified read, priced in another currency throughout (internally consistent).
const freshReadIn = (currency: string): PDPPayload => {
  const response = JSON.parse(JSON.stringify(browserRead(verifiedReceipt)).replaceAll('"USD"', `"${currency}"`));
  return mapPdpV2ToPdpPayload(response)!;
};
const withVariantPrice = (payload: PDPPayload, currency: string): PDPPayload => ({
  ...payload,
  product: { ...payload.product, variants: payload.product.variants.map((variant) => ({ ...variant, price: { current: { amount: 19.95, currency } } })) },
});

describe('mergeDegradedReadCommerce', () => {
  it('merges a fresh proof for this exact listing, and only its commerce', () => {
    const server = serverPayload();
    const fresh = freshRead();
    const payload = merged(merge(server, fresh));
    expect(payload.commerce).toBe(fresh.commerce);
    expect(payload.commerce_verification).toBeUndefined();
    expect(payload.product.variants).toEqual(fresh.product.variants);
    // Nothing that is not commerce comes from the degraded read.
    expect(payload.product.title).toBe(server.product.title);
    expect(payload.product.description).toEqual(server.product.description);
    expect(payload.quality_signals).toEqual({ gating: { from_server: true } });
  });

  it('drops the degraded read quality_signals even when the page has none', () => {
    const { quality_signals: _unused, ...server } = serverPayload();
    expect(merged(merge(server as PDPPayload, freshRead()))).not.toHaveProperty('quality_signals');
  });

  it.each([
    ['no re-read', () => null],
    ['a read-only reply (no proof)', () => mapPdpV2ToPdpPayload(browserRead(readOnlyReceipt))],
    ['a proof received two minutes ago (lapsed)', () => freshRead(Date.now() - 120000)],
    ['a proof received in the future', () => freshRead(Date.now() + 120000)],
    ['a re-read still pending verification', () => ({ ...freshRead(), commerce_verification: 'refresh_required' as const })],
  ])('refuses %s', (_label, fresh) => {
    expect(merge(serverPayload(), fresh() as PDPPayload | null)).toEqual({ status: 'unverifiable' });
  });

  it('refuses a proof that was current when mapped but has lapsed by the time it is merged', () => {
    const fresh = freshRead();
    expect(merge(serverPayload(), fresh, { ...PAGE, now: Date.now() }).status).toBe('merged');
    expect(merge(serverPayload(), fresh, { ...PAGE, now: Date.now() + 61000 })).toEqual({ status: 'unverifiable' });
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
    expect(merge(server, fresh)).toEqual({ status: 'unverifiable' });
  });
});

describe('mergeDegradedReadCommerce: the price currency is always the page currency', () => {
  it('refuses a proof priced in another currency than the page', () => {
    const fresh = freshReadIn('SGD');
    expect((fresh.commerce as any).verified_variants[0].currency).toBe('SGD');
    expect(merge(serverPayload(), fresh)).toEqual({ status: 'currency_mismatch' });
    // Control: the same read priced in the page currency merges.
    expect(merge(serverPayload(), fresh, { pageCurrency: 'SGD' }).status).toBe('merged');
  });

  it('refuses when no page currency can be resolved', () => {
    expect(merge(serverPayload(), freshRead(), {})).toEqual({ status: 'currency_mismatch' });
    expect(merge(serverPayload(), freshRead(), { pageCurrency: 'usd' })).toEqual({ status: 'currency_mismatch' });
  });

  it("uses the page's displayed variant currency first, then its displayed price, then the server-read currency", () => {
    // Variant level beats both fallbacks.
    expect(merge(withVariantPrice(serverPayload(), 'USD'), freshRead(), { pageCurrency: 'SGD' }).status).toBe('merged');
    expect(merge(withVariantPrice(serverPayload(), 'SGD'), freshRead(), { pageCurrency: 'USD' })).toEqual({ status: 'currency_mismatch' });
    // Product level beats the server-read currency.
    const priced = (currency: string) => {
      const server = serverPayload();
      return { ...server, product: { ...server.product, price: { current: { amount: 19.95, currency } } } } as PDPPayload;
    };
    expect(merge(priced('USD'), freshRead(), { pageCurrency: 'SGD' }).status).toBe('merged');
    expect(merge(priced('SGD'), freshRead(), { pageCurrency: 'USD' })).toEqual({ status: 'currency_mismatch' });
  });

  it('refuses a proof in another currency even when the re-read shows no price to compare', () => {
    const fresh = freshRead();
    const unpriced = {
      ...fresh,
      product: { ...fresh.product, price: undefined, variants: fresh.product.variants.map(({ price: _price, ...variant }) => variant) },
    } as PDPPayload;
    expect(merge(serverPayload(), unpriced).status).toBe('merged');
    const proof = unpriced.commerce as any;
    const otherCurrencyProof = { ...unpriced, commerce: { ...proof, verified_variants: proof.verified_variants.map((entry: any) => ({ ...entry, currency: 'SGD' })) } } as PDPPayload;
    expect(merge(serverPayload(), otherCurrencyProof)).toEqual({ status: 'currency_mismatch' });
  });

  it('falls back past a malformed displayed currency to the next source', () => {
    expect(merge(withVariantPrice(serverPayload(), 'usd'), freshRead(), { pageCurrency: 'USD' }).status).toBe('merged');
  });

  it.each<[string, (fresh: PDPPayload) => PDPPayload]>([
    ['a variant price', (fresh) => withVariantPrice(fresh, 'SGD')],
    ['the product price', (fresh) => ({ ...fresh, product: { ...fresh.product, price: { current: { amount: 19.95, currency: 'SGD' } } } } as PDPPayload)],
    ['an offer price', (fresh) => ({ ...fresh, offers: [{ offer_id: 'o1', merchant_id: 'm1', price: { amount: 19.95, currency: 'SGD' } }] } as PDPPayload)],
  ])('refuses a merge that would bring in %s in another currency', (_label, change) => {
    expect(merge(serverPayload(), freshRead()).status).toBe('merged');
    expect(merge(serverPayload(), change(freshRead()))).toEqual({ status: 'currency_mismatch' });
  });
});
