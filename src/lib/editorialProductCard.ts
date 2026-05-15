/**
 * Editorial-card derivation — turns a `ProductResponse` into the props the
 * editorial `ProductCard` needs to surface real promotional signal
 * (savings summary chips, editorial highlight line, badge) without
 * breaking the calm editorial typography.
 *
 * Wraps the existing `resolveProductCardPresentation` + `buildSavingsPresentation`
 * helpers that the legacy `CatalogProductCard` uses, so the same backend
 * fields drive both cards. Browse + Chat use this so the editorial cards
 * carry the shopping motivators the simple `image / brand / title / price`
 * shape was missing.
 */

import type { ProductResponse } from '@/lib/api';
import { resolveProductCardPresentation } from '@/lib/productCardPresentation';
import {
  buildSavingsPresentation,
  getSummaryBadgeItems,
  type SavingsSummaryBadge,
} from '@/lib/savingsPresentation';
import type {
  ProductSummaryBadge,
  ProductSummaryBadgeTone,
} from '@/components/ui/editorial/ProductCard';

function mapSavingsTone(tone: SavingsSummaryBadge['tone']): ProductSummaryBadgeTone {
  switch (tone) {
    case 'applied':
      return 'applied';
    case 'store':
      return 'store';
    case 'unlock':
      return 'unlock';
    case 'shipping':
      return 'shipping';
    case 'payment':
      return 'payment';
    default:
      return 'default';
  }
}

export interface EditorialProductCardSignals {
  badge: { label: string; variant: 'default' | 'sage' | 'accent' } | null;
  highlight: string | null;
  summaryBadges: ProductSummaryBadge[];
}

/**
 * Derive the editorial card signal set from a product. Up to two
 * summary badges are surfaced (matching the legacy density). Optional
 * caps keep the card readable.
 */
export function deriveEditorialProductCardSignals(
  product: ProductResponse,
  options?: { summaryBadgeLimit?: number },
): EditorialProductCardSignals {
  const limit = Math.max(0, Math.min(4, options?.summaryBadgeLimit ?? 2));
  const presentation = resolveProductCardPresentation(product);
  const savingsModel = buildSavingsPresentation({
    product: product as any,
    store_discount_evidence: product.store_discount_evidence,
    payment_offer_evidence: product.payment_offer_evidence,
    payment_pricing: product.payment_pricing,
    pricing: { total: product.price, currency: product.currency },
    currency: product.currency,
  });
  const savings = limit > 0 ? getSummaryBadgeItems(savingsModel, limit) : [];

  return {
    badge: presentation.badge
      ? { label: presentation.badge, variant: 'accent' }
      : null,
    highlight: presentation.highlight || presentation.subtitle || null,
    summaryBadges: savings.map((s) => ({ label: s.label, tone: mapSavingsTone(s.tone) })),
  };
}
