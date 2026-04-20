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

function itemToneClass(item: SavingsPresentationItem): string {
  if (!item.displayOnly) return 'border-emerald-300 bg-emerald-50 text-emerald-800';
  if (item.group === 'payment_benefit') return 'border-slate-200 bg-slate-50 text-slate-700';
  if (item.kind === 'free_shipping') return 'border-sky-200 bg-sky-50 text-sky-800';
  if (item.group === 'cart_unlock') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-teal-200 bg-teal-50 text-teal-800';
}

function statusLabel(item: SavingsPresentationItem): string {
  if (!item.displayOnly) return 'Applied';
  if (item.group === 'payment_benefit') return 'Estimate';
  if (item.status === 'available') return 'Checkout';
  if (item.status === 'unlockable') return 'Unlock';
  return 'Verify';
}

function supportingCopy(item: SavingsPresentationItem, progress: string | null): string | null {
  if (progress) return progress;
  if (item.group === 'payment_benefit') return 'Depends on the selected payment method.';
  if (item.kind === 'free_shipping') return 'Depends on delivery address and shipping zone.';
  if (item.status === 'unverified') return 'Verified at checkout.';
  if (item.status === 'available') return 'Eligible when checkout pricing confirms it.';
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
          const detail = supportingCopy(item, progress);
          return (
            <div key={`${item.group}-${item.id}`} className="flex items-start justify-between gap-3 text-xs">
              <div className="min-w-0">
                <div className="font-medium text-slate-900">{item.badge || item.label}</div>
                {detail ? (
                  <div className="mt-0.5 text-[11px] text-slate-500">{detail}</div>
                ) : null}
              </div>
              <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${itemToneClass(item)}`}>
                {statusLabel(item)}
              </span>
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
  const productSelectedCommerceRef = (product as any).selected_commerce_ref || (product as any).selectedCommerceRef;
  const productCommerceMerchantId = String(
    productSelectedCommerceRef?.merchant_id ||
      productSelectedCommerceRef?.merchantId ||
      product.merchant_id ||
      '',
  ).trim();
  const productCommerceProductId = String(
    productSelectedCommerceRef?.product_id ||
      productSelectedCommerceRef?.productId ||
      product.product_id ||
      '',
  ).trim();
  const selectedOfferUsesProductCommerce =
    !selectedOffer &&
    productCommerceMerchantId !== 'external_seed' &&
    Boolean(productCommerceMerchantId || productCommerceProductId);
  const storeEvidence =
    selectedOffer?.store_discount_evidence ||
    (selectedOfferUsesProductCommerce ? selectedVariant?.store_discount_evidence : undefined) ||
    (selectedOfferUsesProductCommerce ? product.store_discount_evidence : undefined);
  const paymentEvidence =
    selectedOffer?.payment_offer_evidence ||
    (selectedOfferUsesProductCommerce ? selectedVariant?.payment_offer_evidence : undefined) ||
    (selectedOfferUsesProductCommerce ? product.payment_offer_evidence : undefined);
  const paymentPricing =
    selectedOffer?.payment_pricing ||
    (selectedOfferUsesProductCommerce ? product.payment_pricing : undefined);
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
        <span className="text-[11px] text-slate-500">Charge total changes only after checkout confirms it</span>
      </div>
      <SavingsGroup title="Store offers" items={storeOffers} />
      <SavingsGroup title="Cart offers" items={cartOffers} />
      <SavingsGroup title="Shipping offers" items={shippingOffers} />
      <SavingsGroup title="Pay with" items={model.paymentBenefits} />
    </section>
  );
}
