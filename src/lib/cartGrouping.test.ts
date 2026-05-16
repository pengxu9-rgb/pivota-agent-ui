import { describe, it, expect } from 'vitest';
import type { CartItem } from '@/store/cartStore';
import {
  combinedCurrency,
  combinedItemCount,
  combinedSubtotal,
  groupCartByMerchant,
  merchantShipping,
  merchantSubtotal,
} from './cartGrouping';

function makeItem(overrides: Partial<CartItem>): CartItem {
  return {
    id: overrides.id ?? 'item_1',
    title: overrides.title ?? 'Test item',
    price: overrides.price ?? 10,
    quantity: overrides.quantity ?? 1,
    imageUrl: overrides.imageUrl ?? 'https://example.test/img.jpg',
    currency: overrides.currency ?? 'USD',
    ...overrides,
  };
}

describe('groupCartByMerchant', () => {
  it('groups items by merchant_id in first-seen order', () => {
    const items: CartItem[] = [
      makeItem({ id: 'a1', merchant_id: 'merch_a', merchant_name: 'Aurora', price: 100, quantity: 1 }),
      makeItem({ id: 'b1', merchant_id: 'merch_b', merchant_name: 'Foundry', price: 50, quantity: 2 }),
      makeItem({ id: 'a2', merchant_id: 'merch_a', merchant_name: 'Aurora', price: 25, quantity: 1 }),
    ];
    const groups = groupCartByMerchant(items);
    expect(groups).toHaveLength(2);
    expect(groups[0].merchantId).toBe('merch_a');
    expect(groups[1].merchantId).toBe('merch_b');
    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].subtotal).toBe(125);
    expect(groups[0].itemCount).toBe(2);
    expect(groups[1].subtotal).toBe(100);
    expect(groups[1].itemCount).toBe(2);
  });

  it('falls back to merchant_id when merchant_name is missing — never invents copy', () => {
    const items: CartItem[] = [
      makeItem({ id: 'x', merchant_id: 'merch_unknown', merchant_name: undefined }),
    ];
    const [group] = groupCartByMerchant(items);
    expect(group.merchantName).toBe('merch_unknown');
  });

  it('renders the unattributed bucket as "Other" when an item has no merchant_id', () => {
    const items: CartItem[] = [makeItem({ id: 'orphan', merchant_id: undefined })];
    const [group] = groupCartByMerchant(items);
    expect(group.merchantName).toBe('Other');
    expect(group.merchantId).toBe('__unknown__');
  });

  it('only carries currency when items agree; mixed currencies collapse to null', () => {
    const same = groupCartByMerchant([
      makeItem({ id: 'a', merchant_id: 'm', currency: 'USD' }),
      makeItem({ id: 'b', merchant_id: 'm', currency: 'USD' }),
    ]);
    expect(same[0].currency).toBe('USD');

    const mixed = groupCartByMerchant([
      makeItem({ id: 'a', merchant_id: 'm', currency: 'USD' }),
      makeItem({ id: 'b', merchant_id: 'm', currency: 'EUR' }),
    ]);
    expect(mixed[0].currency).toBeNull();
  });

  it('keeps merchant metadata only when present on the cart line (no synthesis)', () => {
    const items: CartItem[] = [
      makeItem({
        id: 'a',
        merchant_id: 'm',
        merchant_name: 'Aurora',
        merchant_location: 'Lisbon, PT',
        merchant_ship_estimate: '4–6 days',
        merchant_return_policy_label: 'Free returns · 30 days',
      }),
    ];
    const [group] = groupCartByMerchant(items);
    expect(group.merchantLocation).toBe('Lisbon, PT');
    expect(group.merchantShipEstimate).toBe('4–6 days');
    expect(group.merchantReturnPolicy).toBe('Free returns · 30 days');
  });

  it('leaves merchant metadata as null when the cart line lacks it', () => {
    const items: CartItem[] = [
      makeItem({ id: 'a', merchant_id: 'm', merchant_name: 'Aurora' }),
    ];
    const [group] = groupCartByMerchant(items);
    expect(group.merchantLocation).toBeNull();
    expect(group.merchantShipEstimate).toBeNull();
    expect(group.merchantReturnPolicy).toBeNull();
  });
});

describe('totals helpers', () => {
  const groups = groupCartByMerchant([
    makeItem({ id: 'a1', merchant_id: 'a', price: 100, quantity: 1, currency: 'USD' }),
    makeItem({ id: 'b1', merchant_id: 'b', price: 50, quantity: 2, currency: 'USD' }),
  ]);

  it('merchantSubtotal returns the group total', () => {
    expect(merchantSubtotal(groups[0])).toBe(100);
    expect(merchantSubtotal(groups[1])).toBe(100);
  });

  it('merchantShipping returns null until per-merchant quotes are wired', () => {
    expect(merchantShipping(groups[0])).toBeNull();
  });

  it('combinedSubtotal sums every group', () => {
    expect(combinedSubtotal(groups)).toBe(200);
  });

  it('combinedItemCount sums quantity across groups', () => {
    expect(combinedItemCount(groups)).toBe(3);
  });

  it('combinedCurrency reports the agreed code, null if any group disagrees', () => {
    expect(combinedCurrency(groups)).toBe('USD');
    const mixedGroups = groupCartByMerchant([
      makeItem({ id: 'a', merchant_id: 'a', currency: 'USD' }),
      makeItem({ id: 'b', merchant_id: 'b', currency: 'EUR' }),
    ]);
    expect(combinedCurrency(mixedGroups)).toBeNull();
  });
});
