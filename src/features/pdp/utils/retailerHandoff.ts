import type { Offer, Price, Variant } from '../types';

type RetailerProduct = { product_id: string; merchant_id?: string; variants?: readonly unknown[] };
type ConfirmedSelection = { variantId: string; skuId?: string; money: Price };
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
const token = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const normalized = (value: unknown): string => token(value).toLowerCase().replace(/\s+/g, ' ');

function optionMap(value: unknown): Record<string, string> | null {
  if (value == null) return {};
  if (typeof value !== 'object') return null;
  const rows = Array.isArray(value) ? value : Object.entries(record(value)).map(([name, item]) => ({ name, value: item }));
  const result: Record<string, string> = {};
  for (const row of rows) {
    const data = record(row), name = normalized(data.name), item = normalized(data.value);
    if (!name || !item || (name in result && result[name] !== item)) return null;
    result[name] = item;
  }
  return result;
}

/** Read amount and currency from one explicit price tuple. Never inherit either. */
function explicitMoney(raw: Record<string, unknown>): Price | null {
  const price = record(raw.price), current = record(price.current);
  const tuple = Object.keys(current).length ? current : price;
  const amount = tuple.amount, currency = token(tuple.currency);
  return typeof amount === 'number' && Number.isFinite(amount) && amount > 0 && /^[A-Z]{3}$/.test(currency)
    ? { amount, currency } : null;
}

/** Handoff proof is deliberately stricter than display-only variant matching. */
export function confirmedRetailerSelection(product: RetailerProduct, selected: Variant, offer?: Offer | null): ConfirmedSelection | null {
  if (selected.current_own_offer_status === 'unavailable') return null;
  const targetOptions = optionMap(selected.options);
  if (!targetOptions) return null;
  const hasOptions = Object.keys(targetOptions).length > 0;
  const source = offer ? offer.variants : product.variants;
  const rows = Array.isArray(source) ? source : [];
  const sameListing = !offer || (offer.merchant_id === product.merchant_id && offer.product_id === product.product_id);
  const candidates = rows.flatMap((value): ConfirmedSelection[] => {
    const raw = record(value), variantId = token(raw.variant_id), options = optionMap(raw.options);
    const money = explicitMoney(raw);
    if (!variantId || !options || !money || raw.current_own_offer_status === 'unavailable') return [];
    if (sameListing && variantId !== selected.variant_id) return [];
    const keys = Object.keys(options);
    const optionsMatch = hasOptions && keys.length === Object.keys(targetOptions).length && keys.every((key) => targetOptions[key] === options[key]);
    // Explicit options veto title or ID matches. Missing axes do not prove a
    // multi-option selection; titles alone never establish merchant identity.
    if (hasOptions ? !optionsMatch : (keys.length > 0 || !sameListing || variantId !== selected.variant_id)) return [];
    return [{ variantId, skuId: token(raw.sku_id) || undefined, money }];
  });
  const ownId = sameListing ? candidates.filter((candidate) => candidate.variantId === selected.variant_id) : [];
  return ownId.length === 1 ? ownId[0] : candidates.length === 1 ? candidates[0] : null;
}

/** A product link does not establish merchant support for preserving a selection. */
export function retailerReselectionNotice(product: RetailerProduct, variant: Variant, offer?: Offer | null): string | null {
  if ((product.variants?.length || 0) < 2) return null;
  const label = variant.options?.map((option) => `${option.name}: ${option.value}`).join(', ') || variant.title || variant.variant_id;
  const confirmed = confirmedRetailerSelection(product, variant, offer);
  const identity = confirmed ? `variant ${confirmed.variantId}${confirmed.skuId ? `, SKU ${confirmed.skuId}` : ''}`
    : `Pivota variant ${variant.variant_id}; retailer variant unconfirmed`;
  const price = confirmed ? ` Expected item price: ${confirmed.money.currency} ${confirmed.money.amount.toFixed(2)}.` : '';
  return `The retailer link does not confirm your selected option. Reselect ${label} on the retailer page before buying (${identity}).${price} Check the final size, currency and price there. Continue to retailer?`;
}

export function confirmRetailerHandoff(product: RetailerProduct, variant: Variant, offer?: Offer | null): boolean {
  const notice = retailerReselectionNotice(product, variant, offer);
  return !notice || window.confirm(notice);
}
