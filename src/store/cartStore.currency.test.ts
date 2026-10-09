import { beforeEach, describe, expect, it } from 'vitest';

import { cartCurrencies, cartSubtotal, normalizeCartCurrency, useCartStore } from './cartStore';

const line = (id: string, price: number, currency: string | undefined, quantity = 1) => ({
  id, product_id: id, title: `Item ${id}`, price, currency, quantity, imageUrl: '/placeholder.svg', merchant_id: 'm1',
});

describe('the bag subtotal is a money value, or nothing', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useCartStore.setState({ items: [] });
  });

  it('one currency: the sum, in that currency; an empty bag has no currency', () => {
    expect(cartSubtotal([])).toEqual({ mixed: false, amount: 0, currency: null });
    expect(cartSubtotal([line('a', 23, 'USD', 2), line('b', 4.5, 'usd')])).toEqual({ mixed: false, amount: 50.5, currency: 'USD' });
    expect(cartSubtotal([line('a', 3500, 'JPY')])).toEqual({ mixed: false, amount: 3500, currency: 'JPY' });
  });

  it('two currencies: no sum at all, the currencies named', () => {
    expect(cartSubtotal([line('a', 23, 'USD'), line('b', 3500, 'JPY')])).toEqual({ mixed: true, currencies: ['USD', 'JPY'] });
    expect(cartCurrencies([line('a', 1, 'SGD'), line('b', 1, 'sgd'), line('c', 1, 'USD')])).toEqual(['SGD', 'USD']);
  });

  it('a line with no currency is a legacy USD line, never silently a different one', () => {
    expect(normalizeCartCurrency(undefined)).toBeNull();
    expect(normalizeCartCurrency('jpy')).toBe('JPY');
    expect(normalizeCartCurrency('US$')).toBeNull();
    expect(cartSubtotal([line('a', 23, undefined), line('b', 3500, 'JPY')])).toEqual({ mixed: true, currencies: ['USD', 'JPY'] });
  });

  it('addItem stamps the normalised currency on the line and getSubtotal reads the store', () => {
    useCartStore.getState().addItem(line('a', 3500, ' jpy '));
    expect(useCartStore.getState().items[0].currency).toBe('JPY');
    useCartStore.getState().addItem(line('b', 1, undefined));
    expect(useCartStore.getState().items[1].currency).toBe('USD');
    expect(useCartStore.getState().getSubtotal()).toEqual({ mixed: true, currencies: ['JPY', 'USD'] });
  });

  it('a v2 persisted bag (lines without a currency) migrates to USD lines', () => {
    const migrate = useCartStore.persist.getOptions().migrate!;
    const migrated = migrate({ items: [line('a', 23, undefined), line('b', 9, 'GBP')] }, 2) as { items: Array<{ currency?: string }> };
    expect(migrated.items.map((i) => i.currency)).toEqual(['USD', 'GBP']);
    const same = migrate({ items: [line('a', 23, 'JPY')] }, 3) as { items: Array<{ currency?: string }> };
    expect(same.items[0].currency).toBe('JPY');
  });
});
