import type { Variant, VariantPrice } from '@/features/pdp/types';
import {
  getDisplayVariantLabel,
  isPlaceholderVariantTitle,
} from '@/features/pdp/utils/variantLabels';
import type { ProductResponse } from '@/lib/api';

function normalizeImageUrl(value: unknown): string | undefined {
  const raw = String(value || '').trim();
  return raw || undefined;
}

function normalizeAvailableQuantity(value: unknown): number | undefined {
  if (value == null) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Math.floor(parsed));
}

function toDefaultVariant(product: ProductResponse, raw?: any): Variant {
  const currency = product.currency || 'USD';
  const availableQuantity = normalizeAvailableQuantity(
    raw?.available_quantity ??
      raw?.availableQuantity ??
      raw?.inventory_quantity ??
      raw?.inventoryQuantity ??
      raw?.quantity ??
      raw?.stock,
  );
  const inStock = availableQuantity != null ? availableQuantity > 0 : !!product.in_stock;
  return {
    variant_id: product.product_id,
    sku_id: product.product_id,
    title: 'Default',
    options: [],
    hidden_from_selector: true,
    source_quality_status: 'quarantined',
    price: { current: { amount: Number(product.price) || 0, currency } },
    availability: {
      in_stock: inStock,
      ...(availableQuantity != null ? { available_quantity: availableQuantity } : {}),
    },
    image_url: normalizeImageUrl(product.image_url),
  };
}

function toVariantPrice(input: any, currency: string): VariantPrice | undefined {
  if (!input) return undefined;
  if (typeof input === 'number' || typeof input === 'string') {
    return { current: { amount: Number(input) || 0, currency } };
  }

  const amount =
    input.amount ??
    input.current?.amount ??
    input.price ??
    input.price_amount ??
    input.value;
  const compareAt =
    input.compare_at ??
    input.compareAt ??
    input.compare_at_price ??
    input.list_price;

  return {
    current: {
      amount: Number(amount) || 0,
      currency: input.currency || currency,
    },
    ...(compareAt != null
      ? {
          compare_at: {
            amount: Number(compareAt) || 0,
            currency: input.currency || currency,
          },
        }
      : {}),
  };
}

export function buildProductVariants(product: ProductResponse, raw?: any): Variant[] {
  const currency = product.currency || 'USD';
  const rawVariants = Array.isArray(raw?.variants)
    ? raw.variants
    : Array.isArray(product.variants)
      ? product.variants
      : [];

  if (!rawVariants.length) return [toDefaultVariant(product, raw)];

  const mapped = rawVariants
    .map((variant: any, idx: number) => {
      const variantId =
        variant.variant_id || variant.id || variant.sku || variant.sku_id || `${product.product_id}-${idx + 1}`;
      const options = Array.isArray(variant.options)
        ? variant.options
        : typeof variant.options === 'object' && variant.options
          ? Object.entries(variant.options).map(([name, value]) => ({
              name,
              value: String(value),
            }))
          : [];
      const rawTitle = String(
        variant.title || variant.name || variant.option_title || variant.sku_name || '',
      ).trim();
      const title = isPlaceholderVariantTitle(rawTitle)
        ? getDisplayVariantLabel(
            {
              title: rawTitle,
              options,
            },
            '',
          )
        : rawTitle;
      const hiddenFromSelector =
        variant.hidden_from_selector === true ||
        (
          !title &&
          options.length === 0
        );

      const price =
        toVariantPrice(variant.price || variant.pricing, currency) ||
        toVariantPrice(product.price, currency);
      const availableQuantity = normalizeAvailableQuantity(
        variant.available_quantity ??
          variant.availableQuantity ??
          variant.availability?.available_quantity ??
          variant.availability?.availableQuantity ??
          variant.inventory_quantity ??
          variant.inventoryQuantity ??
          variant.quantity ??
          variant.stock,
      );
      const inStock =
        typeof variant.in_stock === 'boolean'
          ? variant.in_stock
          : typeof variant.available === 'boolean'
            ? variant.available
            : availableQuantity != null
              ? availableQuantity > 0
              : (variant.inventory_quantity || variant.quantity || 0) > 0;

      const swatchHex =
        variant.color_hex ||
        variant.swatch?.hex ||
        variant.beauty_meta?.shade_hex ||
        variant.shade_hex ||
        variant.hex;

      const beautyMeta = variant.beauty_meta || variant.beautyMeta || {
        shade_hex: variant.shade_hex || variant.shadeHex,
        finish: variant.finish,
        coverage: variant.coverage,
        undertone: variant.undertone,
      };

      return {
        variant_id: String(variantId),
        sku_id: variant.sku_id || variant.sku || variant.sku_code,
        title: String(title || rawTitle || 'Default'),
        options,
        ...(hiddenFromSelector ? { hidden_from_selector: true } : {}),
        ...(variant.source_quality_status ? { source_quality_status: String(variant.source_quality_status) } : {}),
        swatch: swatchHex ? { hex: swatchHex } : undefined,
        beauty_meta: beautyMeta,
        price,
        availability: {
          in_stock: inStock,
          ...(availableQuantity != null ? { available_quantity: availableQuantity } : {}),
        },
        image_url: normalizeImageUrl(variant.image_url || variant.image || variant.images?.[0]),
        label_image_url: normalizeImageUrl(
          variant.label_image_url ||
            variant.swatch_image_url ||
            variant.thumbnail_url ||
            variant.thumbnail ||
            variant.swatch?.image_url ||
            variant.swatch?.imageUrl,
        ),
        store_discount_evidence: variant.store_discount_evidence,
        store_discount_summary: variant.store_discount_summary,
        store_discount_badges: variant.store_discount_badges,
        payment_offer_evidence: variant.payment_offer_evidence,
        payment_offer_summary: variant.payment_offer_summary,
        payment_offer_badges: variant.payment_offer_badges,
      } satisfies Variant;
    })
    .filter(Boolean);

  return mapped.length ? mapped : [toDefaultVariant(product, raw)];
}
