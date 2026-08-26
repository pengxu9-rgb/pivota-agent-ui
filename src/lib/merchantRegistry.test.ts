import { afterEach, describe, expect, it } from 'vitest';
import {
  clearMerchantRegistry,
  lookupMerchantName,
  recordMerchantName,
  recordMerchantNamesFromProducts,
} from './merchantRegistry';

afterEach(() => {
  clearMerchantRegistry();
});

describe('merchantRegistry', () => {
  it('records and looks up a single (id → name) pair', () => {
    recordMerchantName('merch_a', 'Aurora');
    expect(lookupMerchantName('merch_a')).toBe('Aurora');
  });

  it('returns null for unknown ids', () => {
    expect(lookupMerchantName('merch_unknown')).toBeNull();
    expect(lookupMerchantName('')).toBeNull();
    expect(lookupMerchantName(null)).toBeNull();
    expect(lookupMerchantName(undefined)).toBeNull();
  });

  it('ignores blank ids and blank names — no synthesis', () => {
    recordMerchantName('', 'Ghost');
    recordMerchantName('merch_b', '');
    recordMerchantName(null, null);
    expect(lookupMerchantName('merch_b')).toBeNull();
  });

  it('refuses to memoize the merchant_id-as-name fallback', () => {
    // Callers sometimes default merchant_name to merchant_id when missing.
    // The registry refuses to record that so the cart drawer's id-fallback
    // path stays distinguishable from a real merchant_name capture.
    recordMerchantName('merch_c', 'merch_c');
    expect(lookupMerchantName('merch_c')).toBeNull();
  });

  it('bulk-records from a product array, skipping incomplete entries', () => {
    recordMerchantNamesFromProducts([
      { merchant_id: 'merch_a', merchant_name: 'Aurora' },
      { merchant_id: 'merch_b', merchant_name: 'Foundry' },
      { merchant_id: 'merch_c', merchant_name: null },
      { merchant_id: '', merchant_name: 'Orphan' },
      null,
      undefined,
    ]);
    expect(lookupMerchantName('merch_a')).toBe('Aurora');
    expect(lookupMerchantName('merch_b')).toBe('Foundry');
    expect(lookupMerchantName('merch_c')).toBeNull();
  });

  it('overwrites a previous capture when the name changes', () => {
    recordMerchantName('merch_a', 'Aurora');
    recordMerchantName('merch_a', 'Aurora House');
    expect(lookupMerchantName('merch_a')).toBe('Aurora House');
  });

  it('handles a noisy product array without throwing', () => {
    expect(() => recordMerchantNamesFromProducts([])).not.toThrow();
    expect(() => recordMerchantNamesFromProducts(null as any)).not.toThrow();
  });
});
