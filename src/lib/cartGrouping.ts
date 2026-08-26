/**
 * Cart grouping — turns the flat `CartItem[]` the store keeps into a
 * `MerchantGroup[]` shape the editorial Cart UI reads from. Re-keying by
 * `merchant_id` is what the editorial design's merchant-grouped layout +
 * sequential checkout orchestration both depend on.
 *
 * Real-data only: when a cart line lacks `merchant_name` (older persisted
 * state, or an add-to-cart caller that didn't snapshot it), the merchant id
 * itself is used as the display key. We don't invent location / shipping
 * estimate / policy copy — the editorial layout simply omits those rows
 * when the cart line doesn't carry them (cf. memory rule:
 * "Mock/synthetic data must never flow into merchant-facing prose").
 *
 * The grouping is order-preserving by first-encounter so cart re-renders are
 * stable — adding a new merchant pushes them to the end of the list, not
 * a hash-derived random position.
 */

import type { CartItem } from '@/store/cartStore';

export interface MerchantGroup {
  merchantId: string;
  merchantName: string;
  merchantLocation: string | null;
  merchantShipEstimate: string | null;
  merchantReturnPolicy: string | null;
  items: CartItem[];
  /** Sum of `price * quantity` for the group's items, in their currency. */
  subtotal: number;
  /** Total quantity (sum of `quantity` across all items). */
  itemCount: number;
  /** Three-letter currency code if all items agree; null if mixed/empty. */
  currency: string | null;
}

const FALLBACK_MERCHANT_ID = '__unknown__';

function pickMerchantId(item: CartItem): string {
  const raw = String(item.merchant_id || '').trim();
  return raw || FALLBACK_MERCHANT_ID;
}

function pickFirstNonEmpty(values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * Group a flat cart into per-merchant blocks. Insertion order is the order
 * each `merchant_id` was first encountered in the input.
 */
export function groupCartByMerchant(items: CartItem[]): MerchantGroup[] {
  const order: string[] = [];
  const byId = new Map<string, MerchantGroup>();

  for (const item of items) {
    const merchantId = pickMerchantId(item);
    let group = byId.get(merchantId);
    if (!group) {
      group = {
        merchantId,
        // Prefer name from the cart line; fall back to the merchant_id
        // itself so the UI never renders an empty house name.
        merchantName:
          pickFirstNonEmpty([item.merchant_name]) ||
          (merchantId === FALLBACK_MERCHANT_ID ? 'Other' : merchantId),
        merchantLocation: pickFirstNonEmpty([item.merchant_location]),
        merchantShipEstimate: pickFirstNonEmpty([item.merchant_ship_estimate]),
        merchantReturnPolicy: pickFirstNonEmpty([item.merchant_return_policy_label]),
        items: [],
        subtotal: 0,
        itemCount: 0,
        currency: null,
      };
      byId.set(merchantId, group);
      order.push(merchantId);
    }
    group.items.push(item);
    group.subtotal += (Number(item.price) || 0) * (Number(item.quantity) || 0);
    group.itemCount += Number(item.quantity) || 0;
    const itemCurrency = (item.currency || '').trim().toUpperCase();
    if (itemCurrency) {
      if (group.currency === null) group.currency = itemCurrency;
      else if (group.currency !== itemCurrency) group.currency = null;
    }
  }

  return order.map((id) => byId.get(id)!).filter(Boolean);
}

/** Convenience — subtotal for a single merchant group. */
export function merchantSubtotal(group: MerchantGroup): number {
  return group.subtotal;
}

/**
 * Per-merchant shipping. We don't currently persist a quoted ship cost on
 * each cart line, so this returns null until that data is wired through
 * (cart line schema extension or a quote API). The UI must render "—" for
 * null rather than synthesizing a number, per the no-fabrication rule.
 */
export function merchantShipping(_group: MerchantGroup): number | null {
  // Intentionally null — see docstring. Wiring up a real quote helper is a
  // separate follow-up that needs the checkout API to be opened up first.
  return null;
}

/**
 * Combined subtotal across all merchant groups (sum of `subtotal`).
 */
export function combinedSubtotal(groups: MerchantGroup[]): number {
  return groups.reduce((acc, group) => acc + group.subtotal, 0);
}

/** Total quantity across all groups. */
export function combinedItemCount(groups: MerchantGroup[]): number {
  return groups.reduce((acc, group) => acc + group.itemCount, 0);
}

/**
 * Currency code agreed across every group. Returns null when groups are
 * mixed-currency (UI should show "USD" or hide the per-currency label).
 */
export function combinedCurrency(groups: MerchantGroup[]): string | null {
  let seen: string | null = null;
  for (const group of groups) {
    if (!group.currency) return null;
    if (seen === null) seen = group.currency;
    else if (seen !== group.currency) return null;
  }
  return seen;
}
