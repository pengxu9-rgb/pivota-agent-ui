import { describe, expect, it } from 'vitest';
import { normalizeOrderDetail, normalizeOrderListItem } from '@/lib/orders/normalize';

describe('normalizeOrderListItem scope fields', () => {
  it('reads merchant_id from list payload', () => {
    const normalized = normalizeOrderListItem({
      order_id: 'o_list_1',
      merchant_id: 'merchant_scope',
      currency: 'USD',
      total_amount_minor: 1200,
      status: 'paid',
      payment_status: 'paid',
      fulfillment_status: 'not_fulfilled',
      delivery_status: 'not_shipped',
      created_at: '2026-02-24T10:00:00.000Z',
    });

    expect(normalized.id).toBe('o_list_1');
    expect(normalized.merchantId).toBe('merchant_scope');
  });

  it('accepts camelCase merchantId fallback', () => {
    const normalized = normalizeOrderListItem({
      order_id: 'o_list_2',
      merchantId: 'merchant_scope_2',
      currency: 'USD',
      total_amount_minor: 1200,
      status: 'paid',
      payment_status: 'paid',
      fulfillment_status: 'not_fulfilled',
      delivery_status: 'not_shipped',
      created_at: '2026-02-24T10:00:00.000Z',
    });

    expect(normalized.id).toBe('o_list_2');
    expect(normalized.merchantId).toBe('merchant_scope_2');
  });
});

describe('normalizeOrderDetail item product refs', () => {
  it('keeps explicit product_id and merchant_id from line item', () => {
    const normalized = normalizeOrderDetail({
      order: {
        order_id: 'o_1',
        merchant_id: 'merchant_root',
        currency: 'USD',
        total_amount_minor: 1200,
        status: 'paid',
        created_at: '2026-02-24T10:00:00.000Z',
      },
      items: [
        {
          item_id: 'line_1',
          title: 'Product A',
          product_id: 'prod_a',
          merchant_id: 'merchant_a',
          quantity: 1,
          unit_price_minor: 1200,
        },
      ],
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.items[0]?.productId).toBe('prod_a');
    expect(normalized?.items[0]?.merchantId).toBe('merchant_a');
  });

  it('reads product_ref and falls back merchant_id from order when missing on item', () => {
    const normalized = normalizeOrderDetail({
      order: {
        order_id: 'o_2',
        merchant_id: 'merchant_root',
        currency: 'USD',
        total_amount_minor: 9900,
        status: 'paid',
        created_at: '2026-02-24T10:00:00.000Z',
      },
      items: [
        {
          line_item_id: 'line_2',
          title: 'Product B',
          product_ref: {
            product_id: 'prod_b',
          },
          quantity: 1,
          unit_price_minor: 9900,
        },
      ],
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.items[0]?.productId).toBe('prod_b');
    expect(normalized?.items[0]?.merchantId).toBe('merchant_root');
  });

  it('keeps productId null when item has no explicit product reference', () => {
    const normalized = normalizeOrderDetail({
      order: {
        order_id: 'o_3',
        merchant_id: 'merchant_root',
        currency: 'USD',
        total_amount_minor: 5000,
        status: 'paid',
        created_at: '2026-02-24T10:00:00.000Z',
      },
      items: [
        {
          line_item_id: 'line_3',
          title: 'Product C',
          quantity: 1,
          unit_price_minor: 5000,
        },
      ],
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.items[0]?.productId).toBeNull();
    expect(normalized?.items[0]?.merchantId).toBeNull();
  });
});
