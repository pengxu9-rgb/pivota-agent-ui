'use client';

import { useMemo, useState } from 'react';
import type { Offer, Variant } from '@/features/pdp/types';
import { resolveOfferPricing } from '@/features/pdp/utils/offerVariantMatching';
import { cn } from '@/lib/utils';

function formatMoney(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return '';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function offerInStock(offer: Offer): boolean {
  if (typeof offer.inventory?.in_stock === 'boolean') return offer.inventory.in_stock;
  const fallback = (offer as any).in_stock;
  if (typeof fallback === 'boolean') return fallback;
  return true;
}

function shipLabel(offer: Offer): string {
  const eta = offer.shipping?.eta_days_range;
  const method = offer.shipping?.method_label;
  if (method) return method;
  if (eta && eta.length === 2) {
    if (eta[0] === eta[1]) return `${eta[0]}-day shipping`;
    return `${eta[0]}–${eta[1]} day shipping`;
  }
  return '';
}

function offerTag(
  offer: Offer,
  bestPriceOfferId: string | null,
  primaryMerchantId: string | null,
): string | null {
  if (bestPriceOfferId && offer.offer_id === bestPriceOfferId) return 'Best value';
  if (primaryMerchantId && offer.merchant_id === primaryMerchantId) return 'Official';
  return null;
}

function SellerRow({
  offer,
  selectedVariant,
  selected,
  tag,
  inStock,
  ship,
  onClick,
}: {
  offer: Offer;
  selectedVariant: Variant | null;
  selected: boolean;
  tag: string | null;
  inStock: boolean;
  ship: string;
  onClick: () => void;
}) {
  const pricing = resolveOfferPricing(offer, selectedVariant ?? null);
  const priceAmount =
    typeof pricing.totalAmount === 'number' && Number.isFinite(pricing.totalAmount)
      ? pricing.totalAmount
      : typeof pricing.itemAmount === 'number' && Number.isFinite(pricing.itemAmount)
        ? pricing.itemAmount
        : offer.price?.amount;
  const priceCurrency = pricing.currency || offer.price?.currency;
  const price = formatMoney(priceAmount, priceCurrency);
  const merchantLabel = offer.merchant_name || offer.merchant_id || 'Seller';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!inStock}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-3 rounded-[10px] border-[1.5px] px-3.5 py-3 text-left transition-colors',
        selected
          ? 'border-primary bg-primary/10'
          : 'border-border bg-white hover:bg-muted/30',
        !inStock && 'cursor-not-allowed opacity-50',
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          'flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border-2',
          selected ? 'border-primary' : 'border-border',
        )}
      >
        {selected ? <div className="h-2 w-2 rounded-full bg-primary" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-foreground">{merchantLabel}</span>
          {tag ? (
            <span className="rounded-[3px] bg-[var(--accent-50)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-[color:var(--accent-800)]">
              {tag}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {inStock ? ship || 'See details at checkout' : 'Out of stock'}
        </div>
      </div>
      {price ? (
        <div className="flex-shrink-0 text-[15px] font-bold text-foreground">{price}</div>
      ) : null}
    </button>
  );
}

export function BeautyMobileSellerPicker({
  offers,
  selectedVariant,
  selectedOfferId,
  bestPriceOfferId,
  primaryMerchantId,
  onSelect,
}: {
  offers: Offer[];
  selectedVariant: Variant | null;
  selectedOfferId: string | null;
  bestPriceOfferId: string | null;
  primaryMerchantId: string | null;
  onSelect: (offerId: string) => void;
}) {
  const recommendedIdx = useMemo(() => {
    if (!offers.length) return -1;
    if (bestPriceOfferId) {
      const idx = offers.findIndex((o) => o.offer_id === bestPriceOfferId);
      if (idx >= 0) return idx;
    }
    let bestIdx = -1;
    let bestPrice = Number.POSITIVE_INFINITY;
    for (let i = 0; i < offers.length; i += 1) {
      const o = offers[i];
      if (!offerInStock(o)) continue;
      const pricing = resolveOfferPricing(o, selectedVariant ?? null);
      const amount =
        typeof pricing.totalAmount === 'number' && Number.isFinite(pricing.totalAmount)
          ? pricing.totalAmount
          : typeof pricing.itemAmount === 'number' && Number.isFinite(pricing.itemAmount)
            ? pricing.itemAmount
            : o.price?.amount;
      if (typeof amount === 'number' && Number.isFinite(amount) && amount < bestPrice) {
        bestPrice = amount;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) return bestIdx;
    return 0;
  }, [offers, bestPriceOfferId, selectedVariant]);

  const [expanded, setExpanded] = useState(false);

  if (!offers.length || recommendedIdx < 0) return null;

  const recommendedOffer = offers[recommendedIdx];
  const effectiveSelectedId = selectedOfferId || recommendedOffer.offer_id;
  const primaryIdx = offers.findIndex((o) => o.offer_id === effectiveSelectedId);
  const primary = primaryIdx >= 0 ? offers[primaryIdx] : recommendedOffer;
  const primaryEffectiveIdx = primaryIdx >= 0 ? primaryIdx : recommendedIdx;
  const others = offers.filter((_, i) => i !== primaryEffectiveIdx);
  const inStockCount = offers.reduce((acc, o) => acc + (offerInStock(o) ? 1 : 0), 0);

  return (
    <section className="mx-2.5 mt-4 sm:mx-3 lg:mx-0">
      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Buy from
        </span>
        <span className="rounded-[3px] bg-foreground px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-background">
          {inStockCount} {inStockCount === 1 ? 'seller' : 'sellers'}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <SellerRow
          offer={primary}
          selectedVariant={selectedVariant}
          selected={effectiveSelectedId === primary.offer_id}
          tag={offerTag(primary, bestPriceOfferId, primaryMerchantId)}
          inStock={offerInStock(primary)}
          ship={shipLabel(primary)}
          onClick={() => onSelect(primary.offer_id)}
        />
        {expanded
          ? others.map((offer) => (
              <SellerRow
                key={offer.offer_id}
                offer={offer}
                selectedVariant={selectedVariant}
                selected={effectiveSelectedId === offer.offer_id}
                tag={offerTag(offer, bestPriceOfferId, primaryMerchantId)}
                inStock={offerInStock(offer)}
                ship={shipLabel(offer)}
                onClick={() => onSelect(offer.offer_id)}
              />
            ))
          : null}
      </div>

      {others.length > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="mt-2 flex items-center gap-1 py-1 text-xs font-medium text-primary"
        >
          {expanded ? 'Hide other sellers' : `Compare ${others.length} more ${others.length === 1 ? 'seller' : 'sellers'}`}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={cn('transition-transform duration-200', expanded ? 'rotate-90' : 'rotate-0')}
            style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      ) : null}
    </section>
  );
}
