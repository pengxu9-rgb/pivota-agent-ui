'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import type { ProductResponse } from '@/lib/api';
import { resolveProductCardPresentation } from '@/lib/productCardPresentation';
import { buildProductHref } from '@/lib/productHref';
import { appendCurrentPathAsReturn } from '@/lib/returnUrl';
import {
  buildSavingsPresentation,
  getSummaryBadgeItems,
  type SavingsSummaryBadge,
  type SavingsSummaryBadgeTone,
} from '@/lib/savingsPresentation';
import { useCartStore } from '@/store/cartStore';
import { toast } from 'sonner';

function formatCatalogPrice(price: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: Number.isInteger(price) ? 0 : 2,
    }).format(price);
  } catch {
    return `$${Number(price || 0).toFixed(2)}`;
  }
}

function savingsChipClass(tone: SavingsSummaryBadgeTone): string {
  if (tone === 'applied') return 'border-emerald-300 bg-emerald-50 text-emerald-800';
  if (tone === 'store') return 'border-teal-200 bg-teal-50 text-teal-800';
  if (tone === 'unlock') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (tone === 'shipping') return 'border-sky-200 bg-sky-50 text-sky-800';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function hasEvidenceOffers(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === 'object' &&
      Array.isArray((value as any).offers) &&
      (value as any).offers.length > 0,
  );
}

function pickOfferSavingsSource(product: ProductResponse): any | null {
  const offers = Array.isArray(product.offers) ? product.offers.filter(Boolean) : [];
  if (!offers.length) return null;
  const preferredIds = [product.best_price_offer_id, product.default_offer_id]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const hasOfferSavings = (offer: any) =>
    hasEvidenceOffers(offer?.store_discount_evidence) || hasEvidenceOffers(offer?.payment_offer_evidence);

  for (const id of preferredIds) {
    const preferred = offers.find((offer: any) => String(offer?.offer_id || '').trim() === id);
    if (preferred && hasOfferSavings(preferred)) return preferred;
  }
  return offers.find((offer: any) => hasOfferSavings(offer)) || null;
}

function hasMultipleSellerOffers(product: ProductResponse): boolean {
  const sellerIds = new Set<string>();
  if (Array.isArray(product.offers)) {
    for (const offer of product.offers as any[]) {
      const merchantId = String(offer?.merchant_id || '').trim();
      if (merchantId) sellerIds.add(merchantId);
    }
  }
  if (Array.isArray(product.group_members)) {
    for (const member of product.group_members) {
      const merchantId = String(member?.merchant_id || '').trim();
      if (merchantId) sellerIds.add(merchantId);
    }
  }
  return sellerIds.size > 1 || Number(product.offers_count || 0) > 1;
}

function addMultiOfferCaution(
  badges: SavingsSummaryBadge[],
  product: ProductResponse,
): SavingsSummaryBadge[] {
  if (!badges.length || !hasMultipleSellerOffers(product)) return badges;
  const caution: SavingsSummaryBadge = {
    label: 'Offers vary by seller',
    group: 'available_store',
    source: 'store_metadata',
    tone: 'payment',
    displayOnly: true,
  };
  if (badges.length === 1) return [...badges, caution];
  return [badges[0], caution];
}

export function CatalogProductCard({ product }: { product: ProductResponse }) {
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);
  const openCart = useCartStore((state) => state.open);
  const [imageSrc, setImageSrc] = useState(product.image_url || '/placeholder.svg');

  const href = buildProductHref(product.product_id, product.merchant_id);
  const hrefWithReturn = appendCurrentPathAsReturn(href);
  const card = resolveProductCardPresentation(product);
  const offerSavingsSource = pickOfferSavingsSource(product);
  const multipleSellerOffers = hasMultipleSellerOffers(product);
  const storeDiscountEvidence = !multipleSellerOffers && hasEvidenceOffers(product.store_discount_evidence)
    ? product.store_discount_evidence
    : offerSavingsSource?.store_discount_evidence;
  const paymentOfferEvidence = !multipleSellerOffers && hasEvidenceOffers(product.payment_offer_evidence)
    ? product.payment_offer_evidence
    : offerSavingsSource?.payment_offer_evidence;
  const paymentPricing =
    !multipleSellerOffers && product.payment_pricing
      ? product.payment_pricing
      : offerSavingsSource?.payment_pricing;
  const savingsModel = buildSavingsPresentation({
    product: product as any,
    offer: offerSavingsSource,
    store_discount_evidence: storeDiscountEvidence,
    payment_offer_evidence: paymentOfferEvidence,
    payment_pricing: paymentPricing,
    pricing: { total: product.price, currency: product.currency },
    currency: product.currency,
  });
  const savingsBadges = addMultiOfferCaution(getSummaryBadgeItems(savingsModel, 2), product);
  const compactCopy = card.highlight || card.subtitle;
  const isIdentityGrouped =
    multipleSellerOffers ||
    Boolean(product.sellable_item_group_id) ||
    product.canonical_scope === 'synthetic' ||
    (Array.isArray(product.group_members) && product.group_members.length > 1);
  const isDirectCartEligible =
    !isIdentityGrouped &&
    Boolean(product.merchant_id) &&
    product.merchant_id !== 'external_seed' &&
    !product.external_redirect_url;

  useEffect(() => {
    setImageSrc(product.image_url || '/placeholder.svg');
  }, [product.image_url]);

  const handleQuickAction = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (!isDirectCartEligible) {
      router.push(hrefWithReturn);
      return;
    }

    const resolvedVariantId =
      String(product.variant_id || product.sku_id || '').trim() || product.product_id;
    const cartItemId = product.merchant_id
      ? `${product.merchant_id}:${resolvedVariantId}`
      : resolvedVariantId;

    addItem({
      id: cartItemId,
      product_id: product.product_id,
      variant_id: resolvedVariantId,
      sku: product.sku,
      title: product.title,
      price: product.price,
      currency: product.currency,
      imageUrl: imageSrc,
      merchant_id: product.merchant_id,
      quantity: 1,
    });
    openCart();
    toast.success(`Added ${product.title} to cart`);
  };

  return (
    <div className="group relative">
      <Link href={hrefWithReturn} prefetch={false} className="block h-full">
        <article className="h-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.045)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_12px_22px_rgba(15,23,42,0.07)]">
          <div className="relative aspect-[4/5] overflow-hidden bg-[#f7f3ee]">
            <Image
              src={imageSrc}
              alt={product.title}
              fill
              unoptimized
              className="object-cover transition duration-300 group-hover:scale-[1.02]"
              onError={() => {
                if (imageSrc !== '/placeholder.svg') setImageSrc('/placeholder.svg');
              }}
            />

            {card.badge ? (
              <span className="absolute left-2 top-2 rounded-md bg-white/96 px-2 py-1 text-[10px] font-semibold tracking-normal text-slate-700 shadow-sm">
                {card.badge}
              </span>
            ) : null}
          </div>

          <div className="space-y-1 p-2.5 pr-10 sm:p-3 sm:pr-10">
            <h3 className="min-h-[2.7rem] line-clamp-3 text-[12px] font-medium leading-[0.92rem] tracking-[-0.01em] text-[#202531] sm:text-[12.5px] sm:leading-[0.98rem]">
              {card.title}
            </h3>

            {compactCopy ? (
              <p className="min-h-[2rem] line-clamp-2 text-[10.5px] leading-[0.98rem] text-[#667085] sm:text-[11px] sm:leading-[1rem]">
                {compactCopy}
              </p>
            ) : null}

            <div>
              <p className="text-[14px] font-semibold tracking-[-0.015em] text-[#111827] sm:text-[14.5px]">
                {multipleSellerOffers ? 'From ' : ''}{formatCatalogPrice(product.price, product.currency)}
              </p>
            </div>
            {savingsBadges.length ? (
              <div className="flex min-h-[1.25rem] flex-wrap gap-1">
                {savingsBadges.map((badge) => (
                  <span
                    key={`${badge.tone}-${badge.label}`}
                    data-savings-tone={badge.tone}
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-4 ${savingsChipClass(badge.tone)}`}
                  >
                    {badge.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </article>
      </Link>

      <button
        type="button"
        onClick={handleQuickAction}
        className="absolute bottom-2.5 right-2.5 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e6e0d7] bg-white text-slate-700 shadow-[0_4px_12px_rgba(15,23,42,0.1)] transition hover:scale-105 hover:text-slate-950"
        aria-label={
          isDirectCartEligible ? `Quick add ${product.title}` : `View details for ${product.title}`
        }
      >
        <Plus className="h-3.25 w-3.25" />
      </button>
    </div>
  );
}

export function CatalogProductSkeleton() {
  return (
    <div className="overflow-hidden rounded-[24px] bg-white shadow-[0_8px_32px_rgba(15,23,42,0.08)] ring-1 ring-black/5">
      <div className="aspect-[4/5] animate-pulse bg-slate-100" />
      <div className="space-y-3 p-4">
        <div className="h-4 w-4/5 animate-pulse rounded-full bg-slate-100" />
        <div className="h-4 w-3/5 animate-pulse rounded-full bg-slate-100" />
        <div className="h-3 w-1/2 animate-pulse rounded-full bg-slate-100" />
        <div className="h-4 w-2/5 animate-pulse rounded-full bg-slate-100" />
      </div>
    </div>
  );
}
