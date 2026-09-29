// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { itemIdOfReapCheckoutId, productKeyOfReapCheckoutId, sellerOfReapCheckoutId } from './seller.server';
import { DEMO_MERCHANT_ID, REAP_ID } from './__fixtures__/checkouts';

const enc = (snap: unknown) =>
  `reap_rp_0123456789abcdef01234567.${Buffer.from(JSON.stringify(snap)).toString('base64url')}`;
const good = { v: 1, i: 'sig_x', k: 'prod::merch_a::shopify::123', q: 1, c: 'USD', u: 100 };

describe('seller of a Reap checkout id (the lane\'s v:1 snapshot)', () => {
  it('reads the merchant segment of the product key, and the echoed item id', () => {
    expect(sellerOfReapCheckoutId(REAP_ID)).toBe(DEMO_MERCHANT_ID);
    expect(sellerOfReapCheckoutId(enc(good))).toBe('merch_a');
    expect(itemIdOfReapCheckoutId(enc(good))).toBe('sig_x');
    expect(productKeyOfReapCheckoutId(enc(good))).toBe('prod::merch_a::shopify::123');
  });

  it('fails closed on anything but the exact v:1 shape', () => {
    for (const snap of [
      { ...good, v: 2 },
      { ...good, v: '1' },
      { ...good, k: 'not-a-product-key' },
      { ...good, k: 'prod::::shopify::1' },
      { ...good, i: 7 },
      [good],
    ]) {
      expect(sellerOfReapCheckoutId(enc(snap)), JSON.stringify(snap)).toBeNull();
    }
    for (const id of ['', 'esc_x', 'reap_rp_zz.abc', `${REAP_ID}!`, 42, null]) {
      expect(sellerOfReapCheckoutId(id)).toBeNull();
    }
  });
});
