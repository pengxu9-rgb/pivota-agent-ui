'use client';

import { useMemo, useState } from 'react';
import type { Offer, Variant } from '@/features/pdp/types';
import { resolveOfferPricing } from '@/features/pdp/utils/offerVariantMatching';
import { cn } from '@/lib/utils';

/**
 * Inline multi-seller picker for the Beauty mobile PDP.
 * Faithful to redesign/pivota-pdp.jsx → SellerPicker + SellerCard:
 *   "BUY FROM" eyebrow + dark "N sellers" pill, then the selected seller as a
 *   radio-style card (18px ring, --accent-50 fill when selected), then a
 *   "Compare N more sellers" toggle with a rotating chevron that reveals the
 *   rest in the same card style. Out-of-stock rows render disabled.
 *
 * Commerce logic (carried over from prior codex review): row prices use
 * variant-aware resolveOfferPricing().totalAmount so they agree with the PDP
 * headline; the primary visible card is the *selected* offer (not just the
 * recommended one) so the visible row always matches what Buy Now will use.
 */

function formatMoney(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return '';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(0)}`;
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
  return 'See details at checkout';
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

function rowPrice(offer: Offer, selectedVariant: Variant | null) {
  const pricing = resolveOfferPricing(offer, selectedVariant ?? null);
  const amount =
    typeof pricing.totalAmount === 'number' && Number.isFinite(pricing.totalAmount)
      ? pricing.totalAmount
      : typeof pricing.itemAmount === 'number' && Number.isFinite(pricing.itemAmount)
        ? pricing.itemAmount
        : offer.price?.amount;
  return formatMoney(amount, pricing.currency || offer.price?.currency);
}

function SellerCard({
  offer,
  selectedVariant,
  selected,
  tag,
  inStock,
  onClick,
}: {
  offer: Offer;
  selectedVariant: Variant | null;
  selected: boolean;
  tag: string | null;
  inStock: boolean;
  onClick: () => void;
}) {
  const merchantLabel = offer.merchant_name || offer.merchant_id || 'Seller';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!inStock}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-3 rounded-[10px] border-[1.5px] px-3.5 py-3 text-left',
        selected ? 'border-primary bg-[var(--accent-50)]' : 'border-border bg-white',
        !inStock && 'cursor-not-allowed opacity-50',
      )}
    >
      {/* radio */}
      <span
        aria-hidden="true"
        className={cn(
          'flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border-2',
          selected ? 'border-primary' : 'border-[hsl(0_0%_85%)]',
        )}
      >
        {selected ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-foreground">{merchantLabel}</span>
          {tag ? (
            <span className="flex-shrink-0 rounded-[3px] bg-accent px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-accent-foreground">
              {tag}
            </span>
          ) : null}
        </div>
        <div className="mt-px text-xs text-muted-foreground">
          {inStock ? shipLabel(offer) : 'Out of stock'}
        </div>
      </div>
      <div className="flex-shrink-0 text-[15px] font-bold text-foreground">
        {rowPrice(offer, selectedVariant)}
      </div>
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
    return bestIdx >= 0 ? bestIdx : 0;
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
    <section className="mx-[18px] mt-[22px]">
      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Buy from
        </span>
        <span className="rounded-[3px] bg-foreground px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-white">
          {inStockCount} {inStockCount === 1 ? 'seller' : 'sellers'}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <SellerCard
          offer={primary}
          selectedVariant={selectedVariant}
          selected={effectiveSelectedId === primary.offer_id}
          tag={offerTag(primary, bestPriceOfferId, primaryMerchantId)}
          inStock={offerInStock(primary)}
          onClick={() => onSelect(primary.offer_id)}
        />
        {/*
          All non-primary rows stay in the DOM regardless of `expanded`
          (collapsed via the `hidden` Tailwind utility, i.e. display:none)
          so the SSR HTML carries the full multi-seller list for crawlers
          / AI shopping agents. The display utility is applied
          conditionally — a static `flex` class would override the `hidden`
          attribute and leak the collapsed rows.
        */}
        {others.length > 0 ? (
          <div className={cn('flex-col gap-1.5', expanded ? 'flex' : 'hidden')}>
            {others.map((offer) => (
              <SellerCard
                key={offer.offer_id}
                offer={offer}
                selectedVariant={selectedVariant}
                selected={effectiveSelectedId === offer.offer_id}
                tag={offerTag(offer, bestPriceOfferId, primaryMerchantId)}
                inStock={offerInStock(offer)}
                onClick={() => onSelect(offer.offer_id)}
              />
            ))}
          </div>
        ) : null}
      </div>

      {others.length > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="mt-2 flex items-center gap-1 py-1 text-xs font-medium text-primary"
        >
          {expanded
            ? 'Hide other sellers'
            : `Compare ${others.length} more ${others.length === 1 ? 'seller' : 'sellers'}`}
          <span
            aria-hidden="true"
            className="inline-block transition-transform duration-200"
            style={{ transform: expanded ? 'rotate(-90deg)' : 'rotate(90deg)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        </button>
      ) : null}
    </section>
  );
}
