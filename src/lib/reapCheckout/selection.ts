// A persisted selection witness is data, never server proof or price authority.
export type ReapSelection = {
  product_key: string; variant_id: string; variant_key: string; merchant_domain: string;
  market: string; currency: string; unit_price_minor: number; quantity: number; item_source: 'cart_link';
};
const FIELDS = ['product_key', 'variant_id', 'variant_key', 'merchant_domain', 'market', 'currency', 'unit_price_minor', 'quantity', 'item_source'] as const;
export function readSelection(value: unknown): ReapSelection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== FIELDS.length || !FIELDS.every(k => Object.prototype.hasOwnProperty.call(v, k))) return null;
  const text = (k: string, max: number) => typeof v[k] === 'string' && (v[k] as string).length > 0
    && (v[k] as string).length <= max && v[k] === (v[k] as string).trim() && !/[\x00-\x1f\x7f]/.test(v[k] as string);
  if (!text('product_key', 1024) || !text('variant_key', 1024)
    || typeof v.variant_id !== 'string' || !/^[1-9][0-9]{0,24}$/.test(v.variant_id)
    || !text('merchant_domain', 255) || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/.test(v.merchant_domain as string)
    || typeof v.market !== 'string' || !/^[A-Z]{2}$/.test(v.market)
    || typeof v.currency !== 'string' || !/^[A-Z]{3}$/.test(v.currency)
    || typeof v.unit_price_minor !== 'number' || !Number.isSafeInteger(v.unit_price_minor) || v.unit_price_minor <= 0
    || typeof v.quantity !== 'number' || !Number.isSafeInteger(v.quantity) || v.quantity < 1 || v.quantity > 10
    || !Number.isSafeInteger(v.unit_price_minor * v.quantity) || v.item_source !== 'cart_link') return null;
  return Object.fromEntries(FIELDS.map(k => [k, v[k]])) as ReapSelection;
}
