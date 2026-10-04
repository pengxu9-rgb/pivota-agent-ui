export function reviewScopeText(scope?: string): string {
  if (scope === 'product_line') return 'Product-line reviews; may include other sizes or versions';
  if (scope === 'exact_item') return 'Reviews for this exact item';
  return 'Review scope not provided';
}
