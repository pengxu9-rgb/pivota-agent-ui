export function normalizeBrandLabel(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function slugifyBrand(value: unknown): string {
  const normalized = normalizeBrandLabel(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'brand';
}

export function buildBrandHref(args: {
  brandName: string;
  subtitle?: string | null;
  sourceProductId?: string | null;
  sourceMerchantId?: string | null;
  returnUrl?: string | null;
}): string {
  const brandName = normalizeBrandLabel(args.brandName);
  const slug = slugifyBrand(brandName);
  const params = new URLSearchParams();
  if (brandName) params.set('name', brandName);
  if (args.subtitle) params.set('subtitle', String(args.subtitle).trim());
  if (args.sourceProductId) params.set('source_product_id', String(args.sourceProductId).trim());
  if (args.sourceMerchantId) params.set('source_merchant_id', String(args.sourceMerchantId).trim());
  if (args.returnUrl) params.set('return', String(args.returnUrl));
  const query = params.toString();
  return query ? `/brands/${encodeURIComponent(slug)}?${query}` : `/brands/${encodeURIComponent(slug)}`;
}
