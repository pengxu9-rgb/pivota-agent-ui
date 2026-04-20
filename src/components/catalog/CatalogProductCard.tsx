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
import { buildSavingsPresentation, getSummaryBadges } from '@/lib/savingsPresentation';
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

export function CatalogProductCard({ product }: { product: ProductResponse }) {
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);
  const openCart = useCartStore((state) => state.open);
  const [imageSrc, setImageSrc] = useState(product.image_url || '/placeholder.svg');

  const href = buildProductHref(product.product_id, product.merchant_id);
  const hrefWithReturn = appendCurrentPathAsReturn(href);
  const card = resolveProductCardPresentation(product);
  const savingsBadges = getSummaryBadges(
    buildSavingsPresentation({
      product: product as any,
      store_discount_evidence: product.store_discount_evidence,
      payment_offer_evidence: product.payment_offer_evidence,
      payment_pricing: product.payment_pricing,
      pricing: { total: product.price, currency: product.currency },
      currency: product.currency,
    }),
    2,
  );
  const compactCopy = card.highlight || card.subtitle;
  const isIdentityGrouped =
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
        <article className="h-full overflow-hidden rounded-[16px] border border-[#f3ede5] bg-white shadow-[0_6px_18px_rgba(15,23,42,0.045)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_22px_rgba(15,23,42,0.07)]">
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
              <span className="absolute left-2 top-2 rounded-full bg-white/96 px-2 py-1 text-[10px] font-semibold tracking-[-0.01em] text-slate-700 shadow-sm">
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
                {formatCatalogPrice(product.price, product.currency)}
              </p>
            </div>
            {savingsBadges.length ? (
              <div className="flex min-h-[1.25rem] flex-wrap gap-1">
                {savingsBadges.map((badge) => (
                  <span
                    key={badge}
                    className="rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-emerald-800"
                  >
                    {badge}
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
