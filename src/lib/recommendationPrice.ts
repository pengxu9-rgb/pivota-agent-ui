export function getPositiveFinitePrice(price: unknown): number | null {
  const amount = typeof price === 'number' ? price : Number(price);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function formatRecommendationPriceLabel(price: unknown, currency?: string): string {
  const amount = getPositiveFinitePrice(price);
  if (amount == null) return '';
  const symbol = currency && currency.toUpperCase() !== 'USD' ? `${currency.toUpperCase()} ` : '$';
  return `${symbol}${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
}

export function hasDisplayableRecommendationPrice(product: { price?: unknown } | null | undefined): boolean {
  return getPositiveFinitePrice(product?.price) != null;
}

export function filterDisplayableRecommendationProducts<T extends { price?: unknown }>(products: T[]): T[] {
  return products.filter(hasDisplayableRecommendationPrice);
}
