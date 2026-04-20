import { describe, expect, it } from 'vitest';
import { buildSavingsPresentation, getSummaryBadges } from './savingsPresentation';

describe('buildSavingsPresentation', () => {
  it('puts store-platform quote allocations under applied store discounts', () => {
    const model = buildSavingsPresentation({
      pricing: { total: 90, currency: 'USD' },
      promotion_lines: [{ id: 'SAVE10', label: 'SAVE10', amount: 10, discount_class: 'PRODUCT', source: 'woocommerce' }],
    });

    expect(model.contractVersion).toBe('savings.v1');
    expect(model.agentFacing.priceAuthority).toBe('pivota_quote_psp_charge');
    expect(model.appliedStoreDiscounts).toHaveLength(1);
    expect(model.appliedStoreDiscounts[0]).toMatchObject({
      label: 'SAVE10',
      source: 'store_quote',
      amount: 10,
      displayOnly: false,
      affectsCheckoutTotal: true,
    });
    expect(model.checkoutRows.find((row) => row.rowType === 'store_discount')).toMatchObject({
      label: 'SAVE10',
      amount: 10,
      displayOnly: false,
    });
  });

  it('treats unmet BXGY metadata as a cart unlock without changing checkout total', () => {
    const model = buildSavingsPresentation({
      pricing: { total: 60, currency: 'USD' },
      store_discount_evidence: {
        offers: [
          {
            store_discount_id: 'promo_bxgy',
            discount_type: 'bxgy',
            status: 'unlockable',
            display: { badge: 'Buy 3, get 1', short_copy: 'Buy 3, get 1 free' },
            minimum_requirement: {
              quantity_required: 3,
              current_quantity: 1,
              remaining_quantity: 2,
            },
          },
        ],
      },
    });

    expect(model.cartUnlocks).toHaveLength(1);
    expect(model.cartUnlocks[0]).toMatchObject({
      group: 'cart_unlock',
      displayOnly: true,
      affectsCheckoutTotal: false,
      progress: { quantityRequired: 3, currentQuantity: 1, remainingQuantity: 2 },
    });
    expect(model.totals.checkoutTotal).toBe(60);
  });

  it('keeps payment benefits display-only and separate from discounts', () => {
    const model = buildSavingsPresentation({
      pricing: { total: 100, currency: 'USD' },
      payment_pricing: {
        checkout_total: '100.00',
        estimated_payment_benefit: '5.00',
        estimated_total_after_payment_offer: '95.00',
      },
      payment_offer_evidence: {
        offers: [
          {
            payment_offer_id: 'mc_5',
            benefit_kind: 'percentage_off',
            benefit_currency: 'USD',
            estimated_savings: '5.00',
            eligibility: { status: 'potential' },
            display: { badge: 'Mastercard offer', short_copy: '5% with Mastercard' },
          },
        ],
      },
    });

    expect(model.appliedStoreDiscounts).toEqual([]);
    expect(model.paymentBenefits).toHaveLength(1);
    expect(model.paymentBenefits[0]).toMatchObject({
      source: 'payment_offer',
      displayOnly: true,
      affectsCheckoutTotal: false,
    });
    expect(model.totals.checkoutTotal).toBe(100);
    expect(model.totals.estimatedPaymentBenefit).toBe(5);
    expect(model.checkoutRows.find((row) => row.rowType === 'payment_benefit')).toMatchObject({
      label: 'Estimated payment benefit',
      amount: 5,
      displayOnly: true,
    });
  });

  it('limits product-card badges to the safest first two signals', () => {
    const model = buildSavingsPresentation({
      promotion_lines: [{ label: '10% off at checkout', amount: 4 }],
      store_discount_evidence: {
        offers: [
          {
            store_discount_id: 'ship',
            discount_type: 'free_shipping',
            status: 'available',
            display: { badge: 'Free US shipping' },
          },
        ],
      },
      payment_offer_evidence: {
        offers: [
          {
            payment_offer_id: 'visa',
            eligibility: { status: 'potential' },
            display: { badge: 'Visa offer' },
          },
        ],
      },
    });

    expect(getSummaryBadges(model, 2)).toEqual(['10% off at checkout', 'Free US shipping']);
  });

  it('includes free-shipping coverage in compact badges', () => {
    const model = buildSavingsPresentation({
      store_discount_evidence: {
        offers: [
          {
            store_discount_id: 'ship_us',
            discount_type: 'free_shipping',
            status: 'available',
            display: {
              badge: 'Free shipping code',
              short_copy: 'Free shipping on all products • For United States',
            },
          },
        ],
      },
    });

    expect(model.cartUnlocks[0]).toMatchObject({
      badge: 'Free US shipping',
      label: 'Free shipping on all products • For United States',
    });
    expect(getSummaryBadges(model, 1)).toEqual(['Free US shipping']);
  });
});
