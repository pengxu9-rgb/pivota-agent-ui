/** Compact prices without discarding a currency's minor units. */
export function formatMoney(amount: number | null | undefined, currency?: string | null): string {
  if (amount == null || !Number.isFinite(amount)) return '';
  const code = currency?.trim().toUpperCase() || 'USD';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : undefined,
    }).format(amount);
  } catch {
    // Do not silently relabel an unknown currency as USD.
    return `${code} ${amount.toFixed(2)}`;
  }
}
