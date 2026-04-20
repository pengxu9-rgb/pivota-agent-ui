'use client';

import type { Offer, Product, Variant } from '@/features/pdp/types';
import { buildSavingsPresentation, type SavingsPresentationItem } from '@/lib/savingsPresentation';

function formatProgress(item: SavingsPresentationItem): string | null {
  const progress = item.progress;
  if (!progress) return null;
  if (typeof progress.remainingQuantity === 'number' && progress.remainingQuantity > 0) {
    return `Add ${progress.remainingQuantity} more to unlock this offer`;
  }
  if (typeof progress.remainingSubtotal === 'number' && progress.remainingSubtotal > 0) {
    const currency = progress.currency || item.currency || 'USD';
    try {
      const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(progress.remainingSubtotal);
      return `Add ${amount} more to unlock`;
    } catch {
      return `Add ${progress.remainingSubtotal.toFixed(2)} more to unlock`;
    }
  }
  if (item.status === 'available') return 'Eligible at checkout';
  return null;
}

function SavingsGroup({
  title,
  items,
}: {
  title: string;
  items: SavingsPresentationItem[];
}) {
  if (!items.length) return null;
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-normal text-slate-500">{title}</div>
      <div className="space-y-1">
        {items.slice(0, 3).map((item) => {
          const progress = formatProgress(item);
          return (
            <div key={`${item.group}-${item.id}`} className="flex items-start justify-between gap-3 text-xs">
              <div className="min-w-0">
                <div className="font-medium text-slate-900">{item.badge || item.label}</div>
                {progress ? (
                  <div className="mt-0.5 text-[11px] text-slate-500">{progress}</div>
                ) : item.status === 'unverified' ? (
                  <div className="mt-0.5 text-[11px] text-slate-500">Verified at checkout</div>
                ) : null}
              </div>
              {item.displayOnly ? (
                <span className="shrink-0 rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                  Estimate
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WaysToSave({
  product,
  selectedOffer,
  selectedVariant,
  quantity,
}: {
  product: Product;
  selectedOffer?: Offer | null;
  selectedVariant?: Variant | null;
  quantity?: number | null;
}) {
  const storeEvidence =
    selectedOffer?.store_discount_evidence ||
    selectedVariant?.store_discount_evidence ||
    product.store_discount_evidence;
  const paymentEvidence =
    selectedOffer?.payment_offer_evidence ||
    selectedVariant?.payment_offer_evidence ||
    product.payment_offer_evidence;
  const paymentPricing = selectedOffer?.payment_pricing || product.payment_pricing;
  const currency =
    selectedOffer?.price?.currency ||
    selectedVariant?.price?.current?.currency ||
    product.price?.current?.currency ||
    'USD';
  const total =
    selectedOffer?.price?.amount ??
    selectedVariant?.price?.current?.amount ??
    product.price?.current?.amount;
  const model = buildSavingsPresentation({
    store_discount_evidence: storeEvidence,
    payment_offer_evidence: paymentEvidence,
    payment_pricing: paymentPricing,
    pricing: { total, currency },
    product: product as any,
    offer: selectedOffer as any,
    variant: selectedVariant as any,
    quantity,
    currency,
  });

  const storeOffers = model.availableStoreOffers.filter((item) => item.kind !== 'free_shipping');
  const shippingOffers = model.cartUnlocks.filter((item) => item.kind === 'free_shipping');
  const cartOffers = model.cartUnlocks.filter((item) => item.kind !== 'free_shipping');
  const hasContent =
    storeOffers.length ||
    cartOffers.length ||
    shippingOffers.length ||
    model.paymentBenefits.length;
  if (!hasContent) return null;

  return (
    <section className="mx-2.5 mt-2 space-y-3 border-t border-slate-200 pt-3 sm:mx-3 lg:mx-0">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Ways to save</h2>
        <span className="text-[11px] text-slate-500">Final price verified at checkout</span>
      </div>
      <SavingsGroup title="Store offers" items={storeOffers} />
      <SavingsGroup title="Cart offers" items={cartOffers} />
      <SavingsGroup title="Shipping offers" items={shippingOffers} />
      <SavingsGroup title="Pay with" items={model.paymentBenefits} />
    </section>
  );
}
