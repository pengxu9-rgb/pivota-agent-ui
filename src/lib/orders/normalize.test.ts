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

  it('reads refund summary fields from list payload', () => {
    const normalized = normalizeOrderListItem({
      order_id: 'o_list_3',
      currency: 'USD',
      total_amount_minor: 2500,
      status: 'partially_refunded',
      payment_status: 'partially_refunded',
      refund_status: 'partially_refunded',
      total_refunded_minor: 500,
      fulfillment_status: 'fulfilled',
      delivery_status: 'delivered',
      created_at: '2026-04-22T12:00:00.000Z',
    });

    expect(normalized.refundStatus).toBe('partially_refunded');
    expect(normalized.totalRefundedMinor).toBe(500);
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

describe('normalizeOrderDetail pricing', () => {
  it('prefers authoritative pricing breakdown from the order payload', () => {
    const normalized = normalizeOrderDetail({
      order: {
        order_id: 'o_pricing_1',
        merchant_id: 'merchant_root',
        currency: 'USD',
        total_amount_minor: 953,
        status: 'paid',
        created_at: '2026-02-24T10:00:00.000Z',
        pricing: {
          subtotal_minor: 169,
          discount_total_minor: 16,
          shipping_fee_minor: 800,
          tax_minor: 0,
          total_amount_minor: 953,
        },
      },
      items: [
        {
          line_item_id: 'line_1',
          title: 'Product A',
          product_id: 'prod_a',
          quantity: 1,
          unit_price_minor: 169,
          subtotal_minor: 169,
        },
      ],
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.amounts).toEqual({
      subtotalMinor: 169,
      discountTotalMinor: 16,
      shippingFeeMinor: 800,
      taxMinor: 0,
      totalAmountMinor: 953,
    });
  });

  it('falls back to pricing_quote.pricing when direct pricing is absent', () => {
    const normalized = normalizeOrderDetail({
      order: {
        order_id: 'o_pricing_quote_1',
        merchant_id: 'merchant_root',
        currency: 'USD',
        total_amount_minor: 953,
        status: 'refunded',
        created_at: '2026-04-22T01:58:43.884266+00:00',
      },
      pricing_quote: {
        pricing: {
          subtotal: '1.69',
          discount_total: '0.16',
          shipping_fee: '8.00',
          tax: '0.00',
          total: '9.53',
        },
      },
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.amounts).toEqual({
      subtotalMinor: 169,
      discountTotalMinor: 16,
      shippingFeeMinor: 800,
      taxMinor: 0,
      totalAmountMinor: 953,
    });
  });
});
describe('normalizeOrderDetail refund PSP telemetry', () => {
  it('parses latest refund tracking snapshot and history', () => {
    const normalized = normalizeOrderDetail({
      order: {
        order_id: 'o_refund_1',
        merchant_id: 'merchant_root',
        currency: 'USD',
        total_amount_minor: 953,
        status: 'refunded',
        payment_status: 'refunded',
        created_at: '2026-04-22T01:58:43.884266+00:00',
      },
      refund: {
        status: 'refunded',
        total_refunded_minor: 953,
        currency: 'USD',
        psp: {
          provider: 'stripe',
          latest: {
            provider: 'stripe',
            refund_id: 're_test_123',
            status: 'succeeded',
            amount_minor: 953,
            currency: 'USD',
            payment_intent_id: 'pi_test_123',
            destination_type: 'card',
            destination_entry_type: 'refund',
            is_reversal: false,
            reference_status: 'pending',
            reference_type: 'acquirer_reference_number',
            tracking_reference_kind: 'ARN',
            source_event: 'refund.refresh',
            observed_at: '2026-04-22T14:59:17.500759+00:00',
          },
          history: [
            {
              provider: 'stripe',
              refund_id: 're_test_123',
              status: 'succeeded',
              amount_minor: 953,
              currency: 'USD',
              payment_intent_id: 'pi_test_123',
              destination_type: 'card',
              destination_entry_type: 'refund',
              is_reversal: false,
              reference_status: 'pending',
              reference_type: 'acquirer_reference_number',
              tracking_reference_kind: 'ARN',
              source_event: 'refund.refresh',
              observed_at: '2026-04-22T14:59:17.500759+00:00',
            },
          ],
        },
      },
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.refund.psp?.provider).toBe('stripe');
    expect(normalized?.refund.psp?.latest).toMatchObject({
      refundId: 're_test_123',
      status: 'succeeded',
      amountMinor: 953,
      paymentIntentId: 'pi_test_123',
      destinationType: 'card',
      destinationEntryType: 'refund',
      isReversal: false,
      referenceStatus: 'pending',
      referenceType: 'acquirer_reference_number',
      trackingReferenceKind: 'ARN',
    });
    expect(normalized?.refund.psp?.history).toHaveLength(1);
  });
});
