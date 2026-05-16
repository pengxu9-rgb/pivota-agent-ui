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
  category: string | null;
  summaryBadges: ProductSummaryBadge[];
}

/**
 * Pull the first sentence-or-clause out of a long description so we can
 * use it as an editorial highlight line on cards that lack a curated
 * `highlight` / `subtitle`. Trims at the first sentence-ending or after
 * ~160 chars, whichever comes first; returns null on empty / very short
 * input so we never surface obvious junk.
 */
function firstSentenceFromDescription(description: unknown): string | null {
  const text = String(description || '').replace(/\s+/g, ' ').trim();
  if (!text || text.length < 20) return null;
  const stop = text.search(/[.!?](\s|$)/);
  const cut = stop > 12 && stop < 160 ? stop + 1 : Math.min(160, text.length);
  return text.slice(0, cut).trim();
}

function formatCategoryLabel(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Derive the editorial card signal set from a product. Up to two
 * summary badges are surfaced (matching the legacy density). Optional
 * caps keep the card readable.
 *
 * For external_seed catalog products (the bootstrap content that
 * carries no commerce evidence yet) we fall back to: brand-derived
 * description as a highlight line, category as a chip, and a
 * "Brand-direct" attribution pill — all real-data signals so the card
 * reads with texture without inventing promo copy.
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

  // Highlight: prefer the curated highlight, then subtitle, then the
  // first clause of the brand-supplied description.
  const highlight =
    presentation.highlight ||
    presentation.subtitle ||
    firstSentenceFromDescription((product as any)?.description) ||
    null;

  // Category — comes from external_seed catalog records. Skipped silently
  // when the value duplicates the highlight (no value in repeating it).
  const rawCategory = formatCategoryLabel((product as any)?.category);
  const category =
    rawCategory && (!highlight || rawCategory.toLowerCase() !== highlight.toLowerCase())
      ? rawCategory
      : null;

  // Badge: a backend-supplied badge wins; otherwise fall back to a
  // "Brand-direct" attribution pill on external_seed records so the card
  // signals the sourcing model honestly.
  const isExternalSeed =
    String((product as any)?.source || '').trim().toLowerCase() === 'external_seed';
  const badge: EditorialProductCardSignals['badge'] = presentation.badge
    ? { label: presentation.badge, variant: 'accent' }
    : isExternalSeed
      ? { label: 'Brand-direct', variant: 'default' }
      : null;

  return {
    badge,
    highlight,
    category,
    summaryBadges: savings.map((s) => ({ label: s.label, tone: mapSavingsTone(s.tone) })),
  };
}
