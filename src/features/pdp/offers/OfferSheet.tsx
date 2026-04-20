'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Offer, Variant } from '@/features/pdp/types';
import { cn } from '@/lib/utils';
import { ResponsiveSheet } from '@/features/pdp/components/ResponsiveSheet';
import { resolveOfferPricing } from '@/features/pdp/utils/offerVariantMatching';
import { buildSavingsPresentation, getSummaryBadgeItems, type SavingsSummaryBadgeTone } from '@/lib/savingsPresentation';

function formatPrice(amount: number, currency: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  const c = currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n);
  } catch {
    return `${c} ${n.toFixed(2)}`;
  }
}

function isInternalCheckoutOffer(offer: Offer): boolean {
  const offerId = String(offer?.offer_id || '').trim().toLowerCase();
  if (offerId.startsWith('of:internal_checkout:')) return true;
  const merchantId = String(offer?.merchant_id || '').trim().toLowerCase();
  return merchantId !== 'external_seed';
}

function getSellerLabel(offer: Offer): string {
  const merchantId = String(offer?.merchant_id || '').trim();
  const merchantIdLower = merchantId.toLowerCase();
  const rawCandidates = [
    (offer as any).store_name,
    (offer as any).storeName,
    offer.merchant_name,
    (offer as any).merchantName,
    (offer as any).seller_name,
    (offer as any).sellerName,
  ];
  const displayName = rawCandidates
    .map((value) => String(value || '').trim())
    .find((value) => {
      if (!value) return false;
      const normalized = value.toLowerCase();
      if (merchantIdLower && normalized === merchantIdLower) return false;
      if (['external_seed', 'external seed', 'merchant', 'seller', 'store'].includes(normalized)) {
        return false;
      }
      if (/^merch_[a-z0-9_]+$/.test(normalized)) return false;
      return true;
  });
  if (displayName) return displayName;
  return 'Unknown seller';
}

function savingsChipClass(tone: SavingsSummaryBadgeTone): string {
  if (tone === 'applied') return 'border-emerald-300 bg-emerald-50 text-emerald-800';
  if (tone === 'store') return 'border-teal-200 bg-teal-50 text-teal-800';
  if (tone === 'unlock') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (tone === 'shipping') return 'border-sky-200 bg-sky-50 text-sky-800';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

export function OfferSheet({
  open,
  offers,
  selectedOfferId,
  defaultOfferId,
  bestPriceOfferId,
  selectedVariant,
  quantity = 1,
  onSelect,
  onClose,
}: {
  open: boolean;
  offers: Offer[];
  selectedOfferId: string | null;
  defaultOfferId?: string;
  bestPriceOfferId?: string;
  selectedVariant?: Variant | null;
  quantity?: number;
  onSelect: (offerId: string) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const resolvedOffers = useMemo(
    () =>
      offers.map((offer) => ({
        offer,
        pricing: resolveOfferPricing(offer, selectedVariant),
      })),
    [offers, selectedVariant],
  );

  const sortedOffers = useMemo(() => {
    return [...resolvedOffers].sort((a, b) => {
      const aPriority = isInternalCheckoutOffer(a.offer) ? 0 : 1;
      const bPriority = isInternalCheckoutOffer(b.offer) ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      const aTotal =
        typeof a.pricing.totalAmount === 'number' && Number.isFinite(a.pricing.totalAmount)
          ? a.pricing.totalAmount
          : Number.POSITIVE_INFINITY;
      const bTotal =
        typeof b.pricing.totalAmount === 'number' && Number.isFinite(b.pricing.totalAmount)
          ? b.pricing.totalAmount
          : Number.POSITIVE_INFINITY;
      if (aTotal !== bTotal) return aTotal - bTotal;
      return String(a.offer.offer_id || '').localeCompare(String(b.offer.offer_id || ''));
    });
  }, [resolvedOffers]);
  const resolvedBestPriceOfferId = useMemo(() => {
    const ranked = resolvedOffers
      .map(({ offer, pricing }) => ({
        offerId: offer.offer_id,
        total: pricing.totalAmount,
      }))
      .filter(
        (entry): entry is { offerId: string; total: number } =>
          typeof entry.total === 'number' && Number.isFinite(entry.total),
      )
      .sort((a, b) => {
        if (a.total !== b.total) return a.total - b.total;
        if (a.offerId === bestPriceOfferId) return -1;
        if (b.offerId === bestPriceOfferId) return 1;
        return a.offerId.localeCompare(b.offerId);
      });
    return ranked[0]?.offerId || bestPriceOfferId;
  }, [bestPriceOfferId, resolvedOffers]);

  if (!mounted) return null;

  return (
    <ResponsiveSheet open={open} onClose={onClose} title="Offers">
      <div className="px-4 py-4 space-y-3">
        {sortedOffers.map(({ offer, pricing }) => {
          const isSelected = offer.offer_id === selectedOfferId;
          const isDefault = defaultOfferId && offer.offer_id === defaultOfferId;
          const isBestPrice = resolvedBestPriceOfferId && offer.offer_id === resolvedBestPriceOfferId;
          const total =
            typeof pricing.totalAmount === 'number' && Number.isFinite(pricing.totalAmount)
              ? pricing.totalAmount
              : 0;
          const itemAmount =
            typeof pricing.itemAmount === 'number' && Number.isFinite(pricing.itemAmount)
              ? pricing.itemAmount
              : 0;
          const currency = pricing.currency || offer.price.currency || 'USD';
          const eta = offer.shipping?.eta_days_range;
          const returns = offer.returns;
          const sellerLabel = getSellerLabel(offer);
          const matchedOfferVariant = pricing.matchedVariant;
          const savings = buildSavingsPresentation({
            offer: offer as any,
            variant: matchedOfferVariant as any,
            quantity,
            store_discount_evidence:
              offer.store_discount_evidence || matchedOfferVariant?.store_discount_evidence,
            payment_offer_evidence:
              offer.payment_offer_evidence || matchedOfferVariant?.payment_offer_evidence,
            payment_pricing: offer.payment_pricing,
            pricing: { total, currency },
            currency,
          });
          const savingsBadges = getSummaryBadgeItems(savings, 3);
          const hasCartValue = savings.cartUnlocks.some((item) => item.status === 'available');

          return (
            <button
              key={offer.offer_id}
              type="button"
              className={cn(
                'w-full rounded-2xl border px-4 py-3 text-left transition-colors',
                isSelected
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                  : 'border-border bg-white hover:bg-muted/30',
              )}
              onClick={() => onSelect(offer.offer_id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-sm font-semibold truncate">{sellerLabel}</div>
                    {isDefault ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        Recommended
                      </span>
                    ) : null}
                    {isBestPrice ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                        Best price
                      </span>
                    ) : null}
                    {hasCartValue ? (
                      <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Best cart value
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                    {eta?.length === 2 ? (
                      <span>
                        {offer.shipping?.method_label ? `${offer.shipping.method_label} · ` : ''}
                        {eta[0]}–{eta[1]} days
                      </span>
                    ) : null}
                    {returns?.return_window_days ? (
                      <span>
                        {returns.free_returns ? 'Free returns' : 'Returns'} · {returns.return_window_days} days
                      </span>
                    ) : null}
                  </div>
                  {offer.shipping?.cost ? (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Shipping: {formatPrice(
                        Number(offer.shipping.cost.amount) || 0,
                        offer.shipping.cost.currency || currency,
                      )}
                    </div>
                  ) : null}
                  {savingsBadges.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {savingsBadges.map((badge) => (
                        <span
                          key={`${badge.tone}-${badge.label}`}
                          className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${savingsChipClass(badge.tone)}`}
                        >
                          {badge.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold">{formatPrice(total, currency)}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Item: {formatPrice(itemAmount, currency)}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </ResponsiveSheet>
  );
}
