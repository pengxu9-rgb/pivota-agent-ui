export type SavingsSource = 'store_quote' | 'store_metadata' | 'payment_offer' | 'pivota' | 'shopify';
export type SavingsGroup = 'applied_store' | 'available_store' | 'cart_unlock' | 'payment_benefit';

export type SavingsPresentationItem = {
  id: string;
  group: SavingsGroup;
  source: SavingsSource;
  label: string;
  badge: string;
  status: string;
  kind?: string;
  amount?: number | null;
  currency?: string | null;
  displayOnly: boolean;
  affectsCheckoutTotal: boolean;
  progress?: {
    quantityRequired?: number;
    currentQuantity?: number;
    remainingQuantity?: number;
    subtotalRequired?: number;
    currentSubtotal?: number;
    remainingSubtotal?: number;
    currency?: string | null;
  };
  disclaimer?: string;
  raw?: Record<string, any>;
};

export type SavingsCheckoutRow = {
  id: string;
  label: string;
  amount?: number | null;
  currency?: string | null;
  rowType: 'store_discount' | 'payment_benefit' | 'total_charged_now';
  displayOnly: boolean;
};

export type SavingsPresentationModel = {
  contractVersion: 'savings.v1';
  appliedStoreDiscounts: SavingsPresentationItem[];
  availableStoreOffers: SavingsPresentationItem[];
  cartUnlocks: SavingsPresentationItem[];
  paymentBenefits: SavingsPresentationItem[];
  summaryBadges: string[];
  checkoutRows: SavingsCheckoutRow[];
  totals: {
    checkoutTotal?: number | null;
    currency?: string | null;
    estimatedPaymentBenefit?: number | null;
    estimatedTotalAfterPaymentOffer?: number | null;
  };
  agentFacing: {
    priceAuthority: 'pivota_quote_psp_charge';
    paymentBenefitsMutateCharge: false;
    externalAgentsCanRender: true;
  };
};

export type BuildSavingsPresentationInput = {
  promotion_lines?: any[];
  discount_evidence?: Record<string, any> | null;
  store_discount_evidence?: Record<string, any> | null;
  payment_offer_evidence?: Record<string, any> | null;
  payment_pricing?: Record<string, any> | null;
  pricing?: Record<string, any> | null;
  product?: Record<string, any> | null;
  offer?: Record<string, any> | null;
  variant?: Record<string, any> | null;
  quantity?: number | null;
  currency?: string | null;
};

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function nonEmpty(value: unknown): string {
  return String(value || '').trim();
}

function uniqueStrings(values: string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const normalized = nonEmpty(value);
    if (normalized && !out.includes(normalized)) out.push(normalized);
  }
  return out;
}

function evidenceOffers(evidence: Record<string, any> | null | undefined): any[] {
  return Array.isArray(evidence?.offers) ? evidence.offers.filter((item) => item && typeof item === 'object') : [];
}

function itemDisplay(raw: any): { badge: string; label: string; disclaimer?: string } {
  const display = raw?.display && typeof raw.display === 'object' ? raw.display : {};
  const badge = nonEmpty(display.badge) || nonEmpty(raw?.badge) || nonEmpty(raw?.label);
  const label =
    nonEmpty(display.short_copy) ||
    nonEmpty(display.detail_copy) ||
    nonEmpty(raw?.label) ||
    badge;
  const disclaimer = nonEmpty(display.disclaimer) || undefined;
  return { badge: badge || label || 'Offer available', label: label || badge || 'Offer available', disclaimer };
}

function normalizeProgress(raw: any): SavingsPresentationItem['progress'] | undefined {
  const minimum = raw?.minimum_requirement && typeof raw.minimum_requirement === 'object'
    ? raw.minimum_requirement
    : {};
  const remainingQuantity = toNumber(minimum.remaining_quantity);
  const remainingSubtotal = toNumber(minimum.remaining_subtotal);
  const quantityRequired = toNumber(minimum.quantity_required);
  const currentQuantity = toNumber(minimum.current_quantity);
  const subtotalRequired = toNumber(minimum.subtotal_required);
  const currentSubtotal = toNumber(minimum.current_subtotal);
  if (
    remainingQuantity == null &&
    remainingSubtotal == null &&
    quantityRequired == null &&
    subtotalRequired == null
  ) {
    return undefined;
  }
  return {
    ...(quantityRequired != null ? { quantityRequired } : {}),
    ...(currentQuantity != null ? { currentQuantity } : {}),
    ...(remainingQuantity != null ? { remainingQuantity } : {}),
    ...(subtotalRequired != null ? { subtotalRequired } : {}),
    ...(currentSubtotal != null ? { currentSubtotal } : {}),
    ...(remainingSubtotal != null ? { remainingSubtotal } : {}),
    currency: nonEmpty(minimum.currency) || null,
  };
}

function normalizePromotionLine(line: any, index: number, fallbackCurrency?: string | null): SavingsPresentationItem | null {
  const amount = Math.abs(toNumber(line?.amount) ?? 0);
  const label = nonEmpty(line?.label) || nonEmpty(line?.title) || nonEmpty(line?.code) || 'Store discount';
  const rawSource = nonEmpty(line?.source).toLowerCase();
  const source: SavingsSource = rawSource === 'pivota' || rawSource === 'pivota_infra' ? 'pivota' : 'store_quote';
  if (!label && amount <= 0) return null;
  return {
    id: nonEmpty(line?.id) || nonEmpty(line?.code) || `promotion-${index}`,
    group: 'applied_store',
    source,
    label,
    badge: label,
    status: 'applied',
    kind: nonEmpty(line?.discount_class) || nonEmpty(line?.method) || 'store_discount',
    amount,
    currency: nonEmpty(line?.currency) || fallbackCurrency || null,
    displayOnly: false,
    affectsCheckoutTotal: amount > 0,
    raw: line && typeof line === 'object' ? line : undefined,
  };
}

function storeOfferToItem(raw: any, index: number, fallbackCurrency?: string | null): SavingsPresentationItem {
  const { badge, label, disclaimer } = itemDisplay(raw);
  const kind = nonEmpty(raw?.discount_type) || 'store_offer';
  const status = nonEmpty(raw?.status) || 'unverified';
  const isCartUnlock =
    kind === 'bxgy' ||
    kind === 'free_shipping' ||
    status === 'unlockable' ||
    Boolean(raw?.minimum_requirement && Object.keys(raw.minimum_requirement).length);
  return {
    id: nonEmpty(raw?.store_discount_id) || nonEmpty(raw?.shopify_discount_node_id) || `store-offer-${index}`,
    group: isCartUnlock ? 'cart_unlock' : 'available_store',
    source: 'store_metadata',
    label,
    badge,
    status,
    kind,
    amount: null,
    currency: fallbackCurrency || null,
    displayOnly: true,
    affectsCheckoutTotal: false,
    progress: normalizeProgress(raw),
    disclaimer,
    raw,
  };
}

function paymentOfferToItem(raw: any, index: number, fallbackCurrency?: string | null): SavingsPresentationItem {
  const { badge, label, disclaimer } = itemDisplay(raw);
  const eligibility = raw?.eligibility && typeof raw.eligibility === 'object' ? raw.eligibility : {};
  const amount = toNumber(raw?.estimated_savings);
  return {
    id: nonEmpty(raw?.payment_offer_id) || `payment-offer-${index}`,
    group: 'payment_benefit',
    source: 'payment_offer',
    label,
    badge,
    status: nonEmpty(eligibility.status) || 'potential',
    kind: nonEmpty(raw?.benefit_kind) || 'payment_benefit',
    amount,
    currency: nonEmpty(raw?.benefit_currency) || fallbackCurrency || null,
    displayOnly: true,
    affectsCheckoutTotal: false,
    disclaimer: disclaimer || 'Final eligibility depends on selected payment method.',
    raw,
  };
}

export function buildSavingsPresentation(input: BuildSavingsPresentationInput): SavingsPresentationModel {
  const currency =
    nonEmpty(input.currency) ||
    nonEmpty(input.pricing?.currency) ||
    nonEmpty(input.payment_pricing?.currency) ||
    nonEmpty(input.product?.currency) ||
    nonEmpty(input.offer?.price?.currency) ||
    null;
  const checkoutTotal =
    toNumber(input.pricing?.total) ??
    toNumber(input.payment_pricing?.checkout_total) ??
    null;

  const appliedStoreDiscounts = (Array.isArray(input.promotion_lines) ? input.promotion_lines : [])
    .map((line, index) => normalizePromotionLine(line, index, currency))
    .filter((item): item is SavingsPresentationItem => Boolean(item));

  const storeItems = evidenceOffers(input.store_discount_evidence).map((offer, index) =>
    storeOfferToItem(offer, index, currency),
  );
  const availableStoreOffers = storeItems.filter((item) => item.group === 'available_store');
  const cartUnlocks = storeItems.filter((item) => item.group === 'cart_unlock');
  const paymentBenefits = evidenceOffers(input.payment_offer_evidence).map((offer, index) =>
    paymentOfferToItem(offer, index, currency),
  );

  const estimatedPaymentBenefit =
    toNumber(input.payment_pricing?.estimated_payment_benefit) ??
    paymentBenefits.reduce<number | null>((best, item) => {
      const amount = typeof item.amount === 'number' ? item.amount : null;
      if (amount == null) return best;
      return best == null || amount > best ? amount : best;
    }, null);
  const estimatedTotalAfterPaymentOffer =
    toNumber(input.payment_pricing?.estimated_total_after_payment_offer) ??
    (checkoutTotal != null && estimatedPaymentBenefit != null
      ? Math.max(0, checkoutTotal - estimatedPaymentBenefit)
      : null);

  const summaryBadges = uniqueStrings([
    ...appliedStoreDiscounts.map((item) => item.badge),
    ...cartUnlocks.map((item) => item.badge),
    ...availableStoreOffers.map((item) => item.badge),
    ...paymentBenefits.map((item) => item.badge),
  ]).slice(0, 2);

  const checkoutRows: SavingsCheckoutRow[] = [
    ...appliedStoreDiscounts
      .filter((item) => (item.amount ?? 0) > 0)
      .map((item) => ({
        id: item.id,
        label: item.label,
        amount: item.amount,
        currency: item.currency || currency,
        rowType: 'store_discount' as const,
        displayOnly: false,
      })),
    ...(estimatedPaymentBenefit && estimatedPaymentBenefit > 0
      ? [
          {
            id: 'estimated-payment-benefit',
            label: 'Estimated payment benefit',
            amount: estimatedPaymentBenefit,
            currency,
            rowType: 'payment_benefit' as const,
            displayOnly: true,
          },
        ]
      : []),
    ...(checkoutTotal != null
      ? [
          {
            id: 'total-charged-now',
            label: 'Total charged now',
            amount: checkoutTotal,
            currency,
            rowType: 'total_charged_now' as const,
            displayOnly: false,
          },
        ]
      : []),
  ];

  return {
    contractVersion: 'savings.v1',
    appliedStoreDiscounts,
    availableStoreOffers,
    cartUnlocks,
    paymentBenefits,
    summaryBadges,
    checkoutRows,
    totals: {
      checkoutTotal,
      currency,
      estimatedPaymentBenefit,
      estimatedTotalAfterPaymentOffer,
    },
    agentFacing: {
      priceAuthority: 'pivota_quote_psp_charge',
      paymentBenefitsMutateCharge: false,
      externalAgentsCanRender: true,
    },
  };
}

export function getSummaryBadges(model: SavingsPresentationModel, max = 2): string[] {
  return uniqueStrings(model.summaryBadges).slice(0, Math.max(0, max));
}
