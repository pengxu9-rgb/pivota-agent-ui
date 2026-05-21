// Shared helper for rendering product card titles with an optional brand prefix.
// Two rules:
//   1. If the title already starts with the brand name (case-insensitive), strip
//      it from the title so we don't render "Brand · Brand Title".
//   2. Surfaces that are already brand-scoped (e.g. /brands/[slug]) can pass
//      `hideBrandPrefix` to suppress the prefix entirely.

export function stripBrandFromTitle(
  title: string,
  brand: string | null | undefined,
): string {
  if (!brand || !title) return title;
  const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stripped = title.replace(new RegExp(`^${escaped}[\\s·\\-:,]*`, 'i'), '').trim();
  return stripped || title;
}

export type FormattedProductCardTitle = {
  brandPrefix: string | null;
  title: string;
};

export function formatProductCardTitle(
  brand: unknown,
  title: unknown,
  options: { hideBrandPrefix?: boolean; extraStripBrands?: Array<string | null | undefined> } = {},
): FormattedProductCardTitle {
  const normalizedTitle = String(title || '').trim();
  const normalizedBrand = readBrandName(brand);
  // Strip both the product's own brand and any extra candidates (e.g. the
  // current brand-landing page's brand may differ in casing from product.brand).
  let cleanedTitle = normalizedTitle;
  const candidates = [normalizedBrand, ...(options.extraStripBrands || [])];
  for (const candidate of candidates) {
    cleanedTitle = stripBrandFromTitle(cleanedTitle, candidate);
  }
  if (!normalizedBrand) {
    return { brandPrefix: null, title: cleanedTitle };
  }
  return {
    brandPrefix: options.hideBrandPrefix ? null : normalizedBrand,
    title: cleanedTitle,
  };
}

// `product.brand` can be a string OR `{ name: string }` (PDP shape vs catalog).
function readBrandName(brand: unknown): string {
  if (!brand) return '';
  if (typeof brand === 'string') return brand.trim();
  if (typeof brand === 'object' && brand !== null) {
    const name = (brand as { name?: unknown }).name;
    if (typeof name === 'string') return name.trim();
  }
  return '';
}
