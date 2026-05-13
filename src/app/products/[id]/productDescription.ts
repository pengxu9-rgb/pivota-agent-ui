const DEFAULT_PRODUCT_DESCRIPTION_MAX_LENGTH = 220;

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

export function buildProductDescription(
  product: Record<string, any>,
  options: { maxLength?: number } = {},
): string {
  const maxLength = options.maxLength ?? DEFAULT_PRODUCT_DESCRIPTION_MAX_LENGTH;
  const rawDescription = firstString(
    product.description,
    product.short_description,
    product.subtitle,
    product.summary,
  );
  const normalized = rawDescription.replace(/\s+/g, ' ').trim();
  const fallback = `Shop ${firstString(product.title, product.name, 'this product')} on Pivota.`;
  return (normalized || fallback).slice(0, Math.max(0, maxLength));
}
