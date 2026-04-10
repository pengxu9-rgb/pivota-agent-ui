import type { Offer, Variant } from '@/features/pdp/types';

function normalizeText(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeOptionEntries(value: unknown): Variant['options'] | undefined {
  if (Array.isArray(value)) {
    const entries = value
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const name = String((item as any).name || (item as any).option || (item as any).key || '').trim();
        const optionValue = String((item as any).value || (item as any).text || '').trim();
        if (!name || !optionValue) return null;
        return { name, value: optionValue };
      })
      .filter(Boolean) as NonNullable<Variant['options']>;
    return entries.length ? entries : undefined;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([name, optionValue]) => {
        const normalizedName = String(name || '').trim();
        const normalizedValue = String(optionValue || '').trim();
        if (!normalizedName || !normalizedValue) return null;
        return { name: normalizedName, value: normalizedValue };
      })
      .filter(Boolean) as NonNullable<Variant['options']>;
    return entries.length ? entries : undefined;
  }

  return undefined;
}

function normalizeVariantPrice(raw: any, fallbackCurrency: string): Variant['price'] | undefined {
  const amountRaw =
    raw?.price?.current?.amount ??
    raw?.price?.amount ??
    raw?.price_amount ??
    raw?.price;
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount)) return undefined;
  const currency =
    String(
      raw?.price?.current?.currency ||
        raw?.price?.currency ||
        raw?.currency ||
        fallbackCurrency ||
        'USD',
    ).trim() || 'USD';
  return {
    current: {
      amount,
      currency,
    },
  };
}

function normalizeVariantAvailability(raw: any): Variant['availability'] | undefined {
  const explicitInStock =
    typeof raw?.availability?.in_stock === 'boolean'
      ? raw.availability.in_stock
      : typeof raw?.in_stock === 'boolean'
        ? raw.in_stock
        : typeof raw?.available === 'boolean'
          ? raw.available
          : undefined;
  const availableQuantityRaw =
    raw?.availability?.available_quantity ??
    raw?.available_quantity ??
    raw?.inventory_quantity;
  const availableQuantity =
    availableQuantityRaw == null || availableQuantityRaw === ''
      ? undefined
      : Number.isFinite(Number(availableQuantityRaw))
        ? Math.max(0, Math.floor(Number(availableQuantityRaw)))
        : undefined;
  const inStock =
    typeof explicitInStock === 'boolean'
      ? explicitInStock
      : availableQuantity != null
        ? availableQuantity > 0
        : undefined;
  if (typeof inStock !== 'boolean') return undefined;
  return {
    in_stock: inStock,
    ...(availableQuantity != null ? { available_quantity: availableQuantity } : {}),
  };
}

function normalizeOfferVariant(raw: unknown, fallbackCurrency: string): Variant | null {
  if (!raw || typeof raw !== 'object') return null;
  const typed = raw as any;
  const variantId = String(
    typed.variant_id || typed.variantId || typed.id || '',
  ).trim();
  if (!variantId) return null;
  const options =
    normalizeOptionEntries(typed.options) ||
    normalizeOptionEntries(typed.selected_options) ||
    normalizeOptionEntries(typed.selectedOptions);
  const title =
    String(typed.title || typed.variant_title || typed.variantTitle || '').trim() ||
    (options?.map((entry) => entry.value).join(' / ') || '') ||
    variantId;
  const price = normalizeVariantPrice(typed, fallbackCurrency);
  const availability = normalizeVariantAvailability(typed);
  return {
    variant_id: variantId,
    ...(String(typed.sku_id || typed.skuId || typed.sku || '').trim()
      ? {
          sku_id: String(typed.sku_id || typed.skuId || typed.sku).trim(),
        }
      : {}),
    title,
    ...(options ? { options } : {}),
    ...(price ? { price } : {}),
    ...(availability ? { availability } : {}),
    ...(String(typed.image_url || typed.imageUrl || '').trim()
      ? { image_url: String(typed.image_url || typed.imageUrl).trim() }
      : {}),
  };
}

function buildNormalizedOptionMap(options: Variant['options'] | undefined): Record<string, string> {
  return (options || []).reduce<Record<string, string>>((acc, entry) => {
    const name = normalizeText(entry.name);
    const value = normalizeText(entry.value);
    if (!name || !value) return acc;
    acc[name] = value;
    return acc;
  }, {});
}

function optionMapsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => b[key] === a[key]);
}

function normalizeAmount(value: unknown): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

export function findMatchingOfferVariant(
  offer: Offer | null | undefined,
  targetVariant: Variant | null | undefined,
): Variant | null {
  const rawVariants = Array.isArray((offer as any)?.variants) ? ((offer as any).variants as unknown[]) : [];
  if (!rawVariants.length || !targetVariant) return null;

  const fallbackCurrency =
    String(
      offer?.price?.currency ||
        targetVariant.price?.current.currency ||
        'USD',
    ).trim() || 'USD';
  const variants = rawVariants
    .map((variant) => normalizeOfferVariant(variant, fallbackCurrency))
    .filter(Boolean) as Variant[];
  if (!variants.length) return null;

  const targetVariantId = String(targetVariant.variant_id || '').trim();
  if (targetVariantId) {
    const direct = variants.find((variant) => variant.variant_id === targetVariantId);
    if (direct) return direct;
  }

  const targetOptions = buildNormalizedOptionMap(targetVariant.options);
  if (Object.keys(targetOptions).length > 0) {
    const optionMatch = variants.find((variant) =>
      optionMapsEqual(buildNormalizedOptionMap(variant.options), targetOptions),
    );
    if (optionMatch) return optionMatch;
  }

  const targetTitle = normalizeText(targetVariant.title);
  if (targetTitle) {
    const titleMatch = variants.find((variant) => normalizeText(variant.title) === targetTitle);
    if (titleMatch) return titleMatch;
  }

  return null;
}

export function resolveOfferPricing(
  offer: Offer | null | undefined,
  targetVariant: Variant | null | undefined,
): {
  matchedVariant: Variant | null;
  itemAmount: number | null;
  shippingAmount: number;
  totalAmount: number | null;
  currency: string;
} {
  const matchedVariant = findMatchingOfferVariant(offer, targetVariant);
  const fallbackCurrency =
    String(
      matchedVariant?.price?.current.currency ||
        offer?.price?.currency ||
        targetVariant?.price?.current.currency ||
        'USD',
    ).trim() || 'USD';
  const itemAmount =
    normalizeAmount(matchedVariant?.price?.current.amount) ??
    normalizeAmount(offer?.price?.amount);
  const shippingAmount = normalizeAmount(offer?.shipping?.cost?.amount) ?? 0;
  return {
    matchedVariant,
    itemAmount,
    shippingAmount,
    totalAmount: itemAmount == null ? null : itemAmount + shippingAmount,
    currency: fallbackCurrency,
  };
}
